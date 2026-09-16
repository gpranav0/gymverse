const crypto = require('crypto');
const db = require('../config/database');
const { hashPassword, matchPassword } = require('../utils/password');
const { generateToken } = require('../utils/jwt');
const { AppError } = require('../utils/AppError');
const { issueToken, consumeToken } = require('../utils/authTokens');
const { passwordResetEmail, verificationEmail, appUrl } = require('../services/emailService');
const { withTransaction } = require('../utils/transaction');

// A real bcrypt hash of a value nobody can supply. Comparing against it when the email
// is unknown keeps the failing path the same cost as the succeeding one.
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

const ACCOUNT_STATUS_MESSAGES = {
  pending: 'Account pending admin approval',
  suspended: 'Account is suspended',
  rejected: 'Account registration was rejected'
};

// Signup collides on more than the email, and the generic 23505 handler in
// errorMiddleware flattens all of them to "That record already exists" — which leaves a
// user with a duplicate phone number retyping their email forever. Name the field.
//
// Self-serve registration cannot hide that an address is taken without an
// email-verification step this project does not have, so these messages do disclose
// existence. That is bounded by authLimiter (10 attempts / 15 min / IP); the login path
// stays strictly non-disclosing, which is where it actually matters.
const SIGNUP_CONFLICTS = {
  users_email_key: 'An account with that email already exists',
  users_username_key: 'That username is taken',
  members_email_key: 'An account with that email already exists',
  members_phone_key: 'An account with that phone number already exists',
  trainers_email_key: 'An account with that email already exists',
  trainers_phone_key: 'An account with that phone number already exists'
};

// Off by default so the app works without an SMTP server; turn on once mail is configured.
const verificationRequired = () => process.env.REQUIRE_EMAIL_VERIFICATION === 'true';

// member_code / trainer_code for a self-registered account. Date.now() alone collided when
// two people signed up in the same millisecond, and that unique violation reached the user
// as "An account with those details already exists".
const recordCode = (prefix) => `${prefix}${Date.now()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

// Recovery endpoints answer identically whether or not the address is registered.
const GENERIC_RECOVERY_REPLY = 'If an account exists for that email, we have sent a link to it.';

const sendVerification = async (clientOrPool, user) => {
  const token = await issueToken(clientOrPool, user.user_id, 'email_verification');
  return { token, send: () => verificationEmail(user.email, user.name, appUrl(`/verify-email?token=${encodeURIComponent(token)}`)) };
};

// @desc    Register a new user (and potentially link to member/trainer)
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res, next) => {
  try {
    const { username, email, password, role_name, name, phone, specialization, qualification } = req.body;

    const targetRole = role_name;
    if (targetRole !== 'member' && targetRole !== 'trainer') {
      throw new AppError('Forbidden: Public registration is restricted to members and trainers only.', 403);
    }

    // bcrypt is slow on purpose, so hash before taking a pooled connection, not while holding one.
    const hashed = await hashPassword(password);
    const status = targetRole === 'member' ? 'active' : 'pending';

    const { user, memberId, verification } = await withTransaction(async (client) => {
      const roleResult = await client.query('SELECT role_id FROM roles WHERE role_name = $1', [targetRole]);
      if (roleResult.rows.length === 0) {
        throw new AppError('Invalid role specified', 400);
      }
      const roleId = roleResult.rows[0].role_id;

      let newMemberId = null;
      let trainerId = null;

      if (targetRole === 'member') {
        const memberResult = await client.query(
          'INSERT INTO members (member_code, member_name, phone, email, status) VALUES ($1, $2, $3, $4, $5) RETURNING member_id',
          [recordCode('MEM'), name, phone, email, 'active']
        );
        newMemberId = memberResult.rows[0].member_id;
      } else {
        const trainerResult = await client.query(
          'INSERT INTO trainers (trainer_code, trainer_name, phone, email, specialization, qualification, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING trainer_id',
          [recordCode('TRN'), name, phone, email, specialization || null, qualification || null, 'inactive']
        );
        trainerId = trainerResult.rows[0].trainer_id;
      }

      const { rows: [created] } = await client.query(
        'INSERT INTO users (username, email, password_hash, role_id, member_id, trainer_id, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING user_id, username, email, token_version',
        [username, email, hashed, roleId, newMemberId, trainerId, status]
      );

      // The verification token is created in the same transaction as the account, so an
      // account can never exist without a way to verify it.
      return { user: created, memberId: newMemberId, verification: await sendVerification(client, { ...created, name }) };
    });

    // The account is committed, so a mail problem must not turn this signup into an error
    // response; the user can ask for a fresh link. Not awaited, like the other auth mails.
    Promise.resolve(verification.send())
      .catch((err) => console.error('Verification email failed:', err.message));

    if (status === 'pending') {
      return res.status(201).json({
        success: true,
        message: 'Registered successfully. Awaiting admin approval.',
        data: null
      });
    }

    if (verificationRequired()) {
      return res.status(201).json({
        success: true,
        message: 'Account created. Check your email to confirm your address, then sign in.',
        data: null
      });
    }

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        role: targetRole,
        member_id: memberId,
        email_verified: false,
        token: generateToken(user.user_id, targetRole, user.token_version ?? 0)
      }
    });
  } catch (error) {
    // The unique indexes are the real check. A pre-flight SELECT outside the transaction
    // only looked like one: two simultaneous signups both passed it and the second still
    // died here, so the query bought nothing but a race.
    if (error.code === '23505') {
      return next(new AppError(
        SIGNUP_CONFLICTS[error.constraint] || 'An account with those details already exists',
        409
      ));
    }
    next(error);
  }
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const result = await db.query(
      'SELECT u.*, r.role_name as role FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.email = $1',
      [email]
    );

    const user = result.rows[0];

    // Always run a bcrypt comparison, even when the email is unknown. Returning early
    // for a missing user made the two cases distinguishable by response time, which is
    // enough to enumerate registered addresses.
    const isMatch = await matchPassword(
      password,
      user ? user.password_hash : DUMMY_HASH
    );

    if (!user || !isMatch) {
      throw new AppError('Invalid email or password', 401);
    }

    // Account state is only disclosed once the password has been proven. Checking it
    // first told an attacker which addresses were registered and in what state,
    // without any credential at all.
    if (user.status !== 'active') {
      throw new AppError(ACCOUNT_STATUS_MESSAGES[user.status] || 'Account is inactive', 403);
    }

    if (verificationRequired() && !user.email_verified_at) {
      throw new AppError('Please confirm your email address before signing in. You can request a new link from the sign-in page.', 403);
    }

    // A failed last_login write must not fail the login itself.
    db.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE user_id = $1', [user.user_id])
      .catch((err) => console.error('Failed to record last_login:', err.message));

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        role: user.role,
        member_id: user.member_id,
        trainer_id: user.trainer_id,
        email_verified: !!user.email_verified_at,
        token: generateToken(user.user_id, user.role, user.token_version ?? 0)
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res, next) => {
  try {
    const { token_version: _tv, email_verified_at, ...user } = req.user;
    res.status(200).json({
      success: true,
      data: { ...user, email_verified: !!email_verified_at }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Sign out. By default ends only this session; { everywhere: true } ends them all.
// @route   POST /api/auth/logout
// @access  Private
const logoutUser = async (req, res, next) => {
  try {
    if (req.body?.everywhere === true) {
      await db.query('UPDATE users SET token_version = token_version + 1 WHERE user_id = $1', [req.user.user_id]);
      return res.status(200).json({ success: true, message: 'Signed out of all devices.' });
    }

    const { jti, exp } = req.auth || {};
    if (jti) {
      await db.query(
        `INSERT INTO revoked_tokens (jti, user_id, expires_at)
         VALUES ($1, $2, to_timestamp($3)) ON CONFLICT (jti) DO NOTHING`,
        [jti, req.user.user_id, exp || Math.floor(Date.now() / 1000) + 86400]
      );
    } else {
      // A token from before per-session ids existed can only be revoked by ending all.
      await db.query('UPDATE users SET token_version = token_version + 1 WHERE user_id = $1', [req.user.user_id]);
    }
    res.status(200).json({ success: true, message: 'Logged out successfully.' });
  } catch (error) {
    next(error);
  }
};

// @desc    Change password while signed in. Ends every other session.
// @route   POST /api/auth/change-password
// @access  Private
const changePassword = async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;
    const { rows } = await db.query('SELECT password_hash FROM users WHERE user_id = $1', [req.user.user_id]);
    if (!rows[0] || !(await matchPassword(current_password, rows[0].password_hash))) {
      throw new AppError('Current password is incorrect', 400);
    }
    if (current_password === new_password) {
      throw new AppError('Choose a password different from your current one', 400);
    }

    const updated = await db.query(
      `UPDATE users SET password_hash = $1, token_version = token_version + 1
       WHERE user_id = $2 RETURNING token_version`,
      [await hashPassword(new_password), req.user.user_id]
    );

    // Every other session is now invalid; hand this one a fresh token so it continues.
    res.status(200).json({
      success: true,
      message: 'Password changed. Other devices have been signed out.',
      data: { token: generateToken(req.user.user_id, req.user.role, updated.rows[0].token_version) }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Email a password-reset link
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT user_id, email FROM users WHERE email = $1 AND status IN ('active', 'pending')`,
      [req.body.email]
    );
    if (rows[0]) {
      const token = await issueToken(db, rows[0].user_id, 'password_reset');
      // Not awaited: the reply must take the same time whether or not a mail is sent.
      passwordResetEmail(rows[0].email, appUrl(`/reset-password?token=${encodeURIComponent(token)}`))
        .catch((err) => console.error('Password reset email failed:', err.message));
    }
    res.status(200).json({ success: true, message: GENERIC_RECOVERY_REPLY });
  } catch (error) {
    next(error);
  }
};

// @desc    Set a new password with a reset link. Ends every session.
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = async (req, res, next) => {
  try {
    // Hashed before the transaction, so the token row locked below is not held for the
    // length of a bcrypt round.
    const passwordHash = await hashPassword(req.body.password);

    await withTransaction(async (client) => {
      const userId = await consumeToken(client, req.body.token, 'password_reset');
      if (!userId) {
        throw new AppError('This reset link is invalid or has expired. Request a new one.', 400);
      }

      // Following an emailed link proves control of the address, so it also verifies it.
      await client.query(
        `UPDATE users SET password_hash = $1, token_version = token_version + 1,
                email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP)
         WHERE user_id = $2`,
        [passwordHash, userId]
      );
    });

    res.status(200).json({ success: true, message: 'Password updated. You can now sign in.' });
  } catch (error) {
    next(error);
  }
};

// @desc    Confirm an email address
// @route   POST /api/auth/verify-email
// @access  Public
const verifyEmail = async (req, res, next) => {
  try {
    await withTransaction(async (client) => {
      const userId = await consumeToken(client, req.body.token, 'email_verification');
      if (!userId) {
        throw new AppError('This confirmation link is invalid or has expired. Request a new one.', 400);
      }
      await client.query(
        'UPDATE users SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP) WHERE user_id = $1',
        [userId]
      );
    });
    res.status(200).json({ success: true, message: 'Email address confirmed.' });
  } catch (error) {
    next(error);
  }
};

// @desc    Send a fresh email-confirmation link
// @route   POST /api/auth/resend-verification
// @access  Public (a user who must verify before signing in cannot be signed in)
const resendVerification = async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT u.user_id, u.email, COALESCE(m.member_name, t.trainer_name) AS name
       FROM users u
       LEFT JOIN members m ON m.member_id = u.member_id
       LEFT JOIN trainers t ON t.trainer_id = u.trainer_id
       WHERE u.email = $1 AND u.email_verified_at IS NULL AND u.status IN ('active', 'pending')`,
      [req.body.email]
    );
    if (rows[0]) {
      const { send } = await sendVerification(db, rows[0]);
      send().catch((err) => console.error('Verification email failed:', err.message));
    }
    res.status(200).json({ success: true, message: GENERIC_RECOVERY_REPLY });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerUser,
  loginUser,
  getMe,
  logoutUser,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification
};

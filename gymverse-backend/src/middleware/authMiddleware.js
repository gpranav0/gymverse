const { verifyToken } = require('../utils/jwt');
const db = require('../config/database');

const USER_QUERY = `
  SELECT u.user_id, u.username, u.email, r.role_name as role, u.member_id, u.trainer_id,
         u.token_version, u.email_verified_at,
         EXISTS (SELECT 1 FROM revoked_tokens rt WHERE rt.jti = $2) AS revoked
  FROM users u
  JOIN roles r ON u.role_id = r.role_id
  WHERE u.user_id = $1 AND u.status = 'active'`;

const extractToken = (req) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
};

/**
 * Loads the account behind a token.
 * Returns { user, claims } when usable, or { user: null, reason } explaining why not:
 *   'missing' no/blank token, 'inactive' account gone or not active,
 *   'revoked' this session was signed out, or every session was (token_version bump).
 * Throws for tokens that fail verification (expired, bad signature, malformed).
 */
const resolveUser = async (req) => {
  const token = extractToken(req);
  if (!token) return { user: null, reason: 'missing' };

  const claims = verifyToken(token);
  const result = await db.query(USER_QUERY, [claims.userId, claims.jti || null]);
  const row = result.rows[0];
  if (!row) return { user: null, reason: 'inactive' };

  // Tokens issued before the version column existed carry no tv; they belong to version 0.
  if (row.revoked || (claims.tv ?? 0) !== (row.token_version ?? 0)) {
    return { user: null, reason: 'revoked' };
  }

  const { revoked, ...user } = row;
  return { user, claims };
};

const requireAuth = async (req, res, next) => {
  if (!extractToken(req)) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token' });
  }

  try {
    const { user, claims, reason } = await resolveUser(req);

    if (!user) {
      const message = reason === 'revoked'
        ? 'Your session has ended. Please sign in again.'
        : 'Not authorized, user not found or inactive';
      return res.status(401).json({ success: false, message });
    }

    req.user = user;
    req.auth = { jti: claims.jti || null, exp: claims.exp || null };
    next();
  } catch (error) {
    // Expiry is routine and should not fill the log with stack traces; anything else
    // (bad signature, malformed token) is worth recording.
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Session expired, please log in again' });
    }
    if (error.name !== 'JsonWebTokenError') {
      console.error('Auth middleware error:', error.message);
    }
    return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
  }
};

/**
 * Populates req.user when a valid token is present and carries on regardless.
 *
 * The public catalogue routes need this: they must answer unauthenticated callers, but
 * staff hitting the same URL should see the staff view rather than the public one.
 */
const optionalAuth = async (req, res, next) => {
  try {
    const { user } = await resolveUser(req);
    if (user) req.user = user;
  } catch {
    // An unusable token on an optional route just means "treat this as anonymous".
  }
  next();
};

module.exports = { requireAuth, optionalAuth };

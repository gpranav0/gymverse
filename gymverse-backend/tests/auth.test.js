/**
 * Covers the login fix: account state must not be disclosed before the password has
 * been proven, and an unknown email must cost the same as a known one.
 */
jest.mock('../src/config/database', () => ({
  query: jest.fn(),
  pool: { connect: jest.fn() }
}));

// Registration now emails a confirmation link; keep real mail (and the dev outbox) out of tests.
jest.mock('../src/services/emailService', () => ({
  verificationEmail: jest.fn(),
  passwordResetEmail: jest.fn(),
  appUrl: (route) => `https://gym.example${route}`
}));

jest.mock('../src/utils/password', () => ({
  hashPassword: jest.fn(async () => 'hashed'),
  matchPassword: jest.fn()
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_for_unit_tests';

const db = require('../src/config/database');
const { matchPassword } = require('../src/utils/password');
const { loginUser } = require('../src/controllers/authController');

const makeRes = () => {
  const res = { statusCode: 200 };
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn(() => res);
  return res;
};

const activeUser = {
  user_id: 1, username: 'ada', email: 'ada@gv.com', password_hash: 'stored',
  role: 'member', member_id: 4, trainer_id: null, status: 'active'
};

const login = async (row) => {
  db.query.mockReset();
  db.query.mockResolvedValueOnce({ rows: row ? [row] : [] });
  // The last_login write is fire-and-forget; give it something to resolve with.
  db.query.mockResolvedValue({ rows: [] });
  const res = makeRes();
  const next = jest.fn();
  await loginUser({ body: { email: 'ada@gv.com', password: 'secret' } }, res, next);
  return { res, next };
};

beforeEach(() => matchPassword.mockReset());

describe('loginUser', () => {
  it('issues a token for a correct password on an active account', async () => {
    matchPassword.mockResolvedValue(true);
    const { res, next } = await login(activeUser);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data.token).toEqual(expect.any(String));
  });

  it('never returns the password hash', async () => {
    matchPassword.mockResolvedValue(true);
    const { res } = await login(activeUser);
    expect(res.json.mock.calls[0][0].data).not.toHaveProperty('password_hash');
  });

  it('rejects a wrong password with 401', async () => {
    matchPassword.mockResolvedValue(false);
    const { next } = await login(activeUser);
    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });

  it('gives an unknown email the same message as a wrong password', async () => {
    matchPassword.mockResolvedValue(false);
    const unknown = await login(null);
    matchPassword.mockResolvedValue(false);
    const wrongPass = await login(activeUser);
    expect(unknown.next.mock.calls[0][0].message).toBe(wrongPass.next.mock.calls[0][0].message);
  });

  // The timing side of enumeration: the old code returned before hashing when the email
  // was unknown, so a miss was measurably faster than a hit.
  it('still runs a password comparison for an unknown email', async () => {
    matchPassword.mockResolvedValue(false);
    await login(null);
    expect(matchPassword).toHaveBeenCalledTimes(1);
  });

  it('does not reveal that an account is pending until the password is correct', async () => {
    matchPassword.mockResolvedValue(false);
    const { next } = await login({ ...activeUser, status: 'pending' });
    expect(next.mock.calls[0][0].message).toBe('Invalid email or password');
    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });

  it('reports a pending account once the password is correct', async () => {
    matchPassword.mockResolvedValue(true);
    const { next } = await login({ ...activeUser, status: 'pending' });
    expect(next.mock.calls[0][0].message).toMatch(/pending/i);
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });

  it('reports a suspended account once the password is correct', async () => {
    matchPassword.mockResolvedValue(true);
    const { next } = await login({ ...activeUser, status: 'suspended' });
    expect(next.mock.calls[0][0].message).toMatch(/suspended/i);
  });

  it('reports a rejected account once the password is correct', async () => {
    matchPassword.mockResolvedValue(true);
    const { next } = await login({ ...activeUser, status: 'rejected' });
    expect(next.mock.calls[0][0].message).toMatch(/rejected/i);
  });

  it('refuses an unrecognised status rather than defaulting to allow', async () => {
    matchPassword.mockResolvedValue(true);
    const { next } = await login({ ...activeUser, status: 'something_new' });
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });
});

/**
 * Covers the registration fix: the unique indexes are the only real duplicate check, so
 * a 23505 has to come back as a 409 that names the field the user actually has to change.
 */
describe('registerUser', () => {
  const { registerUser } = require('../src/controllers/authController');

  const body = {
    username: 'ada', email: 'ada@gv.com', password: 'passw0rd1',
    role_name: 'member', name: 'Ada Lovelace', phone: '5550001111'
  };

  // Answers the role lookup, then hands control to `onWrite` for everything inside the
  // transaction so each test can decide which insert collides.
  const runRegister = async (onWrite) => {
    const queries = [];
    const client = {
      query: jest.fn(async (text, params) => {
        queries.push(text.trim().split('\n')[0]);
        if (text.includes('FROM roles')) return { rows: [{ role_id: 2 }] };
        if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
        return onWrite(text, params);
      }),
      release: jest.fn()
    };
    db.pool.connect.mockResolvedValue(client);

    const next = jest.fn();
    await registerUser({ body }, makeRes(), next);
    return { next, client, queries };
  };

  const uniqueViolation = (constraint) =>
    Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505', constraint
    });

  it('maps a duplicate phone to a 409 that names the phone, not the email', async () => {
    const { next } = await runRegister(() => { throw uniqueViolation('members_phone_key'); });

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(409);
    expect(err.message).toMatch(/phone/i);
    expect(err.message).not.toMatch(/email/i);
  });

  it('maps a duplicate username to a 409 that names the username', async () => {
    const { next } = await runRegister(() => { throw uniqueViolation('users_username_key'); });

    expect(next.mock.calls[0][0].statusCode).toBe(409);
    expect(next.mock.calls[0][0].message).toMatch(/username/i);
  });

  it('falls back to a generic 409 for a constraint it does not recognise', async () => {
    const { next } = await runRegister(() => { throw uniqueViolation('some_future_key'); });

    expect(next.mock.calls[0][0].statusCode).toBe(409);
    expect(next.mock.calls[0][0].message).toMatch(/already exists/i);
  });

  it('rolls back and releases the client when an insert collides', async () => {
    const { client, queries } = await runRegister(() => { throw uniqueViolation('users_email_key'); });

    expect(queries).toContain('ROLLBACK');
    expect(queries).not.toContain('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('does not pre-check for duplicates outside the transaction', async () => {
    // The old SELECT ... WHERE email = $1 OR username = $2 ran before BEGIN, so two
    // concurrent signups both passed it. Only the index decides now.
    const { queries } = await runRegister(() => ({ rows: [{ member_id: 7, user_id: 9, username: 'ada', email: 'ada@gv.com' }] }));

    expect(queries.some((q) => /SELECT user_id FROM users WHERE email/.test(q))).toBe(false);
    expect(queries).toContain('COMMIT');
  });
});

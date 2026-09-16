/**
 * Route tests for the production-readiness features: session revocation, password and
 * email flows, trainer rosters, schedule management, staff-only attendance, payment
 * auditing, real dashboards and on-demand maintenance. The database is mocked.
 */
process.env.JWT_SECRET = 'test_secret_for_feature_routes';
process.env.NODE_ENV = 'test';
process.env.RECOVERY_RATE_LIMIT = '1000';

jest.mock('../src/config/database', () => ({ query: jest.fn(), pool: { connect: jest.fn(), end: jest.fn() } }));
jest.mock('../src/services/aiService', () => ({ generateChatResponse: jest.fn() }));
jest.mock('../src/services/emailService', () => ({
  passwordResetEmail: jest.fn(),
  verificationEmail: jest.fn(),
  sendMail: jest.fn(),
  appUrl: (route) => `https://gym.example${route}`,
}));
jest.mock('../src/jobs/maintenance', () => ({ runMaintenance: jest.fn(), startMaintenance: jest.fn() }));

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const db = require('../src/config/database');
const email = require('../src/services/emailService');
const maintenance = require('../src/jobs/maintenance');
const app = require('../src/app');
const { generateToken } = require('../src/utils/jwt');
const { chatCache } = require('../src/controllers/chatController');

const USERS = {
  admin: { user_id: 1, role: 'admin', member_id: null, trainer_id: null },
  receptionist: { user_id: 2, role: 'receptionist', member_id: null, trainer_id: null },
  trainer: { user_id: 3, role: 'trainer', member_id: null, trainer_id: 9 },
  member: { user_id: 4, role: 'member', member_id: 5, trainer_id: null },
};
const tokenFor = (who, tv = 0) => generateToken(USERS[who].user_id, USERS[who].role, tv);
const bearer = (token) => ['Authorization', `Bearer ${token}`];
const as = (who) => bearer(tokenFor(who));
// The first query of any authenticated request is the middleware's account lookup.
const authAs = (who, overrides = {}) => db.query.mockResolvedValueOnce({
  rows: [{ username: who, email: `${who}@gv.test`, token_version: 0, email_verified_at: new Date(), revoked: false, ...USERS[who], ...overrides }],
});
const sqlCalls = (mock) => mock.mock.calls.map(([sql, params]) => ({ sql: String(sql), params }));
const findCall = (mock, fragment) => sqlCalls(mock).find((c) => c.sql.includes(fragment));
const statements = (mock) => sqlCalls(mock).map((c) => c.sql.trim());
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// A transaction client whose answers are chosen by SQL fragment, first match wins.
const fakeClient = (routes = []) => {
  const client = {
    query: jest.fn(async (sql, params) => {
      const text = String(sql);
      for (const [fragment, answer] of routes) {
        if (text.includes(fragment)) return typeof answer === 'function' ? answer(params) : answer;
      }
      return { rows: [], rowCount: 0 };
    }),
    release: jest.fn(),
  };
  db.pool.connect.mockResolvedValue(client);
  return client;
};

beforeEach(() => {
  db.query.mockReset();
  db.query.mockResolvedValue({ rows: [], rowCount: 0 });
  db.pool.connect.mockReset();
  email.passwordResetEmail.mockResolvedValue({ delivered: true });
  email.verificationEmail.mockResolvedValue({ delivered: true });
});
afterAll(() => chatCache.close());

// ------------------------------------------------------------------ sessions
describe('session revocation', () => {
  it('rejects a token whose session was signed out', async () => {
    authAs('member', { revoked: true });
    const res = await request(app).get('/api/auth/me').set(...as('member'));
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/session has ended/i);
  });

  it('rejects tokens issued before a sign-out-everywhere', async () => {
    authAs('member', { token_version: 2 });
    const res = await request(app).get('/api/auth/me').set(...bearer(tokenFor('member', 1)));
    expect(res.status).toBe(401);
  });

  it('looks the session up by the token id', async () => {
    authAs('member');
    const token = tokenFor('member');
    await request(app).get('/api/auth/me').set(...bearer(token));
    expect(db.query.mock.calls[0][1]).toEqual([4, jwt.decode(token).jti]);
  });

  it('/auth/me reports verification and hides internal columns', async () => {
    authAs('member');
    const res = await request(app).get('/api/auth/me').set(...as('member'));
    expect(res.body.data.email_verified).toBe(true);
    expect(res.body.data).not.toHaveProperty('token_version');
    expect(res.body.data).not.toHaveProperty('revoked');
  });

  it('logout revokes only the current token', async () => {
    authAs('member');
    const token = tokenFor('member');
    const res = await request(app).post('/api/auth/logout').set(...bearer(token)).send({});
    expect(res.status).toBe(200);
    const insert = findCall(db.query, 'INSERT INTO revoked_tokens');
    expect(insert.params).toEqual([jwt.decode(token).jti, 4, jwt.decode(token).exp]);
    expect(findCall(db.query, 'token_version = token_version + 1')).toBeUndefined();
  });

  it('logout everywhere bumps the token version instead', async () => {
    authAs('member');
    const res = await request(app).post('/api/auth/logout').set(...as('member')).send({ everywhere: true });
    expect(res.status).toBe(200);
    expect(findCall(db.query, 'token_version = token_version + 1').params).toEqual([4]);
    expect(findCall(db.query, 'INSERT INTO revoked_tokens')).toBeUndefined();
  });

  it('rejects a non-boolean everywhere flag', async () => {
    authAs('member');
    const res = await request(app).post('/api/auth/logout').set(...as('member')).send({ everywhere: 'yes' });
    expect(res.status).toBe(422);
  });
});

// ------------------------------------------------------------------ passwords
describe('change password', () => {
  const hash = bcrypt.hashSync('OldPass123', 4);

  it('refuses a wrong current password', async () => {
    authAs('member');
    db.query.mockResolvedValueOnce({ rows: [{ password_hash: hash }] });
    const res = await request(app).post('/api/auth/change-password').set(...as('member'))
      .send({ current_password: 'Wrong1234', new_password: 'NewPass123' });
    expect(res.status).toBe(400);
    expect(findCall(db.query, 'SET password_hash')).toBeUndefined();
  });

  it('stores the new hash, ends other sessions and returns a token for this one', async () => {
    authAs('member');
    db.query.mockResolvedValueOnce({ rows: [{ password_hash: hash }] }).mockResolvedValueOnce({ rows: [{ token_version: 1 }] });
    const res = await request(app).post('/api/auth/change-password').set(...as('member'))
      .send({ current_password: 'OldPass123', new_password: 'NewPass123' });
    expect(res.status).toBe(200);
    const update = findCall(db.query, 'SET password_hash');
    expect(update.sql).toMatch(/token_version = token_version \+ 1/);
    expect(bcrypt.compareSync('NewPass123', update.params[0])).toBe(true);
    expect(jwt.decode(res.body.data.token).tv).toBe(1);
  });

  it('applies the password policy to the new password', async () => {
    authAs('member');
    const res = await request(app).post('/api/auth/change-password').set(...as('member'))
      .send({ current_password: 'OldPass123', new_password: 'short' });
    expect(res.status).toBe(422);
  });
});

describe('forgot password', () => {
  it('answers the same for an unknown address and sends nothing', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account exists/i);
    expect(findCall(db.query, 'INSERT INTO auth_tokens')).toBeUndefined();
    expect(email.passwordResetEmail).not.toHaveBeenCalled();
  });

  it('stores only a hash of the token and emails the raw link', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 4, email: 'm@example.com' }] });
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'm@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account exists/i);
    expect(findCall(db.query, 'UPDATE auth_tokens SET used_at')).toBeDefined();
    const [userId, purpose, storedHash] = findCall(db.query, 'INSERT INTO auth_tokens').params;
    expect([userId, purpose]).toEqual([4, 'password_reset']);
    const raw = new URL(email.passwordResetEmail.mock.calls[0][1]).searchParams.get('token');
    expect(storedHash).toBe(sha256(raw));
    expect(storedHash).not.toContain(raw);
  });
});

describe('reset password', () => {
  const token = 'x'.repeat(43);

  it('rejects an unknown or expired link and rolls back', async () => {
    const client = fakeClient([['UPDATE auth_tokens', { rows: [] }]]);
    const res = await request(app).post('/api/auth/reset-password').send({ token, password: 'NewPass123' });
    expect(res.status).toBe(400);
    expect(statements(client.query)).toContain('ROLLBACK');
    expect(findCall(client.query, 'UPDATE users')).toBeUndefined();
  });

  it('consumes the link atomically, sets the password, ends every session and verifies the email', async () => {
    const client = fakeClient([['UPDATE auth_tokens', { rows: [{ user_id: 4 }] }]]);
    const res = await request(app).post('/api/auth/reset-password').send({ token, password: 'NewPass123' });
    expect(res.status).toBe(200);
    const consume = findCall(client.query, 'UPDATE auth_tokens');
    expect(consume.params).toEqual([sha256(token), 'password_reset']);
    expect(consume.sql).toMatch(/used_at IS NULL AND expires_at > CURRENT_TIMESTAMP/);
    const update = findCall(client.query, 'UPDATE users');
    expect(update.sql).toMatch(/token_version = token_version \+ 1/);
    expect(update.sql).toMatch(/email_verified_at/);
    expect(update.params[1]).toBe(4);
    expect(statements(client.query)).toContain('COMMIT');
  });

  it('validates the new password', async () => {
    const res = await request(app).post('/api/auth/reset-password').send({ token, password: 'abc' });
    expect(res.status).toBe(422);
  });
});

// ------------------------------------------------------------------ email confirmation
describe('email confirmation', () => {
  const body = { username: 'newbie', email: 'new@example.com', password: 'NewPass123', role_name: 'member', name: 'New Member', phone: '5550001111' };
  const registerClient = () => fakeClient([
    ['FROM roles', { rows: [{ role_id: 2 }] }],
    ['INSERT INTO members', { rows: [{ member_id: 60 }] }],
    ['INSERT INTO users', { rows: [{ user_id: 70, username: 'newbie', email: 'new@example.com', token_version: 0 }] }],
  ]);

  it('registration creates the token inside the signup transaction and emails it', async () => {
    const client = registerClient();
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(201);
    expect(res.body.data.token).toBeTruthy();
    const order = statements(client.query);
    const tokenAt = order.findIndex((s) => s.includes('INSERT INTO auth_tokens'));
    expect(tokenAt).toBeGreaterThan(order.indexOf('BEGIN'));
    expect(tokenAt).toBeLessThan(order.indexOf('COMMIT'));
    expect(email.verificationEmail).toHaveBeenCalledWith('new@example.com', 'New Member', expect.stringContaining('/verify-email?token='));
  });

  it('withholds the session token when confirmation is required', async () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
    try {
      registerClient();
      const res = await request(app).post('/api/auth/register').send(body);
      expect(res.status).toBe(201);
      expect(res.body.data).toBeNull();
      expect(res.body.message).toMatch(/check your email/i);
    } finally {
      delete process.env.REQUIRE_EMAIL_VERIFICATION;
    }
  });

  it('blocks sign-in until the email is confirmed when required', async () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
    try {
      db.query.mockResolvedValueOnce({ rows: [{ user_id: 4, role: 'member', status: 'active', email_verified_at: null, token_version: 0, password_hash: bcrypt.hashSync('OldPass123', 4) }] });
      const res = await request(app).post('/api/auth/login').send({ email: 'm@example.com', password: 'OldPass123' });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/confirm your email/i);
    } finally {
      delete process.env.REQUIRE_EMAIL_VERIFICATION;
    }
  });

  it('lets unconfirmed users sign in when confirmation is not required', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 4, role: 'member', status: 'active', email_verified_at: null, token_version: 0, password_hash: bcrypt.hashSync('OldPass123', 4) }] });
    const res = await request(app).post('/api/auth/login').send({ email: 'm@example.com', password: 'OldPass123' });
    expect(res.status).toBe(200);
    expect(res.body.data.email_verified).toBe(false);
  });

  it('confirms an address with a valid link', async () => {
    const client = fakeClient([['UPDATE auth_tokens', { rows: [{ user_id: 4 }] }]]);
    const res = await request(app).post('/api/auth/verify-email').send({ token: 'v'.repeat(43) });
    expect(res.status).toBe(200);
    expect(findCall(client.query, 'SET email_verified_at').params).toEqual([4]);
  });

  it('rejects a spent confirmation link', async () => {
    fakeClient([['UPDATE auth_tokens', { rows: [] }]]);
    const res = await request(app).post('/api/auth/verify-email').send({ token: 'v'.repeat(43) });
    expect(res.status).toBe(400);
  });

  it('resend is silent for unknown or already-confirmed addresses', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/api/auth/resend-verification').send({ email: 'x@example.com' });
    expect(res.status).toBe(200);
    expect(email.verificationEmail).not.toHaveBeenCalled();
  });

  it('resend emails a fresh link to an unconfirmed account', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 4, email: 'm@example.com', name: 'Mo' }] });
    const res = await request(app).post('/api/auth/resend-verification').send({ email: 'm@example.com' });
    expect(res.status).toBe(200);
    expect(email.verificationEmail).toHaveBeenCalledWith('m@example.com', 'Mo', expect.stringContaining('/verify-email?token='));
  });
});

// ------------------------------------------------------------------ trainer assignments
describe('trainer assignments', () => {
  const assignmentRow = { assignment_id: 77, member_id: 5, trainer_id: 9, status: 'active' };

  it('only staff may create one', async () => {
    authAs('trainer');
    const res = await request(app).post('/api/trainer-assignments').set(...as('trainer')).send({ member_id: 5, trainer_id: 9 });
    expect(res.status).toBe(403);
  });

  it('scopes a trainer to their own roster, ignoring a trainer_id filter', async () => {
    authAs('trainer');
    db.query.mockResolvedValueOnce({ rows: [{ count: '0' }] }).mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/trainer-assignments?trainer_id=1').set(...as('trainer'));
    expect(res.status).toBe(200);
    const list = findCall(db.query, 'ORDER BY ta.status');
    expect(list.sql).toMatch(/ta\.trainer_id = \$2/);
    expect(list.params.slice(0, 2)).toEqual(['active', 9]);
  });

  it('scopes a member to their own trainers', async () => {
    authAs('member');
    db.query.mockResolvedValueOnce({ rows: [{ count: '0' }] }).mockResolvedValueOnce({ rows: [] });
    await request(app).get('/api/trainer-assignments?status=all').set(...as('member'));
    const list = findCall(db.query, 'ORDER BY ta.status');
    expect(list.sql).toMatch(/ta\.member_id = \$1/);
    expect(list.params[0]).toBe(5);
  });

  it('creates an assignment and audits it in the same transaction', async () => {
    authAs('receptionist');
    const client = fakeClient([
      ['FROM members', { rows: [{ member_id: 5, status: 'active' }] }],
      ['FROM trainers', { rows: [{ trainer_id: 9, status: 'active' }] }],
      ['INSERT INTO trainer_assignments', { rows: [{ assignment_id: 77 }] }],
    ]);
    db.query.mockResolvedValueOnce({ rows: [assignmentRow] });
    const res = await request(app).post('/api/trainer-assignments').set(...as('receptionist')).send({ member_id: 5, trainer_id: 9, notes: 'Strength block' });
    expect(res.status).toBe(201);
    expect(res.body.data.assignment_id).toBe(77);
    const audit = findCall(client.query, 'INSERT INTO audit_logs');
    expect(audit.params.slice(0, 4)).toEqual([2, 'assign_trainer', 'trainer_assignments', 77]);
    expect(statements(client.query)).toContain('COMMIT');
  });

  it('refuses an inactive trainer', async () => {
    authAs('admin');
    const client = fakeClient([
      ['FROM members', { rows: [{ member_id: 5, status: 'active' }] }],
      ['FROM trainers', { rows: [{ trainer_id: 9, status: 'inactive' }] }],
    ]);
    const res = await request(app).post('/api/trainer-assignments').set(...as('admin')).send({ member_id: 5, trainer_id: 9 });
    expect(res.status).toBe(409);
    expect(findCall(client.query, 'INSERT INTO trainer_assignments')).toBeUndefined();
  });

  it('turns a duplicate pair into a clear 409', async () => {
    authAs('admin');
    const client = fakeClient([
      ['FROM members', { rows: [{ member_id: 5 }] }],
      ['FROM trainers', { rows: [{ trainer_id: 9, status: 'active' }] }],
      ['INSERT INTO trainer_assignments', () => { throw Object.assign(new Error('duplicate'), { code: '23505' }); }],
    ]);
    const res = await request(app).post('/api/trainer-assignments').set(...as('admin')).send({ member_id: 5, trainer_id: 9 });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already assigned/i);
    expect(statements(client.query)).toContain('ROLLBACK');
  });

  it('rejects an end date before the start date', async () => {
    authAs('admin');
    fakeClient();
    const res = await request(app).post('/api/trainer-assignments').set(...as('admin'))
      .send({ member_id: 5, trainer_id: 9, start_date: '2026-10-01', end_date: '2026-09-01' });
    expect(res.status).toBe(400);
  });

  it('ending an assignment stamps an end date and is audited', async () => {
    authAs('receptionist');
    const client = fakeClient([['FOR UPDATE', { rows: [{ assignment_id: 77, status: 'active', start_date: '2026-01-01', end_date: null }] }]]);
    db.query.mockResolvedValueOnce({ rows: [{ ...assignmentRow, status: 'completed' }] });
    const res = await request(app).patch('/api/trainer-assignments/77').set(...as('receptionist')).send({ status: 'completed' });
    expect(res.status).toBe(200);
    const update = findCall(client.query, 'UPDATE trainer_assignments SET');
    expect(update.sql).toMatch(/WHEN \$1::text IN \('completed', 'cancelled'\)/);
    expect(update.params).toEqual(['completed', null, null, 77]);
    expect(findCall(client.query, 'INSERT INTO audit_logs').params[1]).toBe('update_trainer_assignment');
  });

  it('a trainer cannot change assignments', async () => {
    authAs('trainer');
    const res = await request(app).patch('/api/trainer-assignments/77').set(...as('trainer')).send({ status: 'cancelled' });
    expect(res.status).toBe(403);
  });
});

// ------------------------------------------------------------------ attendance
describe('attendance is front-desk only', () => {
  it.each(['member', 'trainer'])('%s cannot check a member in', async (who) => {
    authAs(who);
    const res = await request(app).post('/api/attendance/check-in').set(...as(who)).send({ member_id: 5 });
    expect(res.status).toBe(403);
    expect(findCall(db.query, 'INSERT INTO attendance')).toBeUndefined();
  });

  it('a member cannot check themselves out either', async () => {
    authAs('member');
    const res = await request(app).patch('/api/attendance/check-out').set(...as('member')).send({});
    expect(res.status).toBe(403);
  });
});

// ------------------------------------------------------------------ schedules
describe('schedule management', () => {
  const scheduleRow = { schedule_id: 3, status: 'scheduled', capacity: 20, room: 'A' };

  it('only admins can change a schedule', async () => {
    authAs('receptionist');
    const res = await request(app).patch('/api/schedules/3').set(...as('receptionist')).send({ status: 'cancelled' });
    expect(res.status).toBe(403);
  });

  it('refuses to cut capacity below the seats already booked', async () => {
    authAs('admin');
    const client = fakeClient([
      ['FOR UPDATE', { rows: [scheduleRow] }],
      ["booking_status = 'booked'", { rows: [{ count: '12' }] }],
    ]);
    const res = await request(app).patch('/api/schedules/3').set(...as('admin')).send({ capacity: 10 });
    expect(res.status).toBe(409);
    expect(findCall(client.query, 'UPDATE class_schedules')).toBeUndefined();
    expect(statements(client.query)).toContain('ROLLBACK');
  });

  it('cancelling releases the bookings and is audited', async () => {
    authAs('admin');
    const client = fakeClient([
      ['FOR UPDATE', { rows: [scheduleRow] }],
      ['UPDATE class_schedules', { rows: [{ ...scheduleRow, status: 'cancelled' }] }],
      ['UPDATE class_bookings', { rows: [], rowCount: 4 }],
    ]);
    const res = await request(app).patch('/api/schedules/3').set(...as('admin')).send({ status: 'cancelled' });
    expect(res.status).toBe(200);
    expect(res.body.released_bookings).toBe(4);
    expect(findCall(client.query, 'INSERT INTO audit_logs').params[1]).toBe('update_schedule');
  });

  it('an admin can list cancelled sessions on request', async () => {
    authAs('admin');
    db.query.mockResolvedValueOnce({ rows: [{ count: '0' }] }).mockResolvedValueOnce({ rows: [] });
    await request(app).get('/api/schedules?include=cancelled').set(...as('admin'));
    expect(db.query.mock.calls[1][0]).not.toMatch(/<> 'cancelled'/);
  });

  it('the public timetable ignores include=cancelled', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ count: '0' }] }).mockResolvedValueOnce({ rows: [] });
    await request(app).get('/api/schedules?include=cancelled');
    expect(db.query.mock.calls[0][0]).toMatch(/status <> 'cancelled'/);
  });
});

// ------------------------------------------------------------------ payments
describe('payment auditing', () => {
  it('records who changed a status, with before and after, inside the transaction', async () => {
    authAs('receptionist');
    const client = fakeClient([
      ['FOR UPDATE', { rows: [{ payment_status: 'completed', notes: null }] }],
      ['UPDATE payments', { rows: [{ payment_id: 12, payment_status: 'refunded', notes: 'Duplicate charge' }] }],
    ]);
    const res = await request(app).patch('/api/payments/12').set(...as('receptionist')).send({ payment_status: 'refunded', notes: 'Duplicate charge' });
    expect(res.status).toBe(200);
    const audit = findCall(client.query, 'INSERT INTO audit_logs');
    expect(audit.params.slice(0, 4)).toEqual([2, 'update_payment', 'payments', 12]);
    expect(JSON.parse(audit.params[4])).toEqual({ payment_status: 'completed', notes: null });
    expect(JSON.parse(audit.params[5])).toEqual({ payment_status: 'refunded', notes: 'Duplicate charge' });
    const order = statements(client.query);
    expect(order.findIndex((s) => s.startsWith('INSERT INTO audit_logs'))).toBeLessThan(order.indexOf('COMMIT'));
  });

  it('writes no audit entry when the update fails', async () => {
    authAs('receptionist');
    const client = fakeClient([
      ['FOR UPDATE', { rows: [{ payment_status: 'completed', notes: null }] }],
      ['UPDATE payments', () => { throw new Error('connection lost'); }],
    ]);
    const res = await request(app).patch('/api/payments/12').set(...as('receptionist')).send({ payment_status: 'refunded' });
    expect(res.status).toBe(500);
    expect(findCall(client.query, 'INSERT INTO audit_logs')).toBeUndefined();
    expect(statements(client.query)).toContain('ROLLBACK');
  });

  it('manual payments are audited too', async () => {
    authAs('admin');
    const client = fakeClient([
      ['FROM subscriptions', { rows: [{ '?column?': 1 }] }],
      ['INSERT INTO payments', { rows: [{ payment_id: 30, amount: '250.00', payment_status: 'completed' }] }],
    ]);
    const res = await request(app).post('/api/payments').set(...as('admin')).send({ subscription_id: 8, member_id: 5, amount: 250, payment_method: 'upi' });
    expect(res.status).toBe(201);
    expect(findCall(client.query, 'INSERT INTO audit_logs').params.slice(0, 4)).toEqual([1, 'create_payment', 'payments', 30]);
  });
});

// ------------------------------------------------------------------ dashboards
describe('dashboards use real data', () => {
  it('a member cannot open the trainer dashboard', async () => {
    authAs('member');
    const res = await request(app).get('/api/dashboard/trainer').set(...as('member'));
    expect(res.status).toBe(403);
  });

  it('a trainer account without a trainer record gets a clear 400', async () => {
    authAs('trainer', { trainer_id: null });
    const res = await request(app).get('/api/dashboard/trainer').set(...as('trainer'));
    expect(res.status).toBe(400);
  });

  it('the trainer dashboard reads the trainer\'s own figures', async () => {
    authAs('trainer');
    db.query
      .mockResolvedValueOnce({ rows: [{ roster: '4', classes_today: '1', active_plans: '3', open_assignments: '5', avg_completion: '42' }] })
      .mockResolvedValueOnce({ rows: [{ member_id: 29, member_name: 'Rhea', status: 'active', plan_name: 'Gold', visits: '12', last_visit: null }] });
    const res = await request(app).get('/api/dashboard/trainer').set(...as('trainer'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ rosterCount: 4, classesToday: 1, activePlans: 3, openAssignments: 5, avgCompletion: 42 });
    expect(res.body.data.roster[0]).toMatchObject({ member_name: 'Rhea', visits: 12 });
    expect(db.query.mock.calls.slice(1).every(([, params]) => params[0] === 9)).toBe(true);
  });

  it('the member dashboard reads the member\'s own figures', async () => {
    authAs('member');
    db.query
      .mockResolvedValueOnce({ rows: [{ total_visits: '14', visits_30d: '3', sessions_30d: '2', upcoming_classes: '1' }] })
      .mockResolvedValueOnce({ rows: [{ class_name: 'Spin', class_date: '2026-09-20', start_time: '07:00:00' }] })
      .mockResolvedValueOnce({ rows: [{ plan_name: 'Gold', end_date: '2026-12-01', days_remaining: 78 }] })
      .mockResolvedValueOnce({ rows: [{ member_workout_id: 1, plan_name: 'Base', status: 'in_progress', completion_percentage: '40.00' }] });
    const res = await request(app).get('/api/dashboard/member').set(...as('member'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      totalVisits: 14, visits30d: 3, sessions30d: 2, upcomingClasses: 1,
      nextClass: { class_name: 'Spin' }, subscription: { planName: 'Gold', daysRemaining: 78 },
    });
    expect(res.body.data.workouts[0].completion_percentage).toBe(40);
    expect(db.query.mock.calls.slice(1).every(([, params]) => params[0] === 5)).toBe(true);
  });

  it('the overview now includes expiring memberships and pending payments', async () => {
    authAs('receptionist');
    db.query.mockResolvedValueOnce({ rows: [{ members_total: '53', members_active: '40', trainers_active: '9', revenue_total: '1000.50', attendance_today: '7', on_floor: '2', expiring_7d: '6', payments_pending: '3', joined_7d: '1' }] });
    const res = await request(app).get('/api/dashboard/overview').set(...as('receptionist'));
    expect(res.body.data).toMatchObject({ members: { expiring: 6, joinedThisWeek: 1 }, revenue: { outstandingCount: 3 }, attendance: { onFloor: 2 } });
  });
});

// ------------------------------------------------------------------ maintenance
describe('on-demand maintenance', () => {
  it('an admin can run it and see what changed', async () => {
    authAs('admin');
    maintenance.runMaintenance.mockResolvedValue({ skipped: false, expired_subscriptions: 2, closed_check_ins: 1, purged_tokens: 0 });
    const res = await request(app).post('/api/admin/maintenance/run').set(...as('admin'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ expired_subscriptions: 2, closed_check_ins: 1 });
  });

  it('a receptionist cannot', async () => {
    authAs('receptionist');
    const res = await request(app).post('/api/admin/maintenance/run').set(...as('receptionist'));
    expect(res.status).toBe(403);
    expect(maintenance.runMaintenance).not.toHaveBeenCalled();
  });
});

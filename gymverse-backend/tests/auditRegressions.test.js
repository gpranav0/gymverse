/**
 * Regression tests for the final audit: places where the API and the schema had drifted
 * apart, and edits that silently changed data nobody asked to change.
 */
process.env.JWT_SECRET = 'test_secret_for_audit_regressions';
process.env.NODE_ENV = 'test';

jest.mock('../src/config/database', () => ({
  query: jest.fn(),
  pool: { connect: jest.fn(), end: jest.fn() }
}));
jest.mock('../src/services/aiService', () => ({ generateChatResponse: jest.fn() }));

const request = require('supertest');
const db = require('../src/config/database');
const app = require('../src/app');
const { generateToken } = require('../src/utils/jwt');
const { chatCache } = require('../src/controllers/chatController');

const USERS = {
  admin: { user_id: 1, username: 'admin', email: 'a@gv.com', role: 'admin', member_id: null, trainer_id: null },
  member: { user_id: 2, username: 'mem', email: 'm@gv.com', role: 'member', member_id: 5, trainer_id: null },
};
const auth = (who) => ['Authorization', `Bearer ${generateToken(USERS[who].user_id, USERS[who].role)}`];
const authAs = (who) => db.query.mockResolvedValueOnce({ rows: [USERS[who]] });
const callMatching = (fragment) => db.query.mock.calls.find(([text]) => String(text).includes(fragment));

beforeEach(() => {
  db.query.mockReset();
  db.query.mockResolvedValue({ rows: [], rowCount: 0 });
});
afterAll(() => chatCache.close());

describe('attendance check-in methods match the schema CHECK', () => {
  it("accepts 'app', which the schema allows", async () => {
    authAs('admin');
    db.query
      .mockResolvedValueOnce({ rows: [{ status: 'active' }] }) // member lookup
      .mockResolvedValueOnce({ rows: [] })                     // no open check-in
      .mockResolvedValueOnce({ rows: [{ attendance_id: 1 }] }); // insert
    const res = await request(app).post('/api/attendance/check-in').set(...auth('admin'))
      .send({ member_id: 5, check_in_method: 'app' });
    expect(res.status).toBe(201);
    expect(callMatching('INSERT INTO attendance')[1]).toEqual([5, 'app']);
  });

  it("rejects 'card', which the schema does not allow, before touching the table", async () => {
    authAs('admin');
    const res = await request(app).post('/api/attendance/check-in').set(...auth('admin'))
      .send({ member_id: 5, check_in_method: 'card' });
    expect(res.status).toBe(422);
    expect(callMatching('INSERT INTO attendance')).toBeUndefined();
  });
});

describe('workout sessions match the schema CHECK', () => {
  it('rejects a zero-minute session with 422 instead of a driver error', async () => {
    authAs('member');
    const res = await request(app).post('/api/workout-sessions').set(...auth('member'))
      .send({ duration_minutes: 0 });
    expect(res.status).toBe(422);
    expect(callMatching('INSERT INTO workout_sessions')).toBeUndefined();
  });

  it('accepts decimal calories, which the NUMERIC column stores', async () => {
    authAs('member');
    db.query.mockResolvedValueOnce({ rows: [{ session_id: 1 }] });
    const res = await request(app).post('/api/workout-sessions').set(...auth('member'))
      .send({ duration_minutes: 30, calories_burned: 212.5 });
    expect(res.status).toBe(201);
  });
});

describe('zero is not mistaken for "not supplied" on fields that must be positive', () => {
  it('rejects a zero-minute class', async () => {
    authAs('admin');
    const res = await request(app).post('/api/classes').set(...auth('admin'))
      .send({ class_name: 'Spin', duration_minutes: 0 });
    expect(res.status).toBe(422);
    expect(callMatching('INSERT INTO fitness_classes')).toBeUndefined();
  });

  it('rejects a zero-week workout plan before opening a transaction', async () => {
    authAs('admin');
    const res = await request(app).post('/api/workout-plans').set(...auth('admin'))
      .send({ plan_name: 'Base', duration_weeks: 0, trainer_id: 9 });
    expect(res.status).toBe(422);
    expect(db.pool.connect).not.toHaveBeenCalled();
  });

  it('rejects zero sets on a plan exercise', async () => {
    authAs('admin');
    const res = await request(app).post('/api/workout-plans').set(...auth('admin'))
      .send({ plan_name: 'Base', trainer_id: 9, exercises: [{ exercise_id: 1, sets: 0 }] });
    expect(res.status).toBe(422);
  });

  it('still lets an optional number be left out', async () => {
    authAs('admin');
    db.query.mockResolvedValueOnce({ rows: [{ class_id: 1 }] });
    const res = await request(app).post('/api/classes').set(...auth('admin')).send({ class_name: 'Spin' });
    expect(res.status).toBe(201);
  });
});

describe('PUT without a status keeps the current status', () => {
  it('does not reactivate a retired membership plan', async () => {
    authAs('admin');
    db.query.mockResolvedValueOnce({ rows: [{ plan_id: 3, status: 'inactive' }] });
    const res = await request(app).put('/api/membership-plans/3').set(...auth('admin'))
      .send({ plan_name: 'Legacy', duration_months: 6, price: 100 });
    expect(res.status).toBe(200);
    const [text, params] = callMatching('UPDATE membership_plans');
    expect(text).toMatch(/status = COALESCE\(\$6, status\)/);
    expect(params[5]).toBeNull();
  });

  it('still applies an explicit status', async () => {
    authAs('admin');
    db.query.mockResolvedValueOnce({ rows: [{ plan_id: 3 }] });
    await request(app).put('/api/membership-plans/3').set(...auth('admin'))
      .send({ plan_name: 'Legacy', duration_months: 6, price: 100, status: 'inactive' });
    expect(callMatching('UPDATE membership_plans')[1][5]).toBe('inactive');
  });

  it('does not reactivate a retired class', async () => {
    authAs('admin');
    db.query.mockResolvedValueOnce({ rows: [{ class_id: 4 }] });
    const res = await request(app).put('/api/classes/4').set(...auth('admin'))
      .send({ class_name: 'Spin' });
    expect(res.status).toBe(200);
    const [text, params] = callMatching('UPDATE fitness_classes');
    expect(text).toMatch(/status = COALESCE\(\$5, status\)/);
    expect(params[4]).toBeNull();
  });
});

describe('public timetable', () => {
  it('leaves cancelled sessions out of both the list and the total', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/schedules');
    expect(res.status).toBe(200);
    const [countSql] = db.query.mock.calls[0];
    const [listSql] = db.query.mock.calls[1];
    expect(countSql).toMatch(/status <> 'cancelled'/);
    expect(listSql).toMatch(/cs\.status <> 'cancelled'/);
  });
});

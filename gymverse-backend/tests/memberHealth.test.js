process.env.JWT_SECRET = 'health_context_test_secret';
process.env.NODE_ENV = 'test';
jest.mock('../src/config/database', () => ({ query: jest.fn(), pool: { end: jest.fn() } }));
jest.mock('../src/services/aiService', () => ({ generateChatResponse: jest.fn() }));
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/database');
const { generateToken } = require('../src/utils/jwt');
const { chatCache } = require('../src/controllers/chatController');
const { healthConditionsRule } = require('../src/validators/healthInformation');
const { validationResult } = require('express-validator');
const member = { user_id: 42, role: 'member', member_id: 7 };
const auth = () => ['Authorization', `Bearer ${generateToken(42, 'member')}`];
beforeEach(() => {
  db.query.mockImplementation(async sql => String(sql).includes('FROM users u')
    ? { rows: [member] } : { rows: [{ member_id: 7, health_conditions: 'Knee injury' }] });
});
afterAll(() => chatCache.close());

test('member saves trimmed health information through a parameterized own-profile update', async () => {
  const res = await request(app).patch('/api/members/7').set(...auth()).send({ health_conditions: ' Knee injury ' });
  expect(res.status).toBe(200);
  const [sql, params] = db.query.mock.calls.find(([sql]) => sql.startsWith('UPDATE members'));
  expect(sql).toContain('health_conditions = $1');
  expect(params).toEqual(['Knee injury', 7]);
});

test.each(['', '   ', null])('member can clear health information using %p', async value => {
  const res = await request(app).patch('/api/members/7').set(...auth()).send({ health_conditions: value });
  expect(res.status).toBe(200);
  expect(db.query.mock.calls.find(([sql]) => sql.startsWith('UPDATE members'))[1]).toEqual([null, 7]);
});

test.each([true, 12, {}, [], 'a'.repeat(1001)])('invalid health field is rejected before updating: %p', async value => {
  const res = await request(app).patch('/api/members/7').set(...auth()).send({ health_conditions: value });
  expect(res.status).toBe(422);
  expect(db.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE members'))).toBe(false);
});

test('member cannot write another account health information', async () => {
  const res = await request(app).patch('/api/members/8').set(...auth()).send({ health_conditions: 'Asthma' });
  expect(res.status).toBe(403);
  expect(db.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE members'))).toBe(false);
});

test('member cannot read another account health information', async () => {
  expect((await request(app).get('/api/members/8').set(...auth())).status).toBe(403);
});

test('health field remains optional for legacy clients', async () => {
  const req = { body: {} };
  await healthConditionsRule().run(req);
  expect(validationResult(req).isEmpty()).toBe(true);
  expect(req.body).not.toHaveProperty('health_conditions');
});

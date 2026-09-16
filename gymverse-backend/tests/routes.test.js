/**
 * Route-level tests against the real Express app with the database mocked.
 *
 * These exist because the highest-severity finding was a routing mistake, not a logic
 * one: /api/chat was mounted with no authentication at all. A controller unit test
 * cannot catch that — only exercising the assembled middleware chain can.
 */
process.env.JWT_SECRET = 'test_secret_for_route_tests';
process.env.NODE_ENV = 'test';

jest.mock('../src/config/database', () => ({
  query: jest.fn(),
  pool: { connect: jest.fn(), end: jest.fn() }
}));

// Keep real network calls out of the suite.
jest.mock('../src/services/aiService', () => ({
  generateChatResponse: jest.fn(async () => 'a stubbed answer')
}));

const request = require('supertest');
const db = require('../src/config/database');
const { generateChatResponse } = require('../src/services/aiService');
const app = require('../src/app');
const { generateToken } = require('../src/utils/jwt');
const { chatCache } = require('../src/controllers/chatController');

const USERS = {
  admin: { user_id: 1, username: 'admin', email: 'a@gv.com', role: 'admin', member_id: null, trainer_id: null },
  member: { user_id: 2, username: 'mem', email: 'm@gv.com', role: 'member', member_id: 5, trainer_id: null },
  trainer: { user_id: 3, username: 'trn', email: 't@gv.com', role: 'trainer', member_id: null, trainer_id: 9 }
};

const tokenFor = (who) => generateToken(USERS[who].user_id, USERS[who].role);

// The first query in any authenticated request is the auth middleware's user lookup.
const authAs = (who) => db.query.mockResolvedValueOnce({ rows: [USERS[who]] });

const auth = (who) => ['Authorization', `Bearer ${tokenFor(who)}`];

beforeEach(() => {
  db.query.mockReset();
  db.query.mockResolvedValue({ rows: [], rowCount: 0 });
  // jest.config sets resetMocks, which clears module-mock implementations too, so the
  // AI stub has to be re-armed rather than declared once in the factory.
  generateChatResponse.mockResolvedValue('a stubbed answer');
  // The chat cache is module-level and would otherwise carry answers between tests.
  chatCache.flushAll();
});

describe('POST /api/chat', () => {
  it('refuses an unauthenticated request', async () => {
    const res = await request(app).post('/api/chat').send({ message: 'hello' });
    expect(res.status).toBe(401);
  });

  it('refuses a request carrying a garbage token', async () => {
    const res = await request(app)
      .post('/api/chat')
      .set('Authorization', 'Bearer not.a.real.token')
      .send({ message: 'hello' });
    expect(res.status).toBe(401);
  });

  it('answers an authenticated request', async () => {
    authAs('member');
    const res = await request(app).post('/api/chat').set(...auth('member')).send({ message: 'what are your hours?' });
    expect(res.status).toBe(200);
    expect(res.body.response).toBe('a stubbed answer');
  });

  it('rejects an empty message with 422', async () => {
    authAs('member');
    const res = await request(app).post('/api/chat').set(...auth('member')).send({ message: '   ' });
    expect(res.status).toBe(422);
  });

  it('rejects a message over the length cap', async () => {
    authAs('member');
    const res = await request(app).post('/api/chat').set(...auth('member')).send({ message: 'x'.repeat(2001) });
    expect(res.status).toBe(422);
  });

  it('rejects a non-string message', async () => {
    authAs('member');
    const res = await request(app).post('/api/chat').set(...auth('member')).send({ message: { evil: true } });
    expect(res.status).toBe(422);
  });

  it('rejects an over-long conversation history', async () => {
    authAs('member');
    const history = Array.from({ length: 25 }, () => ({ role: 'user', content: 'hi' }));
    const res = await request(app)
      .post('/api/chat').set(...auth('member'))
      .send({ message: 'hi', conversationHistory: history });
    expect(res.status).toBe(422);
  });
});

describe('authentication is required on the data routes', () => {
  const guarded = [
    ['get', '/api/members'],
    ['get', '/api/members/1'],
    ['get', '/api/payments'],
    ['get', '/api/payments/member/1'],
    ['get', '/api/subscriptions'],
    ['get', '/api/attendance'],
    ['get', '/api/dashboard/overview'],
    ['get', '/api/reports/revenue'],
    ['get', '/api/admin/users/pending-trainers'],
    ['get', '/api/workout-plans'],
    ['get', '/api/exercises']
  ];

  it.each(guarded)('%s %s returns 401 without a token', async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
  });
});

describe('role enforcement', () => {
  it('keeps a member out of the admin area', async () => {
    authAs('member');
    const res = await request(app).get('/api/admin/users/pending-trainers').set(...auth('member'));
    expect(res.status).toBe(403);
  });

  it('keeps a trainer out of the payments ledger', async () => {
    authAs('trainer');
    const res = await request(app).get('/api/payments').set(...auth('trainer'));
    expect(res.status).toBe(403);
  });

  it('keeps a member out of the members directory', async () => {
    authAs('member');
    const res = await request(app).get('/api/members').set(...auth('member'));
    expect(res.status).toBe(403);
  });

  it('lets an admin into the members directory', async () => {
    authAs('admin');
    db.query
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/members').set(...auth('admin'));
    expect(res.status).toBe(200);
  });
});

describe('financial scoping', () => {
  it('blocks a trainer from a member\'s payment history', async () => {
    authAs('trainer');
    const res = await request(app).get('/api/payments/member/5').set(...auth('trainer'));
    expect(res.status).toBe(403);
  });

  it('blocks a member from another member\'s payment history', async () => {
    authAs('member');
    const res = await request(app).get('/api/payments/member/999').set(...auth('member'));
    expect(res.status).toBe(403);
  });

  it('lets a member read their own payment history', async () => {
    authAs('member');
    db.query
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/payments/member/5').set(...auth('member'));
    expect(res.status).toBe(200);
  });
});

describe('input validation at the route boundary', () => {
  it('rejects a non-numeric id with 422 rather than reaching the driver', async () => {
    authAs('admin');
    const res = await request(app).get('/api/members/abc').set(...auth('admin'));
    expect(res.status).toBe(422);
    // Only the auth lookup should have run.
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('rejects an out-of-range pagination limit', async () => {
    authAs('admin');
    const res = await request(app).get('/api/members?limit=999999').set(...auth('admin'));
    expect(res.status).toBe(422);
  });

  it('rejects a negative page', async () => {
    authAs('admin');
    const res = await request(app).get('/api/members?page=-1').set(...auth('admin'));
    expect(res.status).toBe(422);
  });

  it('rejects a payment status outside the schema CHECK', async () => {
    authAs('admin');
    const res = await request(app)
      .patch('/api/payments/1').set(...auth('admin'))
      .send({ payment_status: 'definitely_not_a_status' });
    expect(res.status).toBe(422);
  });

  it('rejects a partial PUT instead of nulling the omitted columns', async () => {
    authAs('admin');
    const res = await request(app)
      .put('/api/members/5').set(...auth('admin'))
      .send({ address: 'only this' });
    expect(res.status).toBe(422);
  });
});

describe('misc', () => {
  it('returns a 404 body for an unknown route', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('does not advertise the framework', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('sets the helmet security headers', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

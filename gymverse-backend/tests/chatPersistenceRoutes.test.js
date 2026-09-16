process.env.JWT_SECRET = 'test_chat_history_secret';
process.env.NODE_ENV = 'test';
jest.mock('../src/config/database', () => ({ query: jest.fn(), pool: { end: jest.fn() } }));
jest.mock('../src/services/aiService', () => ({ generateChatResponse: jest.fn() }));
jest.mock('../src/services/chatHistoryService', () => ({ ticket: jest.fn(), save: jest.fn(), status: jest.fn(), list: jest.fn(), read: jest.fn() }));
const { randomUUID } = require('crypto');
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/database');
const ai = require('../src/services/aiService');
const history = require('../src/services/chatHistoryService');
const { generateToken } = require('../src/utils/jwt');
const { chatCache } = require('../src/controllers/chatController');
beforeEach(() => {
  chatCache.flushAll(); ai.generateChatResponse.mockResolvedValue('AI reply');
  history.ticket.mockReturnValue('epoch'); history.save.mockResolvedValue({ saved: true, available: true });
});
afterAll(() => chatCache.close());
test.each(['admin', 'receptionist', 'trainer', 'member'])('%s can chat with JWT-derived ownership', async role => {
  db.query.mockResolvedValue({ rows: [{ user_id: 88, role }] });
  const result = await request(app).post('/api/chat').set('Authorization', `Bearer ${generateToken(88, role)}`)
    .send({ message: 'hello', userId: 999, conversationId: randomUUID(), requestId: randomUUID(), conversationHistory: [{ role: 'user', content: 'Temporary old text' }] });
  expect(result.status).toBe(200);
  expect(history.save).toHaveBeenCalledWith(expect.objectContaining({ userId: 88, message: 'hello' }));
  expect(history.save.mock.calls[0][0]).not.toHaveProperty('conversationHistory');
});
test('write failure cannot discard a successful AI reply', async () => {
  db.query.mockResolvedValue({ rows: [{ user_id: 88, role: 'member' }] });
  history.save.mockRejectedValue(new Error('database down'));
  const result = await request(app).post('/api/chat').set('Authorization', `Bearer ${generateToken(88, 'member')}`).send({ message: 'hello' });
  expect(result.body.response).toBe('AI reply'); expect(result.body.persistence.saved).toBe(false);
});
test('history queries derive ownership from the authenticated account', async () => {
  db.query.mockResolvedValue({ rows: [{ user_id: 88, role: 'member' }] });
  history.read.mockResolvedValue({ available: true, missing: true });
  const id = randomUUID();
  const result = await request(app).get(`/api/chat/conversations/${id}?userId=999`).set('Authorization', `Bearer ${generateToken(88, 'member')}`);
  expect(history.read).toHaveBeenCalledWith(88, id, undefined); expect(result.status).toBe(404);
});
test('anonymous history access is rejected', async () => {
  expect((await request(app).get('/api/chat/conversations')).status).toBe(401);
});

describe('temporary chat', () => {
  const member = () => ({ Authorization: `Bearer ${generateToken(88, 'member')}` });
  beforeEach(() => {
    db.query.mockResolvedValue({ rows: [{ user_id: 88, role: 'member' }] });
    ai.generateChatResponse.mockClear(); history.save.mockClear();
    history.status.mockReturnValue({ available: true, configured: true });
  });

  test('is never saved, even with history connected and a valid ticket', async () => {
    const result = await request(app).post('/api/chat').set(member())
      .send({ message: 'private question', temporary: true, conversationId: randomUUID(), requestId: randomUUID() });
    expect(result.status).toBe(200);
    expect(result.body.response).toBe('AI reply');
    expect(result.body.persistence).toEqual({ saved: false, temporary: true, available: true, configured: true });
    expect(history.save).not.toHaveBeenCalled();
  });

  test('bypasses the reply cache in both directions', async () => {
    await request(app).post('/api/chat').set(member()).send({ message: 'same question', temporary: true });
    await request(app).post('/api/chat').set(member()).send({ message: 'same question', temporary: true });
    expect(ai.generateChatResponse).toHaveBeenCalledTimes(2);
    expect(chatCache.keys()).toHaveLength(0);

    // A normal chat warms the cache; a temporary one must still not read from it.
    await request(app).post('/api/chat').set(member()).send({ message: 'same question' });
    const temp = await request(app).post('/api/chat').set(member()).send({ message: 'same question', temporary: true });
    expect(temp.body.source).toBe('ai');
    expect(ai.generateChatResponse).toHaveBeenCalledTimes(4);
  });

  test('rejects a non-boolean flag rather than guessing', async () => {
    const result = await request(app).post('/api/chat').set(member()).send({ message: 'hi', temporary: 'true' });
    expect(result.status).toBe(422);
    expect(ai.generateChatResponse).not.toHaveBeenCalled();
    expect(history.save).not.toHaveBeenCalled();
  });
});

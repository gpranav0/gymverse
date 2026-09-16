const crypto = require('crypto');
const { issueToken, consumeToken, hashToken } = require('../src/utils/authTokens');

const fakeDb = (rows = []) => ({ query: jest.fn(async () => ({ rows })) });

test('issues a random URL-safe token and stores only its hash', async () => {
  const db = fakeDb();
  const raw = await issueToken(db, 7, 'password_reset');
  expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const insert = db.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO auth_tokens'));
  expect(insert[1]).toEqual([7, 'password_reset', hashToken(raw), 30]);
  expect(JSON.stringify(db.query.mock.calls)).not.toContain(raw);
});

test('retires earlier unused links of the same kind before issuing', async () => {
  const db = fakeDb();
  await issueToken(db, 7, 'email_verification');
  expect(db.query.mock.calls[0][0]).toMatch(/UPDATE auth_tokens SET used_at/);
  expect(db.query.mock.calls[0][1]).toEqual([7, 'email_verification']);
  expect(db.query.mock.calls[1][1][3]).toBe(24 * 60);
});

test('every issued token is different', async () => {
  const db = fakeDb();
  const a = await issueToken(db, 7, 'password_reset');
  const b = await issueToken(db, 7, 'password_reset');
  expect(a).not.toBe(b);
});

test('rejects an unknown purpose', async () => {
  await expect(issueToken(fakeDb(), 7, 'magic_login')).rejects.toThrow(/Unknown token purpose/);
});

test('consume does not query for obviously invalid input', async () => {
  const db = fakeDb();
  expect(await consumeToken(db, 'short', 'password_reset')).toBeNull();
  expect(await consumeToken(db, undefined, 'password_reset')).toBeNull();
  expect(db.query).not.toHaveBeenCalled();
});

test('consume is one atomic update keyed by hash and purpose', async () => {
  const db = fakeDb([{ user_id: 7 }]);
  const raw = 'a'.repeat(43);
  expect(await consumeToken(db, raw, 'password_reset')).toBe(7);
  const [sql, params] = db.query.mock.calls[0];
  expect(sql).toMatch(/^\s*UPDATE auth_tokens/);
  expect(sql).toMatch(/used_at IS NULL AND expires_at > CURRENT_TIMESTAMP/);
  expect(params).toEqual([crypto.createHash('sha256').update(raw).digest('hex'), 'password_reset']);
});

test('consume returns null for a spent, expired or unknown token', async () => {
  expect(await consumeToken(fakeDb([]), 'b'.repeat(43), 'password_reset')).toBeNull();
});

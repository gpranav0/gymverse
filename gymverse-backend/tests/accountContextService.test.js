jest.mock('../src/config/database', () => ({ query: jest.fn() }));
const db = require('../src/config/database');
const { getAccountContext, ACCOUNT_CONTEXT_QUERY } = require('../src/services/accountContextService');

test('retrieves a profile using only the authenticated account ID', async () => {
  const data = { profile: { name: 'Asha', age: 24 }, goals: [] };
  db.query.mockResolvedValue({ rows: [{ account_context: data }] });
  await expect(getAccountContext(42)).resolves.toEqual({ status: 'available', data });
  expect(db.query).toHaveBeenCalledWith(ACCOUNT_CONTEXT_QUERY, [42]);
  expect(ACCOUNT_CONTEXT_QUERY).toContain('u.user_id = $1');
  expect(ACCOUNT_CONTEXT_QUERY).toContain('m.member_id = u.member_id');
});

test('handles accounts without a linked member profile', async () => {
  db.query.mockResolvedValue({ rows: [] });
  await expect(getAccountContext(42)).resolves.toEqual({ status: 'no_member_profile' });
});

test('rejects invalid account identifiers without querying', async () => {
  await expect(getAccountContext('42 OR 1=1')).resolves.toEqual({ status: 'unavailable' });
  expect(db.query).not.toHaveBeenCalled();
});

test('fails without returning stale or fabricated profile data', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  db.query.mockRejectedValue(new Error('database offline'));
  await expect(getAccountContext(42)).resolves.toEqual({ status: 'unavailable' });
});

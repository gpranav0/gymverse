jest.mock('../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../src/services/chatHistoryService', () => ({ status: jest.fn(), syncMember: jest.fn() }));
const db = require('../src/config/database');
const atlas = require('../src/services/chatHistoryService');
const { reconcileMemberProfiles, syncMemberById } = require('../src/services/memberMirrorService');

test('an offline Atlas does not block account writes or query PostgreSQL', async () => {
  atlas.status.mockReturnValue({ available: false });
  await syncMemberById(7);
  expect(db.query).not.toHaveBeenCalled();
});

test('reconciliation fetches current health data including cleared values', async () => {
  atlas.status.mockReturnValue({ available: true });
  db.query.mockResolvedValue({ rows: [{ member_id: 7, health_conditions: null }] });
  atlas.syncMember.mockResolvedValue({ synced: true });
  await expect(reconcileMemberProfiles()).resolves.toEqual({ synced: true, count: 1 });
  expect(atlas.syncMember).toHaveBeenCalledWith({ member_id: 7, health_conditions: null });
});

test('a failed Atlas write stops reconciliation rather than reporting completion', async () => {
  atlas.status.mockReturnValue({ available: true });
  db.query.mockResolvedValue({ rows: [{ member_id: 7 }, { member_id: 8 }] });
  atlas.syncMember.mockResolvedValue({ synced: false });
  await expect(reconcileMemberProfiles()).resolves.toEqual({ synced: false, count: 0 });
  expect(atlas.syncMember).toHaveBeenCalledTimes(1);
});

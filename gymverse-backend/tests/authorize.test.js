/**
 * Covers the ownership helper that replaced the per-controller
 * `if (role === 'member' && ...)` checks. Those only ever constrained members, so every
 * trainer could read every member's records.
 */
jest.mock('../src/config/database', () => ({
  query: jest.fn(),
  pool: { connect: jest.fn() }
}));

const db = require('../src/config/database');
const {
  parseId,
  isStaff,
  trainerOwnsMember,
  assertMemberDataAccess,
  assertFinancialAccess
} = require('../src/utils/authorize');

const asUser = (over) => ({ user: { role: 'member', member_id: null, trainer_id: null, ...over } });

beforeEach(() => db.query.mockReset());

describe('parseId', () => {
  it('accepts a positive integer string', () => {
    expect(parseId('42')).toBe(42);
  });

  it('rejects a non-numeric value', () => {
    expect(() => parseId('abc')).toThrow(/Invalid/);
  });

  it('rejects a trailing-garbage value that parseInt would have accepted', () => {
    // parseInt('12abc') is 12; the whole string has to be a number.
    expect(() => parseId('12abc')).toThrow(/Invalid/);
  });

  it('rejects zero and negatives', () => {
    expect(() => parseId('0')).toThrow(/Invalid/);
    expect(() => parseId('-3')).toThrow(/Invalid/);
  });

  it('rejects undefined and null', () => {
    expect(() => parseId(undefined)).toThrow(/Invalid/);
    expect(() => parseId(null)).toThrow(/Invalid/);
  });

  it('names the field in the message', () => {
    expect(() => parseId('x', 'member id')).toThrow(/member id/);
  });
});

describe('isStaff', () => {
  it('covers admin and receptionist only', () => {
    expect(isStaff('admin')).toBe(true);
    expect(isStaff('receptionist')).toBe(true);
    expect(isStaff('trainer')).toBe(false);
    expect(isStaff('member')).toBe(false);
  });
});

describe('trainerOwnsMember', () => {
  it('is false without a trainer id, and asks the database nothing', async () => {
    expect(await trainerOwnsMember(null, 5)).toBe(false);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('is true when an active assignment exists', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    expect(await trainerOwnsMember(3, 5)).toBe(true);
  });

  it('is false when no assignment matches', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    expect(await trainerOwnsMember(3, 5)).toBe(false);
  });
});

describe('assertMemberDataAccess', () => {
  it('lets staff through without a database round trip', async () => {
    await expect(assertMemberDataAccess(asUser({ role: 'admin' }), 5)).resolves.toBeUndefined();
    await expect(assertMemberDataAccess(asUser({ role: 'receptionist' }), 5)).resolves.toBeUndefined();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('lets a member reach their own records', async () => {
    await expect(assertMemberDataAccess(asUser({ member_id: 5 }), 5)).resolves.toBeUndefined();
  });

  it('blocks a member from another member\'s records', async () => {
    await expect(assertMemberDataAccess(asUser({ member_id: 6 }), 5))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  it('lets a trainer reach a member assigned to them', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    await expect(assertMemberDataAccess(asUser({ role: 'trainer', trainer_id: 3 }), 5))
      .resolves.toBeUndefined();
  });

  it('blocks a trainer from a member who is not theirs', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(assertMemberDataAccess(asUser({ role: 'trainer', trainer_id: 3 }), 5))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  it('blocks an unrecognised role outright', async () => {
    await expect(assertMemberDataAccess(asUser({ role: 'guest' }), 5))
      .rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('assertFinancialAccess', () => {
  it('lets staff through', () => {
    expect(() => assertFinancialAccess(asUser({ role: 'admin' }), 5)).not.toThrow();
    expect(() => assertFinancialAccess(asUser({ role: 'receptionist' }), 5)).not.toThrow();
  });

  it('lets a member see their own billing', () => {
    expect(() => assertFinancialAccess(asUser({ member_id: 5 }), 5)).not.toThrow();
  });

  it('blocks a member from another member\'s billing', () => {
    expect(() => assertFinancialAccess(asUser({ member_id: 6 }), 5)).toThrow(/Forbidden/);
  });

  // The distinction that matters: a trainer may coach a member without seeing what
  // that member pays.
  it('blocks a trainer even for a member assigned to them', () => {
    expect(() => assertFinancialAccess(asUser({ role: 'trainer', trainer_id: 3 }), 5)).toThrow(/Forbidden/);
  });
});

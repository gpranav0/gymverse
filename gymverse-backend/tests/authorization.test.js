/**
 * Regression tests for the authorization holes found during the audits.
 * The database is mocked so these run without a live Postgres instance.
 *
 * Controllers now signal failure by passing an AppError to next() rather than by calling
 * res.status() before throwing, so these assert on the forwarded error's statusCode.
 */
jest.mock('../src/config/database', () => ({
  query: jest.fn(),
  pool: { connect: jest.fn() }
}));

const db = require('../src/config/database');
const { requireRole } = require('../src/middleware/roleMiddleware');
const { updateMemberWorkoutStatus } = require('../src/controllers/memberWorkoutController');
const { deleteWorkoutPlan } = require('../src/controllers/workoutPlanController');

const makeRes = () => {
  const res = { statusCode: 200 };
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn(() => res);
  return res;
};

// The status a handler rejected with, read off the error it forwarded.
const rejectedWith = (next) => next.mock.calls[0][0].statusCode;

describe('requireRole', () => {
  it('rejects a user whose role is not in the allowed list', () => {
    const res = makeRes();
    const next = jest.fn();
    requireRole('admin')({ user: { role: 'member' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request', () => {
    const res = makeRes();
    const next = jest.fn();
    requireRole('admin')({}, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('allows a matching role through', () => {
    const res = makeRes();
    const next = jest.fn();
    requireRole('admin', 'receptionist')({ user: { role: 'receptionist' } }, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('PATCH /member-workouts/:id ownership', () => {
  const assignment = { member_id: 1, assigned_by_trainer_id: 7 };

  beforeEach(() => {
    db.query.mockReset();
    db.query.mockResolvedValue({ rows: [assignment] });
  });

  it('blocks a member from editing another member\'s assignment', async () => {
    const res = makeRes();
    const next = jest.fn();
    await updateMemberWorkoutStatus(
      { params: { id: '8' }, body: { status: 'cancelled' }, user: { role: 'member', member_id: 99 } },
      res, next
    );
    expect(rejectedWith(next)).toBe(403);
    // The UPDATE must never be issued.
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('blocks a trainer from editing an assignment they did not create', async () => {
    const res = makeRes();
    const next = jest.fn();
    await updateMemberWorkoutStatus(
      { params: { id: '8' }, body: { status: 'completed' }, user: { role: 'trainer', trainer_id: 3 } },
      res, next
    );
    expect(rejectedWith(next)).toBe(403);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('lets the owning member update their own assignment', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [assignment] })
      .mockResolvedValueOnce({ rows: [{ member_workout_id: 8, status: 'in_progress' }] });
    const res = makeRes();
    const next = jest.fn();
    await updateMemberWorkoutStatus(
      { params: { id: '8' }, body: { status: 'in_progress' }, user: { role: 'member', member_id: 1 } },
      res, next
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 404 for an assignment that does not exist', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = makeRes();
    const next = jest.fn();
    await updateMemberWorkoutStatus(
      { params: { id: '404' }, body: { status: 'completed' }, user: { role: 'admin' } },
      res, next
    );
    expect(rejectedWith(next)).toBe(404);
  });

  it('rejects a non-numeric id before touching the database', async () => {
    const res = makeRes();
    const next = jest.fn();
    await updateMemberWorkoutStatus(
      { params: { id: 'abc' }, body: { status: 'completed' }, user: { role: 'admin' } },
      res, next
    );
    expect(rejectedWith(next)).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects an empty patch body', async () => {
    const res = makeRes();
    const next = jest.fn();
    await updateMemberWorkoutStatus(
      { params: { id: '8' }, body: {}, user: { role: 'admin' } },
      res, next
    );
    expect(rejectedWith(next)).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('DELETE /workout-plans/:id ownership', () => {
  beforeEach(() => db.query.mockReset());

  it('blocks a trainer from deleting a plan authored by someone else', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ trainer_id: 7 }] });
    const res = makeRes();
    const next = jest.fn();
    await deleteWorkoutPlan({ params: { id: '1' }, user: { role: 'trainer', trainer_id: 3 } }, res, next);
    expect(rejectedWith(next)).toBe(403);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('lets the authoring trainer delete their own plan', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ trainer_id: 3 }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = makeRes();
    const next = jest.fn();
    await deleteWorkoutPlan({ params: { id: '1' }, user: { role: 'trainer', trainer_id: 3 } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('lets an admin delete any plan', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ trainer_id: 7 }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = makeRes();
    const next = jest.fn();
    await deleteWorkoutPlan({ params: { id: '1' }, user: { role: 'admin' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

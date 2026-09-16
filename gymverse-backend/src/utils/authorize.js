const db = require('../config/database');
const { forbidden, badRequest } = require('./AppError');

// Front-desk roles see the whole gym by definition: they take payments, register
// walk-ins, and run the attendance desk.
const STAFF_ROLES = ['admin', 'receptionist'];

const isStaff = (role) => STAFF_ROLES.includes(role);

/**
 * Parses a :id path parameter that must be a positive integer.
 *
 * `parseInt('12abc')` is 12 and `parseInt('abc')` is NaN — the first silently accepts
 * junk and the second used to flow into a query as NaN, so validate the whole string.
 */
const parseId = (value, label = 'id') => {
  if (!/^\d+$/.test(String(value ?? '').trim())) {
    throw badRequest(`Invalid ${label}: expected a positive integer`);
  }
  const parsed = parseInt(value, 10);
  if (parsed < 1) {
    throw badRequest(`Invalid ${label}: expected a positive integer`);
  }
  return parsed;
};

/**
 * True when the trainer currently has this member on their roster.
 *
 * `trainer_assignments` has been in the schema from the start but nothing consulted it,
 * which is why every trainer could read every member's records.
 */
const trainerOwnsMember = async (trainerId, memberId) => {
  if (!trainerId) return false;
  const result = await db.query(
    `SELECT 1 FROM trainer_assignments
     WHERE trainer_id = $1 AND member_id = $2 AND status = 'active'
       AND (end_date IS NULL OR end_date >= CURRENT_DATE)
     LIMIT 1`,
    [trainerId, memberId]
  );
  return result.rows.length > 0;
};

/**
 * Guards training data (attendance, sessions, assigned workouts, class bookings).
 * Staff see everything; a member sees only themselves; a trainer sees only the
 * members actually assigned to them.
 */
const assertMemberDataAccess = async (req, memberId) => {
  const { role, member_id: ownMemberId, trainer_id: trainerId } = req.user;

  if (isStaff(role)) return;

  if (role === 'member') {
    if (ownMemberId !== memberId) {
      throw forbidden('Forbidden: You can only access your own records');
    }
    return;
  }

  if (role === 'trainer') {
    if (!(await trainerOwnsMember(trainerId, memberId))) {
      throw forbidden('Forbidden: This member is not assigned to you');
    }
    return;
  }

  throw forbidden('Forbidden: You do not have the required permissions');
};

/**
 * Guards money — payments and subscriptions. Deliberately stricter than
 * assertMemberDataAccess: a trainer has no business reading a client's billing
 * history even for their own clients.
 */
const assertFinancialAccess = (req, memberId) => {
  const { role, member_id: ownMemberId } = req.user;

  if (isStaff(role)) return;

  if (role === 'member' && ownMemberId === memberId) return;

  throw forbidden('Forbidden: You cannot view these financial records');
};

module.exports = {
  isStaff,
  parseId,
  trainerOwnsMember,
  assertMemberDataAccess,
  assertFinancialAccess
};

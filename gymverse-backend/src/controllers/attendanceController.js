const db = require('../config/database');
const { paginate } = require('../utils/pagination');
const { parseId, assertMemberDataAccess, isStaff } = require('../utils/authorize');
const { badRequest, notFoundError, conflict, forbidden } = require('../utils/AppError');

// Resolves whose attendance a request is about. A member is always themselves; staff may
// name any member (that is the front desk's job). A trainer may only act for a member on
// their own roster.
const resolveMemberId = async (req) => {
  if (req.user.role === 'member') {
    if (!req.user.member_id) {
      throw badRequest('This account is not linked to a member record');
    }
    return req.user.member_id;
  }

  const memberId = req.body.member_id;
  if (memberId === undefined || memberId === null || memberId === '') {
    throw badRequest('member_id is required');
  }

  const parsed = parseId(memberId, 'member_id');
  if (!isStaff(req.user.role)) {
    await assertMemberDataAccess(req, parsed);
  }
  return parsed;
};

const checkIn = async (req, res, next) => {
  try {
    const member_id = await resolveMemberId(req);

    // Only active members may check in. Letting a suspended or expired membership through
    // the turnstile is the one thing this endpoint exists to prevent.
    const member = await db.query('SELECT status FROM members WHERE member_id = $1', [member_id]);
    if (member.rows.length === 0) {
      throw notFoundError('Member not found');
    }
    if (member.rows[0].status !== 'active') {
      throw forbidden(`Membership is ${member.rows[0].status}; check-in is not allowed`);
    }

    // Check whether the member has an open check-in today. The partial unique index
    // uniq_open_attendance_per_day is the real guarantee under concurrency; this check
    // exists so the common case gets a clear 409 instead of a constraint error.
    const existingCheckIn = await db.query(
      `SELECT attendance_id FROM attendance WHERE member_id = $1 AND attendance_date = CURRENT_DATE AND check_out_time IS NULL`,
      [member_id]
    );

    if (existingCheckIn.rows.length > 0) {
      throw conflict('Member already checked in and has not checked out.');
    }

    const result = await db.query(
      `INSERT INTO attendance (member_id, attendance_date, check_in_time, check_in_method)
       VALUES ($1, CURRENT_DATE, CURRENT_TIME, $2) RETURNING *`,
      [member_id, req.body.check_in_method || 'manual']
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    // Two simultaneous check-ins both pass the read above; the unique index catches the
    // loser, and it means the same thing as the check that just missed it.
    if (error.code === '23505') {
      return next(conflict('Member already checked in and has not checked out.'));
    }
    next(error);
  }
};

const checkOut = async (req, res, next) => {
  try {
    const member_id = await resolveMemberId(req);

    const result = await db.query(
      `UPDATE attendance SET check_out_time = CURRENT_TIME
       WHERE member_id = $1 AND attendance_date = CURRENT_DATE AND check_out_time IS NULL
       RETURNING *`,
      [member_id]
    );

    if (result.rows.length === 0) {
      throw notFoundError('No active check-in found for today to check out from.');
    }

    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const getAttendanceHistory = async (req, res, next) => {
  try {
    // Joined to members so the log shows names instead of bare numeric IDs.
    const { data, meta } = await paginate(req, {
      maxLimit: 100,
      select: 'a.*, m.member_name, m.member_code',
      from: 'attendance a JOIN members m ON a.member_id = m.member_id',
      orderBy: 'a.attendance_date DESC, a.check_in_time DESC',
    });
    res.status(200).json({ success: true, data, meta });
  } catch (error) { next(error); }
};

const getMemberAttendance = async (req, res, next) => {
  try {
    const member_id = parseId(req.params.id, 'member id');
    await assertMemberDataAccess(req, member_id);

    const { data, meta } = await paginate(req, {
      maxLimit: 200,
      select: '*',
      from: 'attendance WHERE member_id = $1',
      orderBy: 'attendance_date DESC',
      params: [member_id],
    });
    res.status(200).json({ success: true, data, meta });
  } catch (error) { next(error); }
};

module.exports = { checkIn, checkOut, getAttendanceHistory, getMemberAttendance };

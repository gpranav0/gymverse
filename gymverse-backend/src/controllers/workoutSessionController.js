const db = require('../config/database');
const { paginate } = require('../utils/pagination');
const { parseId, assertMemberDataAccess, isStaff } = require('../utils/authorize');
const { badRequest } = require('../utils/AppError');

const logWorkoutSession = async (req, res, next) => {
  try {
    const { workout_plan_id, duration_minutes, calories_burned, completed, notes } = req.body;

    let member_id;
    if (req.user.role === 'member') {
      member_id = req.user.member_id;
      if (!member_id) { throw badRequest('This account is not linked to a member record'); }
    } else {
      if (req.body.member_id === undefined) { throw badRequest('member_id is required'); }
      member_id = parseId(req.body.member_id, 'member_id');
      // A trainer may log a session only for a member on their own roster.
      if (!isStaff(req.user.role)) {
        await assertMemberDataAccess(req, member_id);
      }
    }

    const result = await db.query(
      `INSERT INTO workout_sessions (member_id, workout_plan_id, session_date, duration_minutes, calories_burned, completed, notes)
       VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4, $5, $6) RETURNING *`,
      [member_id, workout_plan_id ?? null, duration_minutes ?? null, calories_burned ?? null,
        completed !== undefined ? completed : true, notes || null]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const getMemberSessions = async (req, res, next) => {
  try {
    const member_id = parseId(req.params.id, 'member id');
    await assertMemberDataAccess(req, member_id);

    const { data, meta } = await paginate(req, {
      maxLimit: 200,
      select: 'ws.*, wp.plan_name',
      from: `workout_sessions ws
             LEFT JOIN workout_plans wp ON ws.workout_plan_id = wp.workout_plan_id
             WHERE ws.member_id = $1`,
      orderBy: 'ws.session_date DESC',
      params: [member_id],
    });
    res.status(200).json({ success: true, data, meta });
  } catch (error) { next(error); }
};

module.exports = { logWorkoutSession, getMemberSessions };

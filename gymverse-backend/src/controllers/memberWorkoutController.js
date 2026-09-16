const db = require('../config/database');
const { paginate } = require('../utils/pagination');
const { parseId, assertMemberDataAccess, isStaff } = require('../utils/authorize');
const { badRequest, forbidden, notFoundError } = require('../utils/AppError');

const assignWorkout = async (req, res, next) => {
  try {
    const { member_id, workout_plan_id, start_date, end_date, notes } = req.body;

    // A trainer always assigns as themselves; an admin must name the trainer explicitly,
    // otherwise the assignment lands with a NULL author and nobody can be held to it.
    let trainer_id;
    if (req.user.role === 'trainer') {
      trainer_id = req.user.trainer_id;
      // Trainers may only assign work to members on their own roster.
      await assertMemberDataAccess(req, member_id);
    } else {
      if (req.body.assigned_by_trainer_id === undefined) {
        throw badRequest('assigned_by_trainer_id is required when assigning on behalf of a trainer');
      }
      trainer_id = parseId(req.body.assigned_by_trainer_id, 'assigned_by_trainer_id');
    }

    // end_date before start_date would produce an assignment that can never be completed.
    if (start_date && end_date && new Date(end_date) < new Date(start_date)) {
      throw badRequest('end_date must be on or after start_date');
    }

    const result = await db.query(
      `INSERT INTO member_workouts (member_id, workout_plan_id, assigned_by_trainer_id, assigned_date, start_date, end_date, status, notes)
       VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, 'assigned', $6) RETURNING *`,
      [member_id, workout_plan_id, trainer_id, start_date || null, end_date || null, notes || null]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const getMemberWorkouts = async (req, res, next) => {
  try {
    const member_id = parseId(req.params.id, 'member id');
    await assertMemberDataAccess(req, member_id);

    const { data, meta } = await paginate(req, {
      maxLimit: 200,
      select: 'mw.*, wp.plan_name, wp.difficulty_level',
      from: `member_workouts mw
             JOIN workout_plans wp ON mw.workout_plan_id = wp.workout_plan_id
             WHERE mw.member_id = $1`,
      orderBy: 'mw.assigned_date DESC',
      params: [member_id],
    });
    res.status(200).json({ success: true, data, meta });
  } catch (error) { next(error); }
};

const updateMemberWorkoutStatus = async (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'assignment id');
    const { status, completion_percentage, notes } = req.body;

    if (status === undefined && completion_percentage === undefined && notes === undefined) {
      throw badRequest('No valid fields provided for update');
    }

    const existing = await db.query(
      'SELECT member_id, assigned_by_trainer_id FROM member_workouts WHERE member_workout_id = $1',
      [id]
    );
    if (existing.rows.length === 0) { throw notFoundError('Assignment not found'); }

    // RBAC: members may only update their own assignment; trainers only the ones they
    // assigned; staff may correct any of them.
    const assignment = existing.rows[0];
    if (req.user.role === 'member' && req.user.member_id !== assignment.member_id) {
      throw forbidden('Forbidden: Cannot update another member\'s assignment');
    }
    if (req.user.role === 'trainer' && req.user.trainer_id !== assignment.assigned_by_trainer_id) {
      throw forbidden('Forbidden: You can only update assignments you created');
    }
    if (!isStaff(req.user.role) && req.user.role !== 'member' && req.user.role !== 'trainer') {
      throw forbidden('Forbidden: You do not have the required permissions');
    }

    const result = await db.query(
      `UPDATE member_workouts
       SET status = COALESCE($1, status),
           completion_percentage = COALESCE($2, completion_percentage),
           notes = COALESCE($3, notes)
       WHERE member_workout_id = $4 RETURNING *`,
      [status ?? null, completion_percentage ?? null, notes ?? null, id]
    );

    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

module.exports = { assignWorkout, getMemberWorkouts, updateMemberWorkoutStatus };

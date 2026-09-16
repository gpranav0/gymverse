const db = require('../config/database');
const { paginate } = require('../utils/pagination');
const { parseId } = require('../utils/authorize');
const { badRequest, forbidden, notFoundError } = require('../utils/AppError');
const { withTransaction } = require('../utils/transaction');

const getWorkoutPlans = async (req, res, next) => {
  try {
    const { data, meta } = await paginate(req, {
      defaultLimit: 50,
      maxLimit: 200,
      select: 'wp.*, t.trainer_name',
      from: 'workout_plans wp LEFT JOIN trainers t ON wp.trainer_id = t.trainer_id',
      orderBy: 'wp.created_at DESC',
    });
    res.status(200).json({ success: true, data, meta });
  } catch (error) { next(error); }
};

const getWorkoutPlanById = async (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'workout plan id');

    const planResult = await db.query('SELECT * FROM workout_plans WHERE workout_plan_id = $1', [id]);
    if (planResult.rows.length === 0) { throw notFoundError('Workout plan not found'); }

    const exercisesResult = await db.query(
      `SELECT wpe.*, e.exercise_name
       FROM workout_plan_exercises wpe
       JOIN exercises e ON wpe.exercise_id = e.exercise_id
       WHERE wpe.workout_plan_id = $1 ORDER BY wpe.day_number ASC, wpe.order_number ASC`,
      [id]
    );

    res.status(200).json({ success: true, data: { ...planResult.rows[0], exercises: exercisesResult.rows } });
  } catch (error) { next(error); }
};

const createWorkoutPlan = async (req, res, next) => {
  try {
    const { plan_name, description, goal_type, difficulty_level, duration_weeks, exercises } = req.body;

    // A trainer always authors as themselves; an admin must name the trainer. Falling
    // back to NULL left plans nobody owned, which then bypassed the ownership check in
    // deleteWorkoutPlan because `trainer_id !== null` is true for every trainer.
    let trainer_id;
    if (req.user.role === 'trainer') {
      trainer_id = req.user.trainer_id;
    } else {
      if (req.body.trainer_id === undefined) {
        throw badRequest('trainer_id is required when creating a plan on behalf of a trainer');
      }
      trainer_id = parseId(req.body.trainer_id, 'trainer_id');
    }

    const plan = await withTransaction(async (client) => {
      const { rows: [created] } = await client.query(
        `INSERT INTO workout_plans (trainer_id, plan_name, description, goal_type, difficulty_level, duration_weeks)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [trainer_id, plan_name, description || null, goal_type || null, difficulty_level || null, duration_weeks ?? null]
      );

      // One statement for the whole list (capped at MAX_PLAN_EXERCISES by the validator),
      // rather than a round trip per exercise.
      if (Array.isArray(exercises) && exercises.length > 0) {
        const rows = exercises.map((ex) => ({
          exercise_id: ex.exercise_id, day_number: ex.day_number ?? null, order_number: ex.order_number ?? null,
          sets: ex.sets ?? null, repetitions: ex.repetitions ?? null, duration_seconds: ex.duration_seconds ?? null,
          rest_seconds: ex.rest_seconds ?? null, notes: ex.notes || null,
        }));
        await client.query(
          `INSERT INTO workout_plan_exercises (workout_plan_id, exercise_id, day_number, order_number, sets, repetitions, duration_seconds, rest_seconds, notes)
           SELECT $1, x.exercise_id, x.day_number, x.order_number, x.sets, x.repetitions, x.duration_seconds, x.rest_seconds, x.notes
           FROM jsonb_to_recordset($2::jsonb) AS x(exercise_id INT, day_number INT, order_number INT, sets INT,
                                                   repetitions INT, duration_seconds INT, rest_seconds INT, notes TEXT)`,
          [created.workout_plan_id, JSON.stringify(rows)]
        );
      }
      return created;
    });

    res.status(201).json({ success: true, data: plan });
  } catch (error) { next(error); }
};

const deleteWorkoutPlan = async (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'workout plan id');

    const existing = await db.query('SELECT trainer_id FROM workout_plans WHERE workout_plan_id = $1', [id]);
    if (existing.rows.length === 0) { throw notFoundError('Workout plan not found'); }

    // Trainers may only delete plans they authored; admins may delete any.
    if (req.user.role === 'trainer' && req.user.trainer_id !== existing.rows[0].trainer_id) {
      throw forbidden('Forbidden: You can only delete workout plans you created');
    }

    await db.query('DELETE FROM workout_plans WHERE workout_plan_id = $1', [id]);
    res.status(200).json({ success: true, message: 'Workout plan deleted' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getWorkoutPlans, getWorkoutPlanById, createWorkoutPlan, deleteWorkoutPlan };

const db = require('../config/database');
const { paginate } = require('../utils/pagination');
const { parseId } = require('../utils/authorize');
const { notFoundError } = require('../utils/AppError');

const getExercises = async (req, res, next) => {
  try {
    const search = (req.query.search || '').trim();
    const muscleGroup = (req.query.muscle_group || '').trim();

    const conditions = [];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`exercise_name ILIKE $${params.length}`);
    }
    if (muscleGroup) {
      params.push(`%${muscleGroup}%`);
      conditions.push(`muscle_group ILIKE $${params.length}`);
    }

    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';

    const { data, meta } = await paginate(req, {
      select: '*', from: `exercises${where}`, orderBy: 'exercise_name ASC', params,
    });
    res.status(200).json({ success: true, data, meta });
  } catch (error) { next(error); }
};

const getExerciseById = async (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'exercise id');
    const result = await db.query('SELECT * FROM exercises WHERE exercise_id = $1', [id]);
    if (result.rows.length === 0) { throw notFoundError('Exercise not found'); }
    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

// The columns an exercise form sends, in the order both statements below use them.
const exerciseValues = (body) => [
  body.exercise_name, body.description || null, body.muscle_group || null, body.secondary_muscle_group || null,
  body.equipment_required || null, body.difficulty_level || null, body.instructions || null,
];

const createExercise = async (req, res, next) => {
  try {
    const result = await db.query(
      `INSERT INTO exercises (exercise_name, description, muscle_group, secondary_muscle_group, equipment_required, difficulty_level, instructions)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      exerciseValues(req.body)
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const updateExercise = async (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'exercise id');
    const result = await db.query(
      `UPDATE exercises SET exercise_name = $1, description = $2, muscle_group = $3, secondary_muscle_group = $4,
              equipment_required = $5, difficulty_level = $6, instructions = $7
       WHERE exercise_id = $8 RETURNING *`,
      [...exerciseValues(req.body), id]
    );
    if (result.rows.length === 0) { throw notFoundError('Exercise not found'); }
    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const deleteExercise = async (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'exercise id');
    const result = await db.query('DELETE FROM exercises WHERE exercise_id = $1 RETURNING exercise_id', [id]);
    if (result.rows.length === 0) { throw notFoundError('Exercise not found'); }
    res.status(200).json({ success: true, message: 'Exercise deleted' });
  } catch (error) {
    if (error.code === '23503') {
      // More specific than the generic foreign-key message the error handler would use.
      error.statusCode = 409;
      error.message = 'Cannot delete exercise because it is part of a workout plan.';
    }
    next(error);
  }
};

module.exports = { getExercises, getExerciseById, createExercise, updateExercise, deleteExercise };

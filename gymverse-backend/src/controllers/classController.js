const db = require('../config/database');
const { paginate } = require('../utils/pagination');
const { parseId } = require('../utils/authorize');
const { notFoundError } = require('../utils/AppError');

const getClasses = async (req, res, next) => {
  try {
    // Public catalogue: anonymous callers see only classes on offer. Admins, who manage
    // them, see retired ones too.
    const staffView = req.user && req.user.role === 'admin';

    const { data, meta } = await paginate(req, {
      select: '*',
      from: `fitness_classes${staffView ? '' : ` WHERE status = 'active'`}`,
      orderBy: 'class_name ASC',
    });
    res.status(200).json({ success: true, data, meta });
  } catch (error) { next(error); }
};

const getClassById = async (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'class id');
    const result = await db.query('SELECT * FROM fitness_classes WHERE class_id = $1', [id]);
    if (result.rows.length === 0) { throw notFoundError('Class not found'); }
    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const createClass = async (req, res, next) => {
  try {
    const { class_name, description, difficulty_level, duration_minutes, status } = req.body;
    const result = await db.query(
      `INSERT INTO fitness_classes (class_name, description, difficulty_level, duration_minutes, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [class_name, description || null, difficulty_level || null, duration_minutes ?? null, status || 'active']
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const updateClass = async (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'class id');
    const { class_name, description, difficulty_level, duration_minutes, status } = req.body;

    // status is optional on PUT. Defaulting an omitted status to 'active' silently
    // reactivated retired classes on any edit, so an omitted status keeps the current one.
    const result = await db.query(
      `UPDATE fitness_classes SET class_name = $1, description = $2, difficulty_level = $3,
              duration_minutes = $4, status = COALESCE($5, status)
       WHERE class_id = $6 RETURNING *`,
      [class_name, description || null, difficulty_level || null, duration_minutes ?? null, status || null, id]
    );
    if (result.rows.length === 0) { throw notFoundError('Class not found'); }
    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const deleteClass = async (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'class id');
    const result = await db.query('DELETE FROM fitness_classes WHERE class_id = $1 RETURNING class_id', [id]);
    if (result.rows.length === 0) { throw notFoundError('Class not found'); }
    res.status(200).json({ success: true, message: 'Class deleted' });
  } catch (error) {
    if (error.code === '23503') {
      error.statusCode = 409;
      error.message = 'Cannot delete class because it has schedules.';
    }
    next(error);
  }
};

module.exports = { getClasses, getClassById, createClass, updateClass, deleteClass };

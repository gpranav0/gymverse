const db = require('../config/database');
const { paginate } = require('../utils/pagination');
const { buildUpdate, buildReplace } = require('../utils/updateBuilder');
const { parseId } = require('../utils/authorize');
const { forbidden, notFoundError } = require('../utils/AppError');

// Members get a public projection: contact details are withheld.
const PUBLIC_COLUMNS = 'trainer_id, trainer_code, trainer_name, specialization, qualification, experience_years, bio, shift, status';
const STAFF_COLUMNS = `${PUBLIC_COLUMNS}, phone, email`;

const WRITABLE_FIELDS = ['trainer_name', 'specialization', 'experience_years', 'phone', 'shift', 'qualification', 'bio', 'status'];
const REQUIRED_ON_PUT = ['trainer_name', 'phone'];

// Only an admin may change a trainer's standing — a trainer must not reactivate themselves.
const skipStatusUnlessAdmin = (role) => (role === 'admin' ? [] : ['status']);

// Choosing the projection in SQL rather than deleting keys afterwards: an earlier version
// fetched the contact details and then relied on remembering to strip them.
const columnsFor = (role) => (role === 'member' ? PUBLIC_COLUMNS : STAFF_COLUMNS);

// @desc    Get all trainers with pagination, search and filtering
// @route   GET /api/trainers
// @access  Private (all authenticated roles)
const getTrainers = async (req, res, next) => {
  try {
    const search = (req.query.search || '').trim();
    const specialization = (req.query.specialization || '').trim();

    const conditions = [];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      const p = `$${params.length}`;
      conditions.push(`(trainer_name ILIKE ${p} OR email ILIKE ${p})`);
    }

    if (specialization) {
      params.push(`%${specialization}%`);
      conditions.push(`specialization ILIKE $${params.length}`);
    }

    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';

    const { data, meta } = await paginate(req, {
      select: columnsFor(req.user.role),
      from: `trainers${where}`,
      orderBy: 'trainer_name ASC',
      params,
    });

    res.status(200).json({ success: true, message: 'Trainers retrieved successfully', data, meta });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single trainer by ID
// @route   GET /api/trainers/:id
// @access  Private
const getTrainerById = async (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'trainer id');

    const result = await db.query(`SELECT ${columnsFor(req.user.role)} FROM trainers WHERE trainer_id = $1`, [id]);

    if (result.rows.length === 0) {
      throw notFoundError('Trainer not found');
    }

    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new trainer
// @route   POST /api/trainers
// @access  Private (Admin)
const createTrainer = async (req, res, next) => {
  try {
    const { trainer_code, trainer_name, specialization, qualification, experience_years, phone, email, shift, bio, status } = req.body;

    const result = await db.query(
      `INSERT INTO trainers
        (trainer_code, trainer_name, specialization, qualification, experience_years, phone, email, shift, bio, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${STAFF_COLUMNS}`,
      [trainer_code, trainer_name, specialization || null, qualification || null,
        experience_years ?? null, phone, email, shift || null, bio || null, status || 'active']
    );

    res.status(201).json({ success: true, message: 'Trainer created successfully', data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

// @desc    Update trainer: PUT replaces (core fields required), PATCH changes what is sent
// @route   PUT|PATCH /api/trainers/:id
// @access  Private (Admin, or self)
const saveTrainer = ({ replace, message }) => async (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'trainer id');

    if (req.user.role === 'trainer' && req.user.trainer_id !== id) {
      throw forbidden('Forbidden: You can only update your own profile');
    }
    if (req.user.role === 'member' || req.user.role === 'receptionist') {
      throw forbidden('Forbidden: Insufficient permissions');
    }

    const options = { skip: skipStatusUnlessAdmin(req.user.role) };
    const { text, params } = replace
      ? buildReplace('trainers', 'trainer_id', id, REQUIRED_ON_PUT,
        WRITABLE_FIELDS.filter((f) => !REQUIRED_ON_PUT.includes(f)), req.body, options)
      : buildUpdate('trainers', 'trainer_id', id, WRITABLE_FIELDS, req.body, options);

    const result = await db.query(text, params);

    if (result.rows.length === 0) {
      throw notFoundError('Trainer not found');
    }

    res.status(200).json({ success: true, message, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

const updateTrainer = saveTrainer({ replace: true, message: 'Trainer updated successfully' });
const patchTrainer = saveTrainer({ replace: false, message: 'Trainer patched successfully' });

// @desc    Delete trainer
// @route   DELETE /api/trainers/:id
// @access  Private (Admin)
const deleteTrainer = async (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'trainer id');

    const result = await db.query('DELETE FROM trainers WHERE trainer_id = $1 RETURNING trainer_id', [id]);

    if (result.rows.length === 0) {
      throw notFoundError('Trainer not found');
    }

    res.status(200).json({ success: true, message: 'Trainer deleted successfully' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTrainers,
  getTrainerById,
  createTrainer,
  updateTrainer,
  patchTrainer,
  deleteTrainer
};

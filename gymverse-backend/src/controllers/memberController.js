const db = require('../config/database');
const { paginate } = require('../utils/pagination');
const { buildUpdate, buildReplace } = require('../utils/updateBuilder');
const { isStaff, parseId, trainerOwnsMember } = require('../utils/authorize');
const { forbidden, notFoundError } = require('../utils/AppError');

// Columns safe to return in a list. `SELECT *` used to hand every caller the member's
// address, date of birth and emergency contacts.
const LIST_COLUMNS = 'member_id, member_code, member_name, email, phone, status, join_date';

// The full record, for the member themselves and for staff.
const DETAIL_COLUMNS = `member_id, member_code, member_name, gender, date_of_birth, phone, email,
  address, emergency_contact_name, emergency_contact_phone, join_date, status, profile_photo_url,
  created_at, updated_at`;

// What a trainer may see about a client: enough to coach them, minus the personal file.
const TRAINER_VISIBLE_COLUMNS = `member_id, member_code, member_name, gender, date_of_birth,
  phone, email, join_date, status, profile_photo_url`;

// Fields a caller may write. `status` is filtered separately by role.
const WRITABLE_FIELDS = ['member_name', 'phone', 'address', 'emergency_contact_name', 'emergency_contact_phone', 'status'];
const REQUIRED_ON_PUT = ['member_name', 'phone'];

// Only the front desk may change a member's standing.
const skipStatusUnlessStaff = (role) => (isStaff(role) ? [] : ['status']);

// @desc    Get all members with pagination and search
// @route   GET /api/members
// @access  Private (Admin, Receptionist, Trainer)
const getMembers = async (req, res, next) => {
  try {
    const search = (req.query.search || '').trim();

    const conditions = [];
    const params = [];

    // A trainer's list is scoped to their own roster, matching what they are allowed to
    // open. Previously the list returned the entire membership to every trainer.
    if (req.user.role === 'trainer') {
      params.push(req.user.trainer_id);
      conditions.push(`m.member_id IN (
        SELECT ta.member_id FROM trainer_assignments ta
        WHERE ta.trainer_id = $${params.length} AND ta.status = 'active'
          AND (ta.end_date IS NULL OR ta.end_date >= CURRENT_DATE)
      )`);
    }

    if (search) {
      params.push(`%${search}%`);
      const p = `$${params.length}`;
      conditions.push(`(m.member_name ILIKE ${p} OR m.email ILIKE ${p} OR m.phone ILIKE ${p})`);
    }

    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const columns = req.user.role === 'trainer' ? TRAINER_VISIBLE_COLUMNS : LIST_COLUMNS;

    const { data, meta } = await paginate(req, {
      select: columns.split(',').map((c) => `m.${c.trim()}`).join(', '),
      from: `members m${where}`,
      orderBy: 'm.created_at DESC',
      params,
    });

    res.status(200).json({ success: true, message: 'Members retrieved successfully', data, meta });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single member by ID
// @route   GET /api/members/:id
// @access  Private (Admin, Receptionist, assigned Trainer, or self)
const getMemberById = async (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'member id');
    const { role } = req.user;

    if (role === 'member' && req.user.member_id !== id) {
      throw forbidden('Forbidden: You can only view your own profile');
    }
    if (role === 'trainer' && !(await trainerOwnsMember(req.user.trainer_id, id))) {
      throw forbidden('Forbidden: This member is not assigned to you');
    }

    // Trainers get the coaching projection; staff and the member get the full record.
    const columns = role === 'trainer' ? TRAINER_VISIBLE_COLUMNS : DETAIL_COLUMNS;

    const result = await db.query(`SELECT ${columns} FROM members WHERE member_id = $1`, [id]);

    if (result.rows.length === 0) {
      throw notFoundError('Member not found');
    }

    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new member
// @route   POST /api/members
// @access  Private (Admin, Receptionist)
const createMember = async (req, res, next) => {
  try {
    const { member_code, member_name, gender, date_of_birth, phone, email, address, emergency_contact_name, emergency_contact_phone, status } = req.body;

    const result = await db.query(
      `INSERT INTO members
        (member_code, member_name, gender, date_of_birth, phone, email, address, emergency_contact_name, emergency_contact_phone, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${DETAIL_COLUMNS}`,
      [member_code, member_name, gender || null, date_of_birth || null, phone, email, address || null,
        emergency_contact_name || null, emergency_contact_phone || null, status || 'active']
    );

    res.status(201).json({ success: true, message: 'Member created successfully', data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

// @desc    Update member: PUT replaces (core fields required), PATCH changes what is sent
// @route   PUT|PATCH /api/members/:id
// @access  Private (Admin, Receptionist, or self)
const saveMember = ({ replace, message }) => async (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'member id');

    if (req.user.role === 'trainer') {
      throw forbidden('Forbidden: Trainers cannot edit member profiles');
    }
    if (req.user.role === 'member' && req.user.member_id !== id) {
      throw forbidden('Forbidden: You can only update your own profile');
    }

    const options = { skip: skipStatusUnlessStaff(req.user.role) };
    const { text, params } = replace
      ? buildReplace('members', 'member_id', id, REQUIRED_ON_PUT,
        WRITABLE_FIELDS.filter((f) => !REQUIRED_ON_PUT.includes(f)), req.body, options)
      : buildUpdate('members', 'member_id', id, WRITABLE_FIELDS, req.body, options);

    const result = await db.query(text, params);

    if (result.rows.length === 0) {
      throw notFoundError('Member not found');
    }

    res.status(200).json({ success: true, message, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

const updateMember = saveMember({ replace: true, message: 'Member updated successfully' });
const patchMember = saveMember({ replace: false, message: 'Member patched successfully' });

// @desc    Delete member
// @route   DELETE /api/members/:id
// @access  Private (Admin)
const deleteMember = async (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'member id');

    const result = await db.query('DELETE FROM members WHERE member_id = $1 RETURNING member_id', [id]);

    if (result.rows.length === 0) {
      throw notFoundError('Member not found');
    }

    res.status(200).json({ success: true, message: 'Member deleted successfully' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMembers,
  getMemberById,
  createMember,
  updateMember,
  patchMember,
  deleteMember
};

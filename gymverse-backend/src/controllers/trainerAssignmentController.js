const db = require('../config/database');
const { getPagination, buildMeta, paginate } = require('../utils/pagination');
const { parseId, isStaff } = require('../utils/authorize');
const { badRequest, notFoundError, conflict } = require('../utils/AppError');
const { writeAudit } = require('../utils/audit');
const { withTransaction } = require('../utils/transaction');

// Trainer rosters decide what a trainer may read about members (utils/authorize.js), yet
// nothing in the app could write them — they were only changeable with raw SQL.

const COLUMNS = `ta.assignment_id, ta.member_id, m.member_name, m.member_code, m.status AS member_status,
                 ta.trainer_id, t.trainer_name, t.specialization, ta.start_date, ta.end_date,
                 ta.status, ta.notes, ta.created_at, ta.updated_at`;
const FROM = `trainer_assignments ta
              JOIN members m ON m.member_id = ta.member_id
              JOIN trainers t ON t.trainer_id = ta.trainer_id`;

const findAssignment = async (id) =>
  (await db.query(`SELECT ${COLUMNS} FROM ${FROM} WHERE ta.assignment_id = $1`, [id])).rows[0];

// @route GET /api/trainer-assignments   ?status=active|completed|cancelled|all&trainer_id&member_id
// Staff see every roster; a trainer sees their own; a member sees their own trainers.
const getAssignments = async (req, res, next) => {
  try {
    const limits = { defaultLimit: 50, maxLimit: 200 };
    const conditions = [];
    const params = [];
    const add = (sql, value) => { params.push(value); conditions.push(sql.replace('?', `$${params.length}`)); };
    const none = () => {
      const { page, limit } = getPagination(req, limits);
      return res.status(200).json({ success: true, data: [], meta: buildMeta(page, limit, 0) });
    };

    const status = req.query.status || 'active';
    if (status !== 'all') add('ta.status = ?', status);

    if (req.user.role === 'trainer') {
      if (!req.user.trainer_id) return none();
      add('ta.trainer_id = ?', req.user.trainer_id);
    } else if (req.user.role === 'member') {
      if (!req.user.member_id) return none();
      add('ta.member_id = ?', req.user.member_id);
    } else if (isStaff(req.user.role)) {
      if (req.query.trainer_id) add('ta.trainer_id = ?', parseId(req.query.trainer_id, 'trainer_id'));
      if (req.query.member_id) add('ta.member_id = ?', parseId(req.query.member_id, 'member_id'));
    }

    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const { data, meta } = await paginate(req, {
      ...limits,
      select: COLUMNS,
      from: `${FROM}${where}`,
      orderBy: "ta.status = 'active' DESC, ta.start_date DESC, ta.assignment_id DESC",
      params,
    });

    res.status(200).json({ success: true, data, meta });
  } catch (error) { next(error); }
};

// @route POST /api/trainer-assignments   (admin, receptionist)
const createAssignment = async (req, res, next) => {
  try {
    const { member_id, trainer_id, start_date, end_date, notes } = req.body;

    if (start_date && end_date && new Date(end_date) < new Date(start_date)) {
      throw badRequest('end_date must be on or after start_date');
    }

    const id = await withTransaction(async (client) => {
      const member = await client.query('SELECT member_id, status FROM members WHERE member_id = $1', [member_id]);
      if (!member.rows[0]) throw notFoundError('Member not found');

      const trainer = await client.query('SELECT trainer_id, status FROM trainers WHERE trainer_id = $1', [trainer_id]);
      if (!trainer.rows[0]) throw notFoundError('Trainer not found');
      if (trainer.rows[0].status !== 'active') throw conflict('That trainer is not active and cannot take on members');

      const result = await client.query(
        `INSERT INTO trainer_assignments (member_id, trainer_id, start_date, end_date, status, notes)
         VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4, 'active', $5)
         RETURNING assignment_id`,
        [member_id, trainer_id, start_date || null, end_date || null, notes || null]
      );
      const assignmentId = result.rows[0].assignment_id;
      await writeAudit(client, { userId: req.user.user_id, action: 'assign_trainer', table: 'trainer_assignments', recordId: assignmentId, newData: { member_id, trainer_id } });
      return assignmentId;
    });

    res.status(201).json({ success: true, data: await findAssignment(id) });
  } catch (error) {
    if (error.code === '23505') return next(conflict('This member is already assigned to that trainer'));
    next(error);
  }
};

// @route PATCH /api/trainer-assignments/:id   (admin, receptionist)
// Ending an assignment (completed/cancelled) without an end_date stamps today; reactivating
// clears the end date. The unique index stops a reactivation from duplicating a pair.
const updateAssignment = async (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'assignment id');
    const { status, end_date, notes } = req.body;
    if (status === undefined && end_date === undefined && notes === undefined) {
      throw badRequest('No valid fields provided for update');
    }

    await withTransaction(async (client) => {
      const existing = await client.query('SELECT * FROM trainer_assignments WHERE assignment_id = $1 FOR UPDATE', [id]);
      if (!existing.rows[0]) throw notFoundError('Assignment not found');
      const before = existing.rows[0];

      if (end_date && new Date(end_date) < new Date(before.start_date)) {
        throw badRequest('end_date must be on or after the start date');
      }

      await client.query(
        `UPDATE trainer_assignments SET
           status = COALESCE($1::text, status),
           end_date = CASE
             WHEN $2::date IS NOT NULL THEN $2::date
             WHEN $1::text IN ('completed', 'cancelled') THEN COALESCE(end_date, GREATEST(start_date, CURRENT_DATE))
             WHEN $1::text = 'active' THEN NULL
             ELSE end_date END,
           notes = COALESCE($3::text, notes)
         WHERE assignment_id = $4`,
        [status ?? null, end_date || null, notes ?? null, id]
      );
      await writeAudit(client, {
        userId: req.user.user_id, action: 'update_trainer_assignment', table: 'trainer_assignments', recordId: id,
        oldData: { status: before.status, end_date: before.end_date }, newData: { status: status ?? before.status, end_date: end_date ?? null },
      });
    });

    res.status(200).json({ success: true, data: await findAssignment(id) });
  } catch (error) {
    if (error.code === '23505') return next(conflict('This member already has an active assignment with that trainer'));
    next(error);
  }
};

module.exports = { getAssignments, createAssignment, updateAssignment };

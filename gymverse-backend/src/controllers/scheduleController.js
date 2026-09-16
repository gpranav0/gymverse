const db = require('../config/database');
const { paginate } = require('../utils/pagination');
const { parseId, assertMemberDataAccess, isStaff } = require('../utils/authorize');
const { badRequest, notFoundError, conflict } = require('../utils/AppError');
const { writeAudit } = require('../utils/audit');
const { withTransaction } = require('../utils/transaction');

const createSchedule = async (req, res, next) => {
  try {
    const { class_id, trainer_id, class_date, start_time, end_time, capacity, room } = req.body;

    if (end_time <= start_time) {
      throw badRequest('end_time must be after start_time');
    }

    // Double-booking a trainer is the scheduling mistake this table most invites, and
    // no constraint prevents it. OVERLAPS treats the ranges as half-open, so a class
    // that ends exactly when the next begins is not a conflict.
    const clash = await db.query(
      `SELECT schedule_id FROM class_schedules
       WHERE trainer_id = $1 AND class_date = $2 AND status != 'cancelled'
         AND (start_time, end_time) OVERLAPS ($3::time, $4::time)`,
      [trainer_id, class_date, start_time, end_time]
    );
    if (clash.rows.length > 0) {
      throw conflict('That trainer already has a class scheduled in this time slot');
    }

    const result = await db.query(
      `INSERT INTO class_schedules (class_id, trainer_id, class_date, start_time, end_time, capacity, room)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [class_id, trainer_id, class_date, start_time, end_time, capacity, room || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const getSchedules = async (req, res, next) => {
  try {
    // Cancelled sessions are not on the timetable. Listing them showed members an "OPEN"
    // class whose Enrol button could only ever answer 409. An admin managing the timetable
    // can ask for them with ?include=cancelled.
    const showCancelled = req.user?.role === 'admin' && req.query.include === 'cancelled';

    const { data, meta } = await paginate(req, {
      defaultLimit: 50,
      maxLimit: 200,
      select: `cs.*, c.class_name, c.description as class_description, c.difficulty_level as class_difficulty,
               t.trainer_name,
               (SELECT COUNT(*) FROM class_bookings cb WHERE cb.schedule_id = cs.schedule_id AND cb.booking_status = 'booked') as enrolled_count`,
      from: `class_schedules cs
             JOIN fitness_classes c ON cs.class_id = c.class_id
             JOIN trainers t ON cs.trainer_id = t.trainer_id
             WHERE cs.class_date >= CURRENT_DATE${showCancelled ? '' : " AND cs.status <> 'cancelled'"}`,
      orderBy: 'cs.class_date ASC, cs.start_time ASC',
    });

    res.status(200).json({ success: true, data, meta });
  } catch (error) { next(error); }
};

// @route PATCH /api/schedules/:id   (admin)
// Cancel or complete a session, or change its capacity or room. Cancelling releases the
// bookings so they stop counting as upcoming classes for those members.
const updateSchedule = async (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'schedule id');
    const { status, capacity, room } = req.body;
    if (status === undefined && capacity === undefined && room === undefined) {
      throw badRequest('No valid fields provided for update');
    }

    const { schedule, releasedBookings } = await withTransaction(async (client) => {
      const current = await client.query('SELECT * FROM class_schedules WHERE schedule_id = $1 FOR UPDATE', [id]);
      if (!current.rows[0]) throw notFoundError('Class schedule not found');
      const before = current.rows[0];

      if (capacity !== undefined && capacity !== null && capacity !== '') {
        const booked = await client.query(
          `SELECT COUNT(*) FROM class_bookings WHERE schedule_id = $1 AND booking_status = 'booked'`, [id]
        );
        const seats = parseInt(booked.rows[0].count, 10);
        if (Number(capacity) < seats) {
          throw conflict(`Capacity cannot be lower than the ${seats} seat(s) already booked`);
        }
      }

      const { rows: [updated] } = await client.query(
        `UPDATE class_schedules
           SET status = COALESCE($1::text, status),
               capacity = COALESCE($2::int, capacity),
               room = COALESCE($3::text, room)
         WHERE schedule_id = $4 RETURNING *`,
        [status ?? null, capacity === '' ? null : capacity ?? null, room ?? null, id]
      );

      let released = 0;
      if (status === 'cancelled' && before.status !== 'cancelled') {
        const result = await client.query(
          `UPDATE class_bookings SET booking_status = 'cancelled' WHERE schedule_id = $1 AND booking_status = 'booked'`, [id]
        );
        released = result.rowCount;
      }

      await writeAudit(client, {
        userId: req.user.user_id, action: 'update_schedule', table: 'class_schedules', recordId: id,
        oldData: { status: before.status, capacity: before.capacity, room: before.room },
        newData: { status: updated.status, capacity: updated.capacity, room: updated.room, released_bookings: released },
      });
      return { schedule: updated, releasedBookings: released };
    });

    res.status(200).json({ success: true, data: schedule, released_bookings: releasedBookings });
  } catch (error) { next(error); }
};

const enrollInClass = async (req, res, next) => {
  try {
    const schedule_id = parseId(req.params.id, 'schedule id');

    let member_id;
    if (req.user.role === 'member') {
      member_id = req.user.member_id;
      if (!member_id) { throw badRequest('This account is not linked to a member record'); }
    } else {
      if (req.body.member_id === undefined) { throw badRequest('member_id is required'); }
      member_id = parseId(req.body.member_id, 'member_id');
      if (!isStaff(req.user.role)) {
        await assertMemberDataAccess(req, member_id);
      }
    }

    const booking = await withTransaction(async (client) => {
      // Lock the schedule row first, so the capacity check below cannot race another
      // enrolment. Everything that follows is serialised per schedule.
      const scheduleQuery = await client.query(
        // "Already happened" is decided by the database's calendar, the same one class_date
        // was written in. A JS Date comparison depended on the Node process's timezone.
        `SELECT capacity, status, class_date < CURRENT_DATE AS is_past
         FROM class_schedules WHERE schedule_id = $1 FOR UPDATE`,
        [schedule_id]
      );
      if (scheduleQuery.rows.length === 0) { throw notFoundError('Class schedule not found'); }

      const schedule = scheduleQuery.rows[0];
      if (schedule.status === 'cancelled') {
        throw conflict('That class has been cancelled');
      }
      if (schedule.is_past) {
        throw conflict('That class has already taken place');
      }

      // A NULL capacity made `enrolled >= capacity` evaluate to NULL, so the class never
      // filled and the database trigger could not fire either. Treat it as misconfigured
      // rather than unlimited.
      if (schedule.capacity === null || schedule.capacity === undefined) {
        throw conflict('That class has no capacity configured; ask an administrator to set one');
      }

      const existingBooking = await client.query(
        `SELECT booking_id FROM class_bookings WHERE schedule_id = $1 AND member_id = $2 AND booking_status != 'cancelled'`,
        [schedule_id, member_id]
      );
      if (existingBooking.rows.length > 0) {
        throw conflict('Member is already enrolled in this class.');
      }

      const enrolledQuery = await client.query(
        `SELECT COUNT(*) FROM class_bookings WHERE schedule_id = $1 AND booking_status = 'booked'`,
        [schedule_id]
      );
      if (parseInt(enrolledQuery.rows[0].count, 10) >= schedule.capacity) {
        throw conflict('Class capacity is full.');
      }

      const { rows: [created] } = await client.query(
        `INSERT INTO class_bookings (schedule_id, member_id, booking_status, attendance_status)
         VALUES ($1, $2, 'booked', 'pending') RETURNING *`,
        [schedule_id, member_id]
      );
      return created;
    });

    res.status(201).json({ success: true, data: booking });
  } catch (error) {
    // unique_class_booking (schedule_id, member_id) also covers a previously cancelled
    // booking, which the read above deliberately ignores.
    if (error.code === '23505') {
      return next(conflict('Member is already enrolled in this class.'));
    }
    next(error);
  }
};

const getMemberEnrollments = async (req, res, next) => {
  try {
    const member_id = parseId(req.params.id, 'member id');
    await assertMemberDataAccess(req, member_id);

    const { data, meta } = await paginate(req, {
      maxLimit: 200,
      select: 'cb.*, cs.class_date, cs.start_time, c.class_name',
      from: `class_bookings cb
             JOIN class_schedules cs ON cb.schedule_id = cs.schedule_id
             JOIN fitness_classes c ON cs.class_id = c.class_id
             WHERE cb.member_id = $1`,
      orderBy: 'cs.class_date DESC',
      params: [member_id],
    });
    res.status(200).json({ success: true, data, meta });
  } catch (error) { next(error); }
};

module.exports = { createSchedule, getSchedules, updateSchedule, enrollInClass, getMemberEnrollments };

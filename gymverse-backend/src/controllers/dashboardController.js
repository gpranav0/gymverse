const db = require('../config/database');
const { badRequest } = require('../utils/AppError');

const int = (v) => parseInt(v, 10) || 0;

const getOverview = async (req, res, next) => {
  try {
    // One round trip instead of several sequential ones. The counts are independent, so
    // there is no reason to pay several network latencies to assemble one small object.
    const result = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM members) AS members_total,
        (SELECT COUNT(*) FROM members WHERE status = 'active') AS members_active,
        (SELECT COUNT(*) FROM trainers WHERE status = 'active') AS trainers_active,
        (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE payment_status = 'completed') AS revenue_total,
        (SELECT COUNT(*) FROM attendance WHERE attendance_date = CURRENT_DATE) AS attendance_today,
        (SELECT COUNT(*) FROM attendance WHERE attendance_date = CURRENT_DATE AND check_out_time IS NULL) AS on_floor,
        (SELECT COUNT(*) FROM subscriptions
          WHERE subscription_status = 'active' AND end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7) AS expiring_7d,
        (SELECT COUNT(*) FROM payments WHERE payment_status = 'pending') AS payments_pending,
        (SELECT COUNT(*) FROM members WHERE join_date >= CURRENT_DATE - 7) AS joined_7d
    `);

    const row = result.rows[0];

    res.status(200).json({
      success: true,
      data: {
        members: {
          total: int(row.members_total),
          active: int(row.members_active),
          expiring: int(row.expiring_7d),
          joinedThisWeek: int(row.joined_7d)
        },
        trainers: { active: int(row.trainers_active) },
        revenue: { total: parseFloat(row.revenue_total), outstandingCount: int(row.payments_pending) },
        attendance: { today: int(row.attendance_today), onFloor: int(row.on_floor) }
      }
    });
  } catch (error) { next(error); }
};

// The trainer dashboard used to be hardcoded sample data (fixed counts and made-up names).
const getTrainerDashboard = async (req, res, next) => {
  try {
    const trainerId = req.user.trainer_id;
    if (!trainerId) throw badRequest('This account is not linked to a trainer record');

    const ROSTER = `SELECT member_id FROM trainer_assignments
                    WHERE trainer_id = $1 AND status = 'active' AND (end_date IS NULL OR end_date >= CURRENT_DATE)`;

    // Independent reads, so they run on two pool connections at once instead of in turn.
    const [stats, roster] = await Promise.all([
      db.query(`
        SELECT
          (SELECT COUNT(DISTINCT member_id) FROM (${ROSTER}) r) AS roster,
          (SELECT COUNT(*) FROM class_schedules WHERE trainer_id = $1 AND class_date = CURRENT_DATE AND status <> 'cancelled') AS classes_today,
          (SELECT COUNT(*) FROM workout_plans WHERE trainer_id = $1 AND status = 'active') AS active_plans,
          (SELECT COUNT(*) FROM member_workouts WHERE assigned_by_trainer_id = $1 AND status IN ('assigned', 'in_progress')) AS open_assignments,
          (SELECT COALESCE(ROUND(AVG(completion_percentage)), 0) FROM member_workouts
            WHERE assigned_by_trainer_id = $1 AND status IN ('assigned', 'in_progress')) AS avg_completion
      `, [trainerId]),
      db.query(`
        SELECT m.member_id, m.member_name, m.status,
               (SELECT mp.plan_name FROM subscriptions s JOIN membership_plans mp ON mp.plan_id = s.plan_id
                 WHERE s.member_id = m.member_id AND s.subscription_status = 'active' LIMIT 1) AS plan_name,
               (SELECT COUNT(*) FROM attendance a WHERE a.member_id = m.member_id) AS visits,
               (SELECT MAX(a.attendance_date) FROM attendance a WHERE a.member_id = m.member_id) AS last_visit
        FROM members m
        WHERE m.member_id IN (${ROSTER})
        ORDER BY last_visit DESC NULLS LAST, m.member_name
        LIMIT 8
      `, [trainerId]),
    ]);

    const s = stats.rows[0];
    res.status(200).json({
      success: true,
      data: {
        rosterCount: int(s.roster),
        classesToday: int(s.classes_today),
        activePlans: int(s.active_plans),
        openAssignments: int(s.open_assignments),
        avgCompletion: int(s.avg_completion),
        roster: roster.rows.map((r) => ({ ...r, visits: int(r.visits) }))
      }
    });
  } catch (error) { next(error); }
};

// The member dashboard used to be hardcoded sample data as well.
const getMemberDashboard = async (req, res, next) => {
  try {
    const memberId = req.user.member_id;
    if (!memberId) throw badRequest('This account is not linked to a member record');

    // Four independent reads made together; they used to wait on each other in sequence.
    const [stats, nextClass, subscription, workouts] = await Promise.all([
      db.query(`
        SELECT
          (SELECT COUNT(*) FROM attendance WHERE member_id = $1) AS total_visits,
          (SELECT COUNT(*) FROM attendance WHERE member_id = $1 AND attendance_date >= CURRENT_DATE - 30) AS visits_30d,
          (SELECT COUNT(*) FROM workout_sessions WHERE member_id = $1 AND session_date >= CURRENT_DATE - 30) AS sessions_30d,
          (SELECT COUNT(*) FROM class_bookings cb JOIN class_schedules cs ON cs.schedule_id = cb.schedule_id
            WHERE cb.member_id = $1 AND cb.booking_status = 'booked' AND cs.class_date >= CURRENT_DATE AND cs.status <> 'cancelled') AS upcoming_classes
      `, [memberId]),
      db.query(`
        SELECT c.class_name, cs.class_date, cs.start_time
        FROM class_bookings cb
        JOIN class_schedules cs ON cs.schedule_id = cb.schedule_id
        JOIN fitness_classes c ON c.class_id = cs.class_id
        WHERE cb.member_id = $1 AND cb.booking_status = 'booked' AND cs.class_date >= CURRENT_DATE AND cs.status <> 'cancelled'
        ORDER BY cs.class_date, cs.start_time
        LIMIT 1
      `, [memberId]),
      db.query(`
        SELECT mp.plan_name, s.end_date, (s.end_date - CURRENT_DATE) AS days_remaining
        FROM subscriptions s JOIN membership_plans mp ON mp.plan_id = s.plan_id
        WHERE s.member_id = $1 AND s.subscription_status = 'active'
        ORDER BY s.end_date DESC
        LIMIT 1
      `, [memberId]),
      db.query(`
        SELECT mw.member_workout_id, wp.plan_name, mw.status, mw.completion_percentage, mw.start_date, mw.end_date,
               t.trainer_name
        FROM member_workouts mw
        JOIN workout_plans wp ON wp.workout_plan_id = mw.workout_plan_id
        LEFT JOIN trainers t ON t.trainer_id = mw.assigned_by_trainer_id
        WHERE mw.member_id = $1 AND mw.status IN ('assigned', 'in_progress')
        ORDER BY mw.assigned_date DESC
        LIMIT 5
      `, [memberId]),
    ]);

    const s = stats.rows[0];
    const sub = subscription.rows[0];
    res.status(200).json({
      success: true,
      data: {
        totalVisits: int(s.total_visits),
        visits30d: int(s.visits_30d),
        sessions30d: int(s.sessions_30d),
        upcomingClasses: int(s.upcoming_classes),
        nextClass: nextClass.rows[0] || null,
        subscription: sub ? { planName: sub.plan_name, endDate: sub.end_date, daysRemaining: int(sub.days_remaining) } : null,
        workouts: workouts.rows.map((w) => ({ ...w, completion_percentage: Number(w.completion_percentage) || 0 }))
      }
    });
  } catch (error) { next(error); }
};

const getRevenueDashboard = async (req, res, next) => {
  try {
    // Reads the monthly_revenue view rather than re-deriving the same aggregation here.
    // The two had already drifted apart once; there should be one definition of what a
    // month of revenue means, and it belongs in the database.
    //
    // The view exposes year and month as separate numbers, so they are recomposed into
    // the ISO date the chart already expects — the response shape is unchanged.
    // Take the most recent 12 months, then flip to ascending so the chart reads
    // left-to-right as a trend rather than running backwards through time.
    const monthlyQuery = await db.query(`
      SELECT year, month, total_revenue FROM (
        SELECT year, month, total_revenue
        FROM monthly_revenue
        ORDER BY year DESC, month DESC
        LIMIT 12
      ) recent
      ORDER BY year ASC, month ASC
    `);

    // pg returns NUMERIC as a string; the chart needs numbers.
    const data = monthlyQuery.rows.map((row) => {
      const year = String(parseInt(row.year, 10)).padStart(4, '0');
      const month = String(parseInt(row.month, 10)).padStart(2, '0');
      return {
        month: `${year}-${month}-01`,
        revenue: parseFloat(row.total_revenue)
      };
    });

    res.status(200).json({ success: true, data });
  } catch (error) { next(error); }
};

module.exports = { getOverview, getTrainerDashboard, getMemberDashboard, getRevenueDashboard };

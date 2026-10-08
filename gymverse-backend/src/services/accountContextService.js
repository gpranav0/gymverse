const db = require('../config/database');

// Ownership is resolved again from the authenticated account, never from request-body IDs.
// Explicit projections exclude credentials, contact details, general notes and payment references.
// Optional member-reported health information is deliberately included for coaching.
const ACCOUNT_CONTEXT_QUERY = `
  SELECT jsonb_build_object(
    'as_of_date', CURRENT_DATE,
    'profile', jsonb_build_object(
      'name', m.member_name,
      'age', CASE WHEN m.date_of_birth <= CURRENT_DATE
        THEN EXTRACT(YEAR FROM age(CURRENT_DATE, m.date_of_birth))::int END,
      'status', m.status, 'joined_on', m.join_date,
      'health_conditions', m.health_conditions),
    'memberships', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM (
      SELECT p.plan_name, p.access_level, s.subscription_status, s.start_date, s.end_date, s.auto_renew
      FROM subscriptions s JOIN membership_plans p ON p.plan_id = s.plan_id
      WHERE s.member_id = m.member_id ORDER BY s.end_date DESC, s.subscription_id DESC LIMIT 3
    ) s), '[]'::jsonb),
    'goals', COALESCE((SELECT jsonb_agg(to_jsonb(g)) FROM (
      SELECT goal_type, starting_value, current_value, target_value, unit, target_date, status
      FROM fitness_goals WHERE member_id = m.member_id AND status = 'active'
      ORDER BY target_date, goal_id LIMIT 5
    ) g), '[]'::jsonb),
    'latest_progress', (SELECT to_jsonb(p) FROM (
      SELECT recorded_date, weight AS weight_kg, height AS height_cm, body_fat_percentage, bmi
      FROM progress_records WHERE member_id = m.member_id
      ORDER BY recorded_date DESC, progress_id DESC LIMIT 1
    ) p),
    'workouts', COALESCE((SELECT jsonb_agg(to_jsonb(w)) FROM (
      SELECT p.plan_name, p.goal_type, p.difficulty_level, w.status, w.start_date, w.end_date,
             w.completion_percentage
      FROM member_workouts w JOIN workout_plans p ON p.workout_plan_id = w.workout_plan_id
      WHERE w.member_id = m.member_id AND w.status IN ('assigned', 'in_progress')
      ORDER BY w.assigned_date DESC, w.member_workout_id DESC LIMIT 3
    ) w), '[]'::jsonb),
    'diet_plans', COALESCE((SELECT jsonb_agg(to_jsonb(d)) FROM (
      SELECT plan_name, daily_calories, daily_protein, daily_carbohydrates, daily_fats, start_date, end_date
      FROM diet_plans WHERE member_id = m.member_id AND status = 'active'
      ORDER BY start_date DESC, diet_plan_id DESC LIMIT 2
    ) d), '[]'::jsonb),
    'attendance', (SELECT jsonb_build_object('visits_last_30_days', COUNT(DISTINCT attendance_date),
      'last_visit', MAX(attendance_date)) FROM attendance
      WHERE member_id = m.member_id AND attendance_date BETWEEN CURRENT_DATE - 29 AND CURRENT_DATE)
  ) AS account_context
  FROM users u JOIN members m ON m.member_id = u.member_id
  WHERE u.user_id = $1 AND u.status = 'active'`;

const getAccountContext = async (userId) => {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return { status: 'unavailable' };
  }
  try {
    const result = await db.query(ACCOUNT_CONTEXT_QUERY, [userId]);
    const context = result.rows[0]?.account_context;
    return context ? { status: 'available', data: context } : { status: 'no_member_profile' };
  } catch {
    // No stale personal context on failure. The assistant can still answer general questions.
    console.error('Account context retrieval unavailable');
    return { status: 'unavailable' };
  }
};

module.exports = { getAccountContext, ACCOUNT_CONTEXT_QUERY };

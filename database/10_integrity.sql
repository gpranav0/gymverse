-- 10_integrity.sql
-- Constraints and indexes added after the initial schema review.

-- A member may hold at most one active subscription. The API checks this inside a
-- transaction, but the database is the only place that can guarantee it under concurrency.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_subscription_per_member
    ON subscriptions (member_id)
    WHERE subscription_status = 'active';

-- A member may have at most one open (not yet checked out) attendance record per day.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_attendance_per_day
    ON attendance (member_id, attendance_date)
    WHERE check_out_time IS NULL;

-- Supports the default `ORDER BY created_at DESC` on the members list.
CREATE INDEX IF NOT EXISTS idx_members_created_at ON members(created_at DESC);

-- Supports the members/trainers search filters (ILIKE on name).
CREATE INDEX IF NOT EXISTS idx_members_name ON members(LOWER(member_name));
CREATE INDEX IF NOT EXISTS idx_trainers_name ON trainers(LOWER(trainer_name));

-- Payment listings and the revenue report both sort on these.
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(payment_status);

-- Workout plan and session lookups.
CREATE INDEX IF NOT EXISTS idx_workout_sessions_member ON workout_sessions(member_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_workout_plans_trainer ON workout_plans(trainer_id);

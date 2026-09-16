-- 11_hardening.sql
-- Constraints and indexes added after the second audit. Written to be re-runnable.

-- 1. class_schedules.capacity was nullable.
--    A NULL capacity made every capacity comparison evaluate to NULL rather than TRUE,
--    so `enrolled >= capacity` was never satisfied in the API *and* the
--    check_class_booking_capacity trigger silently passed. The class could be booked
--    without limit. Backfill, then forbid NULL.
UPDATE class_schedules SET capacity = 20 WHERE capacity IS NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'class_schedules' AND column_name = 'capacity' AND is_nullable = 'YES'
    ) THEN
        ALTER TABLE class_schedules ALTER COLUMN capacity SET NOT NULL;
    END IF;
END $$;

-- 2. Make the booking-capacity trigger safe even if a NULL slips through in future.
--    COALESCE turns "no capacity configured" into "closed" rather than "unlimited".
CREATE OR REPLACE FUNCTION check_class_booking_capacity()
RETURNS TRIGGER AS $$
DECLARE
    v_capacity INT;
    v_booked INT;
BEGIN
    IF NEW.booking_status = 'booked' THEN
        SELECT capacity INTO v_capacity FROM class_schedules WHERE schedule_id = NEW.schedule_id;
        SELECT COUNT(*) INTO v_booked
          FROM class_bookings
         WHERE schedule_id = NEW.schedule_id
           AND booking_status = 'booked'
           AND booking_id != COALESCE(NEW.booking_id, -1);
        IF v_booked >= COALESCE(v_capacity, 0) THEN
            RAISE EXCEPTION 'Class schedule % has reached its capacity of %.', NEW.schedule_id, COALESCE(v_capacity, 0);
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. member_workouts had no cross-column date check, so an assignment could end before
--    it started and never be completable.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_member_workout_dates') THEN
        ALTER TABLE member_workouts ADD CONSTRAINT chk_member_workout_dates
            CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);
    END IF;
END $$;

-- 4. completion_percentage was unbounded; the UI renders it as a progress bar.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_member_workout_completion') THEN
        ALTER TABLE member_workouts ADD CONSTRAINT chk_member_workout_completion
            CHECK (completion_percentage IS NULL OR completion_percentage BETWEEN 0 AND 100);
    END IF;
END $$;

-- 5. A workout plan with no author cannot be ownership-checked: `trainer_id != NULL` is
--    NULL, so the "only the author may delete this" test passed for everyone. The API now
--    always supplies a trainer; make the column agree.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'workout_plans' AND column_name = 'trainer_id' AND is_nullable = 'YES'
    ) AND NOT EXISTS (SELECT 1 FROM workout_plans WHERE trainer_id IS NULL) THEN
        ALTER TABLE workout_plans ALTER COLUMN trainer_id SET NOT NULL;
    END IF;
END $$;

-- 6. Indexes for the ownership lookups the API now performs on every member-scoped read.
CREATE INDEX IF NOT EXISTS idx_trainer_assignments_lookup
    ON trainer_assignments (trainer_id, member_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_trainer_assignments_member
    ON trainer_assignments (member_id);

-- Supports the per-member history endpoints, all of which sort newest-first.
CREATE INDEX IF NOT EXISTS idx_payments_member ON payments (member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_member ON subscriptions (member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_member ON attendance (member_id, attendance_date DESC);
CREATE INDEX IF NOT EXISTS idx_member_workouts_member ON member_workouts (member_id, assigned_date DESC);
CREATE INDEX IF NOT EXISTS idx_class_bookings_member ON class_bookings (member_id);

-- Supports the double-booking check in createSchedule and the public timetable.
CREATE INDEX IF NOT EXISTS idx_class_schedules_trainer_date ON class_schedules (trainer_id, class_date);
CREATE INDEX IF NOT EXISTS idx_class_schedules_date ON class_schedules (class_date, start_time);

-- Login looks accounts up by email on every attempt.
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

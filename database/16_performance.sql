-- 16_performance.sql
-- Index and trigger fixes from the performance audit. Written to be re-runnable.

-- 1. Migration 11 meant to widen several indexes to (member_id, <sort column> DESC) so the
--    member history pages read rows already in order. It reused names from 03_indexes.sql
--    with CREATE INDEX IF NOT EXISTS, so Postgres found the old single-column index under
--    each name and silently created nothing. Build them under new names, then drop the
--    narrower indexes they make redundant.
CREATE INDEX IF NOT EXISTS idx_payments_member_created ON payments (member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_member_created ON subscriptions (member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_workouts_member_assigned ON member_workouts (member_id, assigned_date DESC);
CREATE INDEX IF NOT EXISTS idx_class_schedules_date_start ON class_schedules (class_date, start_time);

DROP INDEX IF EXISTS idx_payments_member;
DROP INDEX IF EXISTS idx_subscriptions_member;
DROP INDEX IF EXISTS idx_member_workouts_member;
DROP INDEX IF EXISTS idx_class_schedules_date;
-- trainer_id is the leading column of idx_class_schedules_trainer_date.
DROP INDEX IF EXISTS idx_class_schedules_trainer;
-- Same columns as idx_attendance_member_date; a btree is read in either direction.
DROP INDEX IF EXISTS idx_attendance_member;

-- 2. Duplicates of the indexes that the UNIQUE constraints already maintain. Each one is
--    pure write cost.
DROP INDEX IF EXISTS idx_users_email;
DROP INDEX IF EXISTS idx_users_username;
DROP INDEX IF EXISTS idx_members_email;
DROP INDEX IF EXISTS idx_members_phone;

-- 3. The staff list pages sort the whole table newest-first.
CREATE INDEX IF NOT EXISTS idx_subscriptions_created_at ON subscriptions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_date_time ON attendance (attendance_date DESC, check_in_time DESC);

-- 4. Member and trainer search use ILIKE '%term%', which a btree on LOWER(name) can never
--    serve, so those two indexes only slowed writes. Trigram indexes do serve it.
DROP INDEX IF EXISTS idx_members_name;
DROP INDEX IF EXISTS idx_trainers_name;

-- pg_trgm is a trusted extension, but a role without CREATE on the database still cannot
-- add it. Search works without these indexes (it scans instead), so that is no reason to
-- fail the whole migration.
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE INDEX IF NOT EXISTS idx_members_name_trgm ON members USING gin (member_name gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_members_email_trgm ON members USING gin (email gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_members_phone_trgm ON members USING gin (phone gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_trainers_name_trgm ON trainers USING gin (trainer_name gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_trainers_email_trgm ON trainers USING gin (email gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Trigram search indexes skipped (%). Searches still work, without an index.', SQLERRM;
END $$;

-- 5. The row audit trigger on users and members.
--    - For a users row it recorded COALESCE(member_id, user_id), so every member's login
--      account was audited under their member id instead of their user id.
--    - Every sign-in updates users.last_login, and each one wrote a full copy of the user
--      row to audit_logs. Updates that change nothing but that bookkeeping are skipped.
CREATE OR REPLACE FUNCTION log_audit_event()
RETURNS TRIGGER AS $$
DECLARE
    v_new JSONB;
    v_old JSONB;
    v_row JSONB;
    v_record_id INT;
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        v_old := redact_sensitive(to_jsonb(OLD));
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        v_new := redact_sensitive(to_jsonb(NEW));
    END IF;

    IF TG_OP = 'UPDATE'
       AND (v_new - 'last_login' - 'updated_at') = (v_old - 'last_login' - 'updated_at') THEN
        RETURN NEW;
    END IF;

    v_row := COALESCE(v_new, v_old);
    v_record_id := CASE TG_TABLE_NAME
                       WHEN 'users' THEN (v_row->>'user_id')::INT
                       WHEN 'members' THEN (v_row->>'member_id')::INT
                   END;

    INSERT INTO audit_logs (action, table_name, record_id, old_data, new_data)
    VALUES (TG_OP, TG_TABLE_NAME, COALESCE(v_record_id, 0), v_old, v_new);

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

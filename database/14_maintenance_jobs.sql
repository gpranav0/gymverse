-- 14_maintenance_jobs.sql
-- Housekeeping the backend runs on a timer (src/jobs/maintenance.js). Kept in SQL so the
-- rules live next to the data and can also be run by hand or from pg_cron.

-- A subscription whose end date has passed is no longer active. Nothing used to change the
-- status, so lapsed memberships kept showing as active indefinitely.
CREATE OR REPLACE FUNCTION expire_subscriptions()
RETURNS INT AS $$
DECLARE
    v_count INT;
BEGIN
    UPDATE subscriptions
       SET subscription_status = 'expired'
     WHERE subscription_status = 'active'
       AND end_date < CURRENT_DATE;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- A check-in from a previous day that never checked out is closed at the end of that day.
-- Without this a forgotten check-out left the member "on floor" forever. The time is the
-- last instant of the day, which always satisfies chk_check_out (check_out >= check_in).
CREATE OR REPLACE FUNCTION close_stale_attendance()
RETURNS INT AS $$
DECLARE
    v_count INT;
BEGIN
    UPDATE attendance
       SET check_out_time = TIME '23:59:59.999999',
           notes = CONCAT_WS(' ', notes, '[auto-closed: no check-out recorded]')
     WHERE check_out_time IS NULL
       AND attendance_date < CURRENT_DATE;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Expired password-reset and verification tokens have no further use.
CREATE OR REPLACE FUNCTION purge_expired_auth_tokens()
RETURNS INT AS $$
DECLARE
    v_count INT;
BEGIN
    DELETE FROM auth_tokens WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '7 days';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

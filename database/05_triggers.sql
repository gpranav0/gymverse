-- 05_triggers.sql

-- 1. Automatically update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_members_updated BEFORE UPDATE ON members FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_trainers_updated BEFORE UPDATE ON trainers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_assignments_updated BEFORE UPDATE ON trainer_assignments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON membership_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_subs_updated BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_exercises_updated BEFORE UPDATE ON exercises FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_workouts_updated BEFORE UPDATE ON workout_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_member_workouts_updated BEFORE UPDATE ON member_workouts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_classes_updated BEFORE UPDATE ON fitness_classes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_schedules_updated BEFORE UPDATE ON class_schedules FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_bookings_updated BEFORE UPDATE ON class_bookings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_goals_updated BEFORE UPDATE ON fitness_goals FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_diets_updated BEFORE UPDATE ON diet_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_equipment_updated BEFORE UPDATE ON equipment FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON system_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2. Validate class booking capacity
CREATE OR REPLACE FUNCTION check_class_booking_capacity()
RETURNS TRIGGER AS $$
DECLARE
    v_capacity INT;
    v_booked INT;
BEGIN
    IF NEW.booking_status = 'booked' THEN
        SELECT capacity INTO v_capacity FROM class_schedules WHERE schedule_id = NEW.schedule_id;
        SELECT COUNT(*) INTO v_booked FROM class_bookings WHERE schedule_id = NEW.schedule_id AND booking_status = 'booked' AND booking_id != COALESCE(NEW.booking_id, -1);
        IF v_booked >= v_capacity THEN
            RAISE EXCEPTION 'Class schedule % has reached its capacity of %.', NEW.schedule_id, v_capacity;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_booking_capacity
BEFORE INSERT OR UPDATE OF booking_status ON class_bookings
FOR EACH ROW EXECUTE FUNCTION check_class_booking_capacity();

-- 3. Prevent invalid attendance state (checkout without checkin)
CREATE OR REPLACE FUNCTION check_attendance_state()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.check_out_time IS NOT NULL AND NEW.check_in_time IS NULL THEN
        RAISE EXCEPTION 'Cannot check out without checking in.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_attendance
BEFORE INSERT OR UPDATE ON attendance
FOR EACH ROW EXECUTE FUNCTION check_attendance_state();

-- 4. Audit logging
-- Strips credentials before they are written to the log. Without this, every INSERT or
-- UPDATE on `users` copied the bcrypt password_hash into audit_logs, spreading credential
-- material into a table with much broader read access than `users` itself.
CREATE OR REPLACE FUNCTION redact_sensitive(p_row JSONB)
RETURNS JSONB AS $$
BEGIN
    RETURN p_row - 'password_hash' - 'reset_token';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION log_audit_event()
RETURNS TRIGGER AS $$
DECLARE
    v_new JSONB;
    v_old JSONB;
    v_record_id INT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_old := redact_sensitive(to_jsonb(OLD));
        v_record_id := COALESCE((v_old->>'member_id')::INT, (v_old->>'user_id')::INT, 0);
        INSERT INTO audit_logs (action, table_name, record_id, old_data)
        VALUES ('DELETE', TG_TABLE_NAME, v_record_id, v_old);
        RETURN OLD;
    END IF;

    v_new := redact_sensitive(to_jsonb(NEW));
    v_record_id := COALESCE((v_new->>'member_id')::INT, (v_new->>'user_id')::INT, 0);

    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs (action, table_name, record_id, new_data)
        VALUES ('INSERT', TG_TABLE_NAME, v_record_id, v_new);
    ELSIF TG_OP = 'UPDATE' THEN
        v_old := redact_sensitive(to_jsonb(OLD));
        INSERT INTO audit_logs (action, table_name, record_id, old_data, new_data)
        VALUES ('UPDATE', TG_TABLE_NAME, v_record_id, v_old, v_new);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_users AFTER INSERT OR UPDATE OR DELETE ON users FOR EACH ROW EXECUTE FUNCTION log_audit_event();
CREATE TRIGGER trg_audit_members AFTER INSERT OR UPDATE OR DELETE ON members FOR EACH ROW EXECUTE FUNCTION log_audit_event();

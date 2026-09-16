-- 04_functions.sql

-- 1. Calculate BMI (already stored in table, but useful as a utility function)
CREATE OR REPLACE FUNCTION calculate_bmi(p_weight NUMERIC, p_height NUMERIC)
RETURNS NUMERIC AS $$
BEGIN
    IF p_height > 0 THEN
        RETURN ROUND((p_weight / ((p_height/100) * (p_height/100))), 2);
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 2. Get active membership
CREATE OR REPLACE FUNCTION get_active_subscription(p_member_id INT)
RETURNS INT AS $$
DECLARE
    v_sub_id INT;
BEGIN
    SELECT subscription_id INTO v_sub_id
    FROM subscriptions
    WHERE member_id = p_member_id 
      AND subscription_status = 'active'
      AND CURRENT_DATE BETWEEN start_date AND end_date
    ORDER BY end_date DESC
    LIMIT 1;
    RETURN v_sub_id;
END;
$$ LANGUAGE plpgsql;

-- 3. Get member's current trainer
CREATE OR REPLACE FUNCTION get_current_trainer(p_member_id INT)
RETURNS INT AS $$
DECLARE
    v_trainer_id INT;
BEGIN
    SELECT trainer_id INTO v_trainer_id
    FROM trainer_assignments
    WHERE member_id = p_member_id
      AND status = 'active'
      AND (end_date IS NULL OR end_date >= CURRENT_DATE)
    ORDER BY start_date DESC
    LIMIT 1;
    RETURN v_trainer_id;
END;
$$ LANGUAGE plpgsql;

-- 4. Get available class slots
CREATE OR REPLACE FUNCTION get_available_class_slots(p_schedule_id INT)
RETURNS INT AS $$
DECLARE
    v_capacity INT;
    v_booked INT;
BEGIN
    SELECT capacity INTO v_capacity FROM class_schedules WHERE schedule_id = p_schedule_id;
    SELECT COUNT(*) INTO v_booked FROM class_bookings WHERE schedule_id = p_schedule_id AND booking_status = 'booked';
    RETURN v_capacity - v_booked;
END;
$$ LANGUAGE plpgsql;

-- 5. Get member attendance summary
CREATE OR REPLACE FUNCTION get_member_attendance_summary(p_member_id INT)
RETURNS TABLE(total_visits INT, last_visit DATE) AS $$
BEGIN
    RETURN QUERY
    SELECT COUNT(attendance_id)::INT, MAX(attendance_date)
    FROM attendance
    WHERE member_id = p_member_id;
END;
$$ LANGUAGE plpgsql;

-- 6. Get member progress summary
CREATE OR REPLACE FUNCTION get_member_progress_summary(p_member_id INT)
RETURNS TABLE(latest_weight NUMERIC, latest_bmi NUMERIC) AS $$
BEGIN
    RETURN QUERY
    SELECT weight, bmi
    FROM progress_records
    WHERE member_id = p_member_id
    ORDER BY recorded_date DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- 7. Get payment summary
CREATE OR REPLACE FUNCTION get_member_payment_summary(p_member_id INT)
RETURNS TABLE(total_paid NUMERIC, total_refunded NUMERIC) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(CASE WHEN payment_status = 'completed' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN payment_status = 'refunded' THEN amount ELSE 0 END), 0)
    FROM payments
    WHERE member_id = p_member_id;
END;
$$ LANGUAGE plpgsql;

-- 8. Get equipment maintenance status
CREATE OR REPLACE FUNCTION get_equipment_maintenance_status(p_equipment_id INT)
RETURNS VARCHAR AS $$
DECLARE
    v_status VARCHAR;
BEGIN
    SELECT availability_status INTO v_status
    FROM equipment
    WHERE equipment_id = p_equipment_id;
    RETURN v_status;
END;
$$ LANGUAGE plpgsql;

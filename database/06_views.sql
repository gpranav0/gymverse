-- 06_views.sql

-- active_member_overview
CREATE OR REPLACE VIEW active_member_overview AS
SELECT m.member_id, m.member_code, m.member_name, m.phone, m.email, m.status,
       s.subscription_status, p.plan_name, s.end_date as subscription_end
FROM members m
LEFT JOIN subscriptions s ON m.member_id = s.member_id AND s.subscription_status = 'active'
LEFT JOIN membership_plans p ON s.plan_id = p.plan_id
WHERE m.status = 'active';

-- member_subscription_summary
CREATE OR REPLACE VIEW member_subscription_summary AS
SELECT m.member_name, p.plan_name, s.start_date, s.end_date, s.subscription_status, s.auto_renew
FROM subscriptions s
JOIN members m ON s.member_id = m.member_id
JOIN membership_plans p ON s.plan_id = p.plan_id;

-- monthly_revenue
CREATE OR REPLACE VIEW monthly_revenue AS
SELECT 
    EXTRACT(YEAR FROM payment_date) AS year,
    EXTRACT(MONTH FROM payment_date) AS month,
    SUM(amount) AS total_revenue,
    COUNT(payment_id) AS total_transactions
FROM payments
WHERE payment_status = 'completed'
GROUP BY EXTRACT(YEAR FROM payment_date), EXTRACT(MONTH FROM payment_date)
ORDER BY year DESC, month DESC;

-- attendance_summary
CREATE OR REPLACE VIEW attendance_summary AS
SELECT m.member_name, COUNT(a.attendance_id) AS total_visits, MAX(a.attendance_date) AS last_visit
FROM members m
LEFT JOIN attendance a ON m.member_id = a.member_id
GROUP BY m.member_id, m.member_name;

-- trainer_member_summary
CREATE OR REPLACE VIEW trainer_member_summary AS
SELECT t.trainer_name, COUNT(ta.member_id) AS assigned_members
FROM trainers t
LEFT JOIN trainer_assignments ta ON t.trainer_id = ta.trainer_id AND ta.status = 'active'
GROUP BY t.trainer_id, t.trainer_name;

-- upcoming_classes
CREATE OR REPLACE VIEW upcoming_classes AS
SELECT c.class_name, t.trainer_name, cs.class_date, cs.start_time, cs.capacity,
       (SELECT COUNT(*) FROM class_bookings cb WHERE cb.schedule_id = cs.schedule_id AND cb.booking_status = 'booked') as booked_seats
FROM class_schedules cs
JOIN fitness_classes c ON cs.class_id = c.class_id
JOIN trainers t ON cs.trainer_id = t.trainer_id
WHERE cs.class_date >= CURRENT_DATE AND cs.status = 'scheduled'
ORDER BY cs.class_date ASC, cs.start_time ASC;

-- class_capacity_summary
CREATE OR REPLACE VIEW class_capacity_summary AS
SELECT c.class_name, cs.class_date, cs.capacity,
       (SELECT COUNT(*) FROM class_bookings cb WHERE cb.schedule_id = cs.schedule_id AND cb.booking_status = 'booked') as booked_seats,
       cs.capacity - (SELECT COUNT(*) FROM class_bookings cb WHERE cb.schedule_id = cs.schedule_id AND cb.booking_status = 'booked') as available_seats
FROM class_schedules cs
JOIN fitness_classes c ON cs.class_id = c.class_id;

-- member_progress_summary
CREATE OR REPLACE VIEW member_progress_summary AS
SELECT m.member_name, pr.recorded_date, pr.weight, pr.body_fat_percentage, pr.bmi
FROM progress_records pr
JOIN members m ON pr.member_id = m.member_id
ORDER BY m.member_id, pr.recorded_date DESC;

-- equipment_maintenance_summary
CREATE OR REPLACE VIEW equipment_maintenance_summary AS
SELECT e.equipment_name, e.equipment_condition, e.availability_status, mr.maintenance_date, mr.maintenance_type, mr.maintenance_status
FROM equipment e
LEFT JOIN maintenance_records mr ON e.equipment_id = mr.equipment_id
ORDER BY mr.maintenance_date DESC;

-- expiring_memberships
CREATE OR REPLACE VIEW expiring_memberships AS
SELECT m.member_name, m.phone, m.email, s.end_date
FROM subscriptions s
JOIN members m ON s.member_id = m.member_id
WHERE s.subscription_status = 'active' AND s.end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 days';

-- unread_notifications
CREATE OR REPLACE VIEW unread_notifications AS
SELECT m.member_name, n.title, n.message, n.notification_date
FROM notifications n
JOIN members m ON n.member_id = m.member_id
WHERE n.read_status = FALSE;

-- feedback_summary
CREATE OR REPLACE VIEW feedback_summary AS
SELECT rating, COUNT(feedback_id) as review_count, category
FROM feedback
GROUP BY rating, category
ORDER BY category, rating DESC;

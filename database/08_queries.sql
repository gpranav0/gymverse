-- 08_queries.sql

-- 1. All active members
SELECT * FROM active_member_overview;

-- 2. Member details with current membership
SELECT * FROM member_subscription_summary WHERE subscription_status = 'active';

-- 3. Member and assigned trainer
SELECT m.member_name, t.trainer_name, ta.start_date
FROM members m
JOIN trainer_assignments ta ON m.member_id = ta.member_id AND ta.status = 'active'
JOIN trainers t ON ta.trainer_id = t.trainer_id;

-- 4. Membership expiry list
SELECT * FROM expiring_memberships;

-- 5. Payment history
SELECT p.payment_date, m.member_name, p.amount, p.payment_method, p.payment_status
FROM payments p
JOIN members m ON p.member_id = m.member_id
ORDER BY p.payment_date DESC;

-- 6. Monthly revenue
SELECT * FROM monthly_revenue;

-- 7. Attendance history
SELECT m.member_name, a.attendance_date, a.check_in_time, a.check_out_time
FROM attendance a
JOIN members m ON a.member_id = m.member_id
ORDER BY a.attendance_date DESC;

-- 8. Most active members
SELECT m.member_name, COUNT(a.attendance_id) as total_visits
FROM members m
JOIN attendance a ON m.member_id = a.member_id
GROUP BY m.member_id, m.member_name
ORDER BY total_visits DESC LIMIT 10;

-- 9. Member workout plan
SELECT m.member_name, wp.plan_name, mw.assigned_date, mw.status
FROM member_workouts mw
JOIN members m ON mw.member_id = m.member_id
JOIN workout_plans wp ON mw.workout_plan_id = wp.workout_plan_id;

-- 10. Exercises in a workout plan
SELECT wp.plan_name, e.exercise_name, wpe.sets, wpe.repetitions
FROM workout_plan_exercises wpe
JOIN workout_plans wp ON wpe.workout_plan_id = wp.workout_plan_id
JOIN exercises e ON wpe.exercise_id = e.exercise_id
WHERE wp.workout_plan_id = 1;

-- 11. Upcoming classes
SELECT * FROM upcoming_classes;

-- 12. Available class slots
SELECT * FROM class_capacity_summary WHERE available_seats > 0;

-- 13. Class booking list
SELECT cs.class_date, fc.class_name, m.member_name, cb.booking_status
FROM class_bookings cb
JOIN class_schedules cs ON cb.schedule_id = cs.schedule_id
JOIN fitness_classes fc ON cs.class_id = fc.class_id
JOIN members m ON cb.member_id = m.member_id
WHERE cb.booking_status = 'booked';

-- 14. Member progress
SELECT * FROM member_progress_summary WHERE member_name LIKE '%Sharma%';

-- 15. Active fitness goals
SELECT m.member_name, fg.goal_type, fg.current_value, fg.target_value, fg.target_date
FROM fitness_goals fg
JOIN members m ON fg.member_id = m.member_id
WHERE fg.status = 'active';

-- 16. Diet plan with meals
SELECT dp.plan_name, dm.meal_type, dm.meal_name, dm.calories
FROM diet_meals dm
JOIN diet_plans dp ON dm.diet_plan_id = dp.diet_plan_id
WHERE dp.status = 'active';

-- 17. Equipment requiring maintenance
SELECT equipment_name, equipment_condition, availability_status 
FROM equipment 
WHERE equipment_condition IN ('needs_repair', 'damaged') OR availability_status = 'under_maintenance';

-- 18. Maintenance cost summary
SELECT SUM(maintenance_cost) as total_maintenance_cost, EXTRACT(YEAR FROM maintenance_date) as year
FROM maintenance_records
WHERE maintenance_status = 'completed'
GROUP BY year;

-- 19. Feedback summary
SELECT * FROM feedback_summary;

-- 20. Unread notifications
SELECT * FROM unread_notifications;

-- 21. TRANSACTION DEMO: Membership Purchase
BEGIN;

INSERT INTO subscriptions (member_id, plan_id, start_date, end_date, subscription_status)
VALUES (1, 1, CURRENT_DATE, CURRENT_DATE + INTERVAL '1 month', 'active');

INSERT INTO payments (subscription_id, member_id, amount, payment_method, payment_status, transaction_reference)
VALUES (lastval(), 1, 1500.00, 'card', 'completed', 'TXN-DEMO-001');

INSERT INTO notifications (member_id, notification_type, title, message)
VALUES (1, 'payment', 'Payment Successful', 'Your subscription has been activated.');

COMMIT;

-- 22. TRANSACTION DEMO: Safe Class Booking
BEGIN;

-- Check capacity (handled by trigger, so insert will rollback if full)
INSERT INTO class_bookings (schedule_id, member_id, booking_status)
VALUES (1, 2, 'booked');

COMMIT;

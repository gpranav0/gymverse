-- 02_constraints.sql

-- 7. TRAINER ASSIGNMENTS
ALTER TABLE trainer_assignments ADD CONSTRAINT chk_assignment_dates CHECK (end_date IS NULL OR end_date >= start_date);

-- 9. SUBSCRIPTIONS
ALTER TABLE subscriptions ADD CONSTRAINT chk_sub_dates CHECK (end_date >= start_date);

-- 11. ATTENDANCE
ALTER TABLE attendance ADD CONSTRAINT chk_check_out CHECK (check_out_time IS NULL OR check_out_time >= check_in_time);

-- 18. CLASS SCHEDULES
ALTER TABLE class_schedules ADD CONSTRAINT chk_class_time CHECK (end_time > start_time);

-- 19. CLASS BOOKINGS
ALTER TABLE class_bookings ADD CONSTRAINT unique_class_booking UNIQUE (schedule_id, member_id);

-- 21. FITNESS GOALS
ALTER TABLE fitness_goals ADD CONSTRAINT chk_goal_dates CHECK (target_date >= start_date);

-- 22. DIET PLANS
ALTER TABLE diet_plans ADD CONSTRAINT chk_diet_dates CHECK (end_date >= start_date);

-- 25. MAINTENANCE
ALTER TABLE maintenance_records ADD CONSTRAINT chk_next_service CHECK (next_service_date IS NULL OR next_service_date >= maintenance_date);

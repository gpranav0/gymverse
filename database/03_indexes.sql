-- 03_indexes.sql

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);

CREATE INDEX idx_members_email ON members(email);
CREATE INDEX idx_members_phone ON members(phone);

CREATE INDEX idx_subscriptions_member ON subscriptions(member_id);
CREATE INDEX idx_subscriptions_end_date ON subscriptions(end_date);

CREATE INDEX idx_payments_member ON payments(member_id);
CREATE INDEX idx_payments_date ON payments(payment_date);

CREATE INDEX idx_attendance_member_date ON attendance(member_id, attendance_date);

CREATE INDEX idx_trainer_assignments_member ON trainer_assignments(member_id);
CREATE INDEX idx_trainer_assignments_trainer ON trainer_assignments(trainer_id);

CREATE INDEX idx_member_workouts_member ON member_workouts(member_id);

CREATE INDEX idx_wpe_plan ON workout_plan_exercises(workout_plan_id);
CREATE INDEX idx_wpe_exercise ON workout_plan_exercises(exercise_id);

CREATE INDEX idx_class_schedules_date ON class_schedules(class_date);
CREATE INDEX idx_class_schedules_trainer ON class_schedules(trainer_id);

CREATE INDEX idx_class_bookings_member ON class_bookings(member_id);
CREATE INDEX idx_class_bookings_schedule ON class_bookings(schedule_id);

CREATE INDEX idx_progress_records_member_date ON progress_records(member_id, recorded_date);

CREATE INDEX idx_fitness_goals_member ON fitness_goals(member_id);

CREATE INDEX idx_diet_plans_member ON diet_plans(member_id);

CREATE INDEX idx_maintenance_records_equipment ON maintenance_records(equipment_id);

CREATE INDEX idx_notifications_member_status ON notifications(member_id, read_status);

CREATE INDEX idx_audit_logs_user_date ON audit_logs(user_id, created_at);

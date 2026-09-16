-- 01_schema.sql

-- 1. ROLES
CREATE TABLE roles (
    role_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    role_name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. MEMBERS
CREATE TABLE members (
    member_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    member_code VARCHAR(50) UNIQUE NOT NULL,
    member_name VARCHAR(100) NOT NULL,
    gender VARCHAR(20) CHECK (gender IN ('Male', 'Female', 'Other')),
    date_of_birth DATE,
    phone VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    address TEXT,
    emergency_contact_name VARCHAR(100),
    emergency_contact_phone VARCHAR(20),
    join_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'expired')),
    profile_photo_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. TRAINERS
CREATE TABLE trainers (
    trainer_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trainer_code VARCHAR(50) UNIQUE NOT NULL,
    trainer_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    specialization VARCHAR(100),
    qualification VARCHAR(200),
    experience_years INT CHECK (experience_years >= 0),
    bio TEXT,
    shift VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    profile_photo_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. USERS
CREATE TABLE users (
    user_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role_id INT NOT NULL REFERENCES roles(role_id) ON DELETE RESTRICT,
    member_id INT REFERENCES members(member_id) ON DELETE CASCADE,
    trainer_id INT REFERENCES trainers(trainer_id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. TRAINER ASSIGNMENTS
CREATE TABLE trainer_assignments (
    assignment_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    member_id INT NOT NULL REFERENCES members(member_id) ON DELETE CASCADE,
    trainer_id INT NOT NULL REFERENCES trainers(trainer_id) ON DELETE RESTRICT,
    start_date DATE NOT NULL,
    end_date DATE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. MEMBERSHIP PLANS
CREATE TABLE membership_plans (
    plan_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    plan_name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    duration_months INT CHECK (duration_months > 0),
    price NUMERIC(10,2) CHECK (price >= 0),
    access_level VARCHAR(50),
    personal_training_sessions INT DEFAULT 0,
    class_access BOOLEAN DEFAULT FALSE,
    diet_consultation BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. SUBSCRIPTIONS
CREATE TABLE subscriptions (
    subscription_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    member_id INT NOT NULL REFERENCES members(member_id) ON DELETE CASCADE,
    plan_id INT NOT NULL REFERENCES membership_plans(plan_id) ON DELETE RESTRICT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    subscription_status VARCHAR(20) DEFAULT 'pending' CHECK (subscription_status IN ('pending', 'active', 'expired', 'cancelled', 'suspended')),
    auto_renew BOOLEAN DEFAULT FALSE,
    cancellation_date DATE,
    cancellation_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. PAYMENTS
CREATE TABLE payments (
    payment_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    subscription_id INT NOT NULL REFERENCES subscriptions(subscription_id) ON DELETE CASCADE,
    member_id INT NOT NULL REFERENCES members(member_id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    payment_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    payment_method VARCHAR(30) CHECK (payment_method IN ('cash', 'card', 'upi', 'bank_transfer')),
    payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded', 'partially_refunded')),
    transaction_reference VARCHAR(100) UNIQUE,
    receipt_number VARCHAR(100) UNIQUE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. ATTENDANCE
CREATE TABLE attendance (
    attendance_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    member_id INT NOT NULL REFERENCES members(member_id) ON DELETE CASCADE,
    attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
    check_in_time TIME NOT NULL,
    check_out_time TIME,
    check_in_method VARCHAR(20) CHECK (check_in_method IN ('manual', 'qr', 'biometric', 'app')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. EXERCISES
CREATE TABLE exercises (
    exercise_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    exercise_name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    muscle_group VARCHAR(50),
    secondary_muscle_group VARCHAR(50),
    equipment_required VARCHAR(100),
    difficulty_level VARCHAR(20) CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')),
    instructions TEXT,
    video_url TEXT,
    image_url TEXT,
    calories_per_minute NUMERIC(5,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 13. WORKOUT PLANS
CREATE TABLE workout_plans (
    workout_plan_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trainer_id INT REFERENCES trainers(trainer_id) ON DELETE SET NULL,
    plan_name VARCHAR(100) NOT NULL,
    description TEXT,
    goal_type VARCHAR(50),
    difficulty_level VARCHAR(20) CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')),
    duration_weeks INT CHECK (duration_weeks > 0),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 14. WORKOUT PLAN ↔ EXERCISE
CREATE TABLE workout_plan_exercises (
    workout_plan_exercise_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workout_plan_id INT NOT NULL REFERENCES workout_plans(workout_plan_id) ON DELETE CASCADE,
    exercise_id INT NOT NULL REFERENCES exercises(exercise_id) ON DELETE CASCADE,
    day_number INT CHECK (day_number > 0),
    order_number INT CHECK (order_number > 0),
    sets INT CHECK (sets > 0),
    repetitions INT CHECK (repetitions > 0),
    duration_seconds INT CHECK (duration_seconds > 0),
    weight NUMERIC(5,2),
    rest_seconds INT CHECK (rest_seconds >= 0),
    notes TEXT
);

-- 15. MEMBER WORKOUT ASSIGNMENTS
CREATE TABLE member_workouts (
    member_workout_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    member_id INT NOT NULL REFERENCES members(member_id) ON DELETE CASCADE,
    workout_plan_id INT NOT NULL REFERENCES workout_plans(workout_plan_id) ON DELETE CASCADE,
    assigned_by_trainer_id INT REFERENCES trainers(trainer_id) ON DELETE SET NULL,
    assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
    start_date DATE,
    end_date DATE,
    status VARCHAR(20) DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'cancelled')),
    completion_percentage NUMERIC(5,2) DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 16. WORKOUT SESSION HISTORY
CREATE TABLE workout_sessions (
    session_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    member_id INT NOT NULL REFERENCES members(member_id) ON DELETE CASCADE,
    workout_plan_id INT REFERENCES workout_plans(workout_plan_id) ON DELETE SET NULL,
    session_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    duration_minutes INT CHECK (duration_minutes > 0),
    calories_burned NUMERIC(8,2),
    completed BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 17. FITNESS CLASSES
CREATE TABLE fitness_classes (
    class_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    class_name VARCHAR(100) NOT NULL,
    description TEXT,
    difficulty_level VARCHAR(20) CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')),
    duration_minutes INT CHECK (duration_minutes > 0),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 18. CLASS SCHEDULES
CREATE TABLE class_schedules (
    schedule_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    class_id INT NOT NULL REFERENCES fitness_classes(class_id) ON DELETE CASCADE,
    trainer_id INT NOT NULL REFERENCES trainers(trainer_id) ON DELETE RESTRICT,
    class_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    capacity INT CHECK (capacity > 0),
    room VARCHAR(50),
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 19. CLASS BOOKINGS
CREATE TABLE class_bookings (
    booking_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    schedule_id INT NOT NULL REFERENCES class_schedules(schedule_id) ON DELETE CASCADE,
    member_id INT NOT NULL REFERENCES members(member_id) ON DELETE CASCADE,
    booking_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    booking_status VARCHAR(20) DEFAULT 'booked' CHECK (booking_status IN ('booked', 'cancelled', 'waitlisted')),
    attendance_status VARCHAR(20) DEFAULT 'pending' CHECK (attendance_status IN ('pending', 'attended', 'absent')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 20. FITNESS PROGRESS
CREATE TABLE progress_records (
    progress_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    member_id INT NOT NULL REFERENCES members(member_id) ON DELETE CASCADE,
    recorded_date DATE NOT NULL DEFAULT CURRENT_DATE,
    weight NUMERIC(5,2) CHECK (weight > 0),
    height NUMERIC(5,2) CHECK (height > 0),
    body_fat_percentage NUMERIC(5,2) CHECK (body_fat_percentage >= 0 AND body_fat_percentage <= 100),
    muscle_mass NUMERIC(5,2),
    chest_measurement NUMERIC(5,2),
    waist_measurement NUMERIC(5,2),
    hip_measurement NUMERIC(5,2),
    bmi NUMERIC(5,2) GENERATED ALWAYS AS (weight / ((height/100) * (height/100))) STORED,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 21. FITNESS GOALS
CREATE TABLE fitness_goals (
    goal_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    member_id INT NOT NULL REFERENCES members(member_id) ON DELETE CASCADE,
    goal_type VARCHAR(50) CHECK (goal_type IN ('weight_loss', 'muscle_gain', 'strength', 'endurance', 'flexibility', 'body_fat_reduction')),
    starting_value NUMERIC(10,2),
    current_value NUMERIC(10,2),
    target_value NUMERIC(10,2) NOT NULL,
    unit VARCHAR(20),
    start_date DATE NOT NULL,
    target_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'achieved', 'abandoned', 'expired')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 22. DIET PLANS
CREATE TABLE diet_plans (
    diet_plan_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    member_id INT NOT NULL REFERENCES members(member_id) ON DELETE CASCADE,
    trainer_id INT REFERENCES trainers(trainer_id) ON DELETE SET NULL,
    plan_name VARCHAR(100) NOT NULL,
    daily_calories INT CHECK (daily_calories > 0),
    daily_protein INT CHECK (daily_protein >= 0),
    daily_carbohydrates INT CHECK (daily_carbohydrates >= 0),
    daily_fats INT CHECK (daily_fats >= 0),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 23. DIET MEALS
CREATE TABLE diet_meals (
    diet_meal_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    diet_plan_id INT NOT NULL REFERENCES diet_plans(diet_plan_id) ON DELETE CASCADE,
    meal_type VARCHAR(50),
    meal_name VARCHAR(100) NOT NULL,
    description TEXT,
    calories INT CHECK (calories >= 0),
    protein INT CHECK (protein >= 0),
    carbohydrates INT CHECK (carbohydrates >= 0),
    fats INT CHECK (fats >= 0),
    meal_time TIME,
    notes TEXT
);

-- 24. EQUIPMENT
CREATE TABLE equipment (
    equipment_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    equipment_code VARCHAR(50) UNIQUE NOT NULL,
    equipment_name VARCHAR(100) NOT NULL,
    category VARCHAR(50),
    brand VARCHAR(50),
    model VARCHAR(50),
    purchase_date DATE,
    purchase_cost NUMERIC(10,2) CHECK (purchase_cost >= 0),
    warranty_expiry DATE,
    equipment_condition VARCHAR(20) DEFAULT 'excellent' CHECK (equipment_condition IN ('excellent', 'good', 'needs_repair', 'damaged')),
    availability_status VARCHAR(20) DEFAULT 'available' CHECK (availability_status IN ('available', 'unavailable', 'under_maintenance', 'retired')),
    location VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 25. MAINTENANCE
CREATE TABLE maintenance_records (
    maintenance_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    equipment_id INT NOT NULL REFERENCES equipment(equipment_id) ON DELETE CASCADE,
    maintenance_date DATE NOT NULL,
    issue_description TEXT,
    maintenance_type VARCHAR(50),
    maintenance_cost NUMERIC(10,2) CHECK (maintenance_cost >= 0),
    technician_name VARCHAR(100),
    service_provider VARCHAR(100),
    next_service_date DATE,
    maintenance_status VARCHAR(20) DEFAULT 'scheduled' CHECK (maintenance_status IN ('scheduled', 'in_progress', 'completed')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 26. FEEDBACK
CREATE TABLE feedback (
    feedback_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    member_id INT NOT NULL REFERENCES members(member_id) ON DELETE CASCADE,
    trainer_id INT REFERENCES trainers(trainer_id) ON DELETE SET NULL,
    class_id INT REFERENCES fitness_classes(class_id) ON DELETE SET NULL,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    category VARCHAR(50) CHECK (category IN ('gym', 'trainer', 'class', 'equipment', 'service')),
    comments TEXT,
    feedback_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 27. NOTIFICATIONS
CREATE TABLE notifications (
    notification_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    member_id INT NOT NULL REFERENCES members(member_id) ON DELETE CASCADE,
    notification_type VARCHAR(50) CHECK (notification_type IN ('membership_expiry', 'payment', 'class_reminder', 'class_cancellation', 'workout', 'diet', 'maintenance', 'achievement', 'system')),
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
    notification_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_status BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 28. AUDIT LOG
CREATE TABLE audit_logs (
    audit_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INT REFERENCES users(user_id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    table_name VARCHAR(50) NOT NULL,
    record_id INT NOT NULL,
    old_data JSONB,
    new_data JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 29. SYSTEM SETTINGS
CREATE TABLE system_settings (
    setting_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

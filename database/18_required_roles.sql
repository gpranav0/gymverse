-- Required application data must exist even when demo data is not installed.
-- Preserve existing role IDs and descriptions.
INSERT INTO roles (role_name, description) VALUES
('admin', 'System administrator with full access'),
('trainer', 'Gym trainer with access to assigned members'),
('member', 'Gym member with access to own profile'),
('receptionist', 'Front desk staff managing attendance and payments')
ON CONFLICT (role_name) DO NOTHING;

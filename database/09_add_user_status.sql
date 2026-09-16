-- 09_add_user_status.sql
-- Add status column and drop is_active. Written to be safely re-runnable.

ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_status'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT chk_users_status
            CHECK (status IN ('active', 'pending', 'suspended', 'rejected'));
    END IF;
END $$;

-- Migrate existing data only while the legacy column is still present.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'is_active'
    ) THEN
        UPDATE users SET status = CASE WHEN is_active THEN 'active' ELSE 'suspended' END;
        ALTER TABLE users DROP COLUMN is_active;
    END IF;
END $$;

ALTER TABLE users ALTER COLUMN status SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

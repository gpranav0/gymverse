-- 13_account_security.sql
-- Session revocation, password reset and email verification.

-- Incremented on logout, password change and password reset. Every token carries the
-- version it was issued under, so bumping it invalidates all outstanding tokens at once.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0;

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;

-- Accounts created before verification existed were made by staff or seeded; treat them
-- as verified. Triggers are paused so this backfill does not write an audit row and bump
-- updated_at for every user.
ALTER TABLE users DISABLE TRIGGER USER;
UPDATE users SET email_verified_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE email_verified_at IS NULL;
ALTER TABLE users ENABLE TRIGGER USER;

-- One-time tokens for password reset and email verification. Only a SHA-256 of the token
-- is stored: a leaked table cannot be replayed into account takeovers.
CREATE TABLE IF NOT EXISTS auth_tokens (
    token_id    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    purpose     VARCHAR(30) NOT NULL CHECK (purpose IN ('password_reset', 'email_verification')),
    token_hash  CHAR(64) NOT NULL UNIQUE,
    expires_at  TIMESTAMP NOT NULL,
    used_at     TIMESTAMP,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_purpose ON auth_tokens (user_id, purpose);

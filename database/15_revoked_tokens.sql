-- 15_revoked_tokens.sql
-- Per-session sign-out. users.token_version (migration 13) revokes every session of a user
-- at once, which is right for "sign out everywhere" and password changes but wrong for an
-- ordinary logout: signing out of the front-desk PC must not also end the session on your
-- phone. A logout records just that token's id here until the token would expire anyway.

CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti         VARCHAR(64) PRIMARY KEY,
    user_id     INT REFERENCES users(user_id) ON DELETE CASCADE,
    expires_at  TIMESTAMP NOT NULL,
    revoked_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON revoked_tokens (expires_at);

-- Extends the clean-up from migration 14: a revoked token id is only needed until the
-- token itself would have expired.
CREATE OR REPLACE FUNCTION purge_expired_auth_tokens()
RETURNS INT AS $$
DECLARE
    v_tokens  INT;
    v_revoked INT;
BEGIN
    DELETE FROM auth_tokens WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '7 days';
    GET DIAGNOSTICS v_tokens = ROW_COUNT;
    DELETE FROM revoked_tokens WHERE expires_at < CURRENT_TIMESTAMP;
    GET DIAGNOSTICS v_revoked = ROW_COUNT;
    RETURN v_tokens + v_revoked;
END;
$$ LANGUAGE plpgsql;

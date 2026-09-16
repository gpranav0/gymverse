-- 17_audit_redaction.sql
-- Makes sure credential redaction exists in every database, including ones built before
-- it was added. Re-runnable.

-- redact_sensitive() was added to 05_triggers.sql after some databases had already been
-- built from an earlier version of that file. The migration runner records 01-11 as a
-- baseline on its first contact with an existing database instead of re-running them, so
-- those databases never received the function. Migration 16's audit trigger calls it,
-- which made every insert into users or members fail there. Define it here as well.
CREATE OR REPLACE FUNCTION redact_sensitive(p_row JSONB)
RETURNS JSONB AS $$
BEGIN
    RETURN p_row - 'password_hash' - 'reset_token';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- The same databases ran the original audit trigger, which copied the bcrypt password_hash
-- into audit_logs on every insert or update of a user. Strip it from the rows already
-- written; every other field of those entries is kept.
UPDATE audit_logs
   SET old_data = CASE WHEN old_data IS NULL THEN NULL ELSE redact_sensitive(old_data) END,
       new_data = CASE WHEN new_data IS NULL THEN NULL ELSE redact_sensitive(new_data) END
 WHERE old_data ? 'password_hash' OR new_data ? 'password_hash'
    OR old_data ? 'reset_token' OR new_data ? 'reset_token';

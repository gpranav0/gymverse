-- Optional, member-reported information for personalized coaching.
ALTER TABLE members ADD COLUMN health_conditions TEXT;
ALTER TABLE members ADD CONSTRAINT members_health_conditions_length
    CHECK (health_conditions IS NULL OR char_length(health_conditions) <= 1000);

-- Keep sensitive health text out of duplicated audit snapshots.
CREATE OR REPLACE FUNCTION redact_sensitive(p_row JSONB)
RETURNS JSONB AS $$
BEGIN
    RETURN p_row - 'password_hash' - 'reset_token' - 'health_conditions';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

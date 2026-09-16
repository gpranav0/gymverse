const crypto = require('crypto');

// Minutes each kind of link stays valid.
const TTL_MINUTES = {
  password_reset: 30,
  email_verification: 24 * 60,
};

// Only a hash is stored, so a copy of auth_tokens cannot be replayed as working links.
const hashToken = (raw) => crypto.createHash('sha256').update(String(raw)).digest('hex');

/**
 * Creates a one-time token and returns the raw value to put in an email link.
 * Earlier unused tokens of the same purpose are retired: only the newest link works.
 * `client` may be the pool or a transaction client.
 */
async function issueToken(client, userId, purpose) {
  if (!TTL_MINUTES[purpose]) throw new Error(`Unknown token purpose: ${purpose}`);
  const raw = crypto.randomBytes(32).toString('base64url');
  await client.query(
    `UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`,
    [userId, purpose]
  );
  await client.query(
    `INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP + make_interval(mins => $4::int))`,
    [userId, purpose, hashToken(raw), TTL_MINUTES[purpose]]
  );
  return raw;
}

/**
 * Atomically marks a token used and returns its user_id, or null when the token is
 * unknown, already used, expired, or for a different purpose. A single UPDATE means two
 * concurrent requests with the same link cannot both succeed.
 */
async function consumeToken(client, raw, purpose) {
  if (typeof raw !== 'string' || raw.length < 20) return null;
  const { rows } = await client.query(
    `UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP
     WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
     RETURNING user_id`,
    [hashToken(raw), purpose]
  );
  return rows[0]?.user_id ?? null;
}

module.exports = { issueToken, consumeToken, hashToken };

const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured. Set it in your .env file.');
  }
  return secret;
};

/**
 * Every token carries:
 *  - jti: its own id, so a single session can be revoked on logout (revoked_tokens)
 *  - tv:  the user's token_version when it was issued, so bumping the version revokes
 *         every session at once (sign out everywhere, password change or reset)
 */
const generateToken = (userId, role, tokenVersion = 0) => {
  return jwt.sign({ userId, role, tv: tokenVersion }, getSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    jwtid: randomUUID(),
  });
};

const verifyToken = (token) => {
  return jwt.verify(token, getSecret());
};

module.exports = { generateToken, verifyToken };

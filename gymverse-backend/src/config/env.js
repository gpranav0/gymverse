/**
 * Startup configuration check. Errors stop the server; warnings are printed and ignored.
 *
 * Production mistakes here are silent at runtime — a default database password or a
 * localhost CORS origin still "works" — so they are caught before the server listens.
 */
const LOCAL = /\b(localhost|127\.0\.0\.1|0\.0\.0\.0)\b/;
const WEAK_DB_PASSWORDS = new Set(['', 'root', 'postgres', 'password', 'admin', 'your_secure_password', 'change_me']);

function validateEnv(env = process.env) {
  const errors = [];
  const warnings = [];
  const production = env.NODE_ENV === 'production';

  if (!env.JWT_SECRET) {
    errors.push('JWT_SECRET is required. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
  } else if (env.JWT_SECRET.length < 32) {
    (production ? errors : warnings).push('JWT_SECRET should be at least 32 characters.');
  }

  if (!env.GEMINI_API_KEY && !env.GROQ_API_KEY) {
    warnings.push('No AI provider key (GEMINI_API_KEY / GROQ_API_KEY): the chat assistant will be unavailable.');
  }

  if (!production) return { errors, warnings };

  const origins = (env.CORS_ORIGIN || '').split(',').map((o) => o.trim()).filter(Boolean);
  if (origins.length === 0 && !env.SERVE_FRONTEND_DIST) {
    errors.push('CORS_ORIGIN must list the site origin(s) that call this API (or serve the frontend from this server with SERVE_FRONTEND_DIST).');
  }
  if (origins.includes('*')) errors.push('CORS_ORIGIN cannot be "*" in production.');
  if (origins.some((o) => LOCAL.test(o))) warnings.push('CORS_ORIGIN includes a localhost origin.');

  if (WEAK_DB_PASSWORDS.has(env.DB_PASSWORD || '')) {
    errors.push('DB_PASSWORD is empty or a well-known default.');
  }
  if ((env.DB_USER || 'postgres') === 'postgres') {
    warnings.push('The API connects as the postgres superuser. Use a least-privilege role (create_app_role.js, DEPLOYMENT.md).');
  }

  if (!env.SMTP_HOST) {
    warnings.push('SMTP_HOST is not set: password-reset and email-confirmation emails cannot be delivered.');
  }
  if (env.REQUIRE_EMAIL_VERIFICATION === 'true' && !env.SMTP_HOST) {
    errors.push('REQUIRE_EMAIL_VERIFICATION=true needs SMTP configured, otherwise nobody can confirm their address.');
  }
  if (!env.APP_BASE_URL || LOCAL.test(env.APP_BASE_URL)) {
    warnings.push('APP_BASE_URL should be the public site URL; it is used in emailed links.');
  }
  if (env.TRUST_PROXY !== 'true') {
    warnings.push('TRUST_PROXY is not "true". Set it when running behind a reverse proxy, or rate limits see every user as the proxy.');
  }

  return { errors, warnings };
}

module.exports = { validateEnv };

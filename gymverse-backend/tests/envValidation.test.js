const { validateEnv } = require('../src/config/env');

const production = {
  NODE_ENV: 'production',
  JWT_SECRET: 'x'.repeat(64),
  GEMINI_API_KEY: 'key',
  CORS_ORIGIN: 'https://gym.example.com',
  DB_USER: 'gymverse_app',
  DB_PASSWORD: 'a-long-unguessable-password',
  SMTP_HOST: 'smtp.example.com',
  APP_BASE_URL: 'https://gym.example.com',
  TRUST_PROXY: 'true',
};

test('a complete production configuration passes with no errors or warnings', () => {
  expect(validateEnv(production)).toEqual({ errors: [], warnings: [] });
});

test('a missing JWT secret stops the server in any environment', () => {
  expect(validateEnv({}).errors.join(' ')).toMatch(/JWT_SECRET is required/);
});

test.each([
  ['a short JWT secret', { JWT_SECRET: 'short' }, /JWT_SECRET/],
  ['a wildcard CORS origin', { CORS_ORIGIN: '*' }, /CORS_ORIGIN/],
  ['no CORS origin and no bundled frontend', { CORS_ORIGIN: '' }, /CORS_ORIGIN/],
  ['a default database password', { DB_PASSWORD: 'root' }, /DB_PASSWORD/],
  ['required verification without SMTP', { REQUIRE_EMAIL_VERIFICATION: 'true', SMTP_HOST: '' }, /REQUIRE_EMAIL_VERIFICATION/],
])('production refuses %s', (_label, overrides, pattern) => {
  expect(validateEnv({ ...production, ...overrides }).errors.join(' ')).toMatch(pattern);
});

test.each([
  ['the postgres superuser', { DB_USER: 'postgres' }, /superuser/],
  ['missing SMTP', { SMTP_HOST: '' }, /SMTP_HOST/],
  ['a localhost APP_BASE_URL', { APP_BASE_URL: 'http://localhost:5173' }, /APP_BASE_URL/],
  ['TRUST_PROXY not set', { TRUST_PROXY: '' }, /TRUST_PROXY/],
  ['no AI provider', { GEMINI_API_KEY: '' }, /AI provider/],
])('production warns about %s without refusing to start', (_label, overrides, pattern) => {
  const { errors, warnings } = validateEnv({ ...production, ...overrides });
  expect(errors).toEqual([]);
  expect(warnings.join(' ')).toMatch(pattern);
});

test('serving the frontend from the API removes the need for CORS_ORIGIN', () => {
  expect(validateEnv({ ...production, CORS_ORIGIN: '', SERVE_FRONTEND_DIST: '../gymverse-frontend/dist' }).errors).toEqual([]);
});

test('development only warns about a short secret and skips production checks', () => {
  const { errors, warnings } = validateEnv({ JWT_SECRET: 'short', GEMINI_API_KEY: 'key', DB_PASSWORD: 'root' });
  expect(errors).toEqual([]);
  expect(warnings.join(' ')).toMatch(/JWT_SECRET/);
  expect(warnings.join(' ')).not.toMatch(/DB_PASSWORD/);
});

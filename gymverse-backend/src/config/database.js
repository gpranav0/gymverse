const path = require('path');

// Load the backend's own .env first (it holds JWT_SECRET and API keys), then fall back to
// the repo-root .env for shared DB settings. dotenv never overwrites already-set variables,
// so the backend file wins on conflicts and real environment variables win over both.
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const { Pool, types } = require('pg');

// DATE columns are calendar days, not instants. The driver's default turns them into a JS
// Date at the server's local midnight, which JSON then serialises as a UTC timestamp, so a
// browser in another timezone showed every date a day early. Keep Postgres's 'YYYY-MM-DD'.
types.setTypeParser(types.builtins.DATE, (value) => value);

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'gymverse',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'root',
  max: parseInt(process.env.DB_POOL_MAX, 10) || 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// A dropped idle client is recoverable — the pool discards it and opens a new one on
// the next query. Killing the process here took the whole API down over a transient blip.
pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};

/**
 * Resets development account passwords to a known value.
 * Connection settings come from .env — see .env.example.
 *
 * Usage: node set_passwords.js [password] [email ...]
 */
const { hashPassword } = require('./src/utils/password');
const db = require('./src/config/database');

const DEFAULT_PASSWORD = 'Password@123';
const DEFAULT_USERS = [
  'admin@gymverse.com',
  'rec@gymverse.com',
  'arjun@gv.com'
];

async function main() {
  const [password = DEFAULT_PASSWORD, ...emails] = process.argv.slice(2);
  const targets = emails.length > 0 ? emails : DEFAULT_USERS;
  const hash = await hashPassword(password);

  for (const email of targets) {
    const r = await db.query('UPDATE users SET password_hash = $1 WHERE email = $2', [hash, email]);
    console.log(`${email} -> rows updated: ${r.rowCount}`);
  }

  await db.pool.end();
}

main().catch(async (e) => {
  console.error(e.message);
  await db.pool.end();
  process.exit(1);
});

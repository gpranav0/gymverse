// Uses mongosh only for an operator's verification, never in application requests.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
const { spawnSync } = require('child_process');
if (!process.env.MONGODB_URI) {
  console.log('MONGODB_URI is missing. Chat runs in temporary mode.');
  process.exit(0);
}
const executable = process.env.MONGOSH_PATH || 'mongosh';
// Connection credentials are inherited through the environment, not process arguments.
// The collection only exists once the backend has connected and built its indexes, so a
// fresh cluster is reported as "not created yet" rather than as a failed connection.
const script = `try {
  const connection = new Mongo(process.env.MONGODB_URI);
  const target = connection.getDB(process.env.MONGODB_DB_NAME || 'gymverse_chat');
  const connected = target.runCommand({ping:1}).ok === 1;
  const collections = target.getCollectionNames();
  const exists = collections.includes('chat_exchanges');
  print(JSON.stringify({ connected, collections,
    indexes: exists ? target.chat_exchanges.getIndexes().map(x => ({name:x.name,key:x.key,unique:!!x.unique})) : [],
    savedExchanges: exists ? target.chat_exchanges.countDocuments({}) : 0,
    note: exists ? undefined : 'chat_exchanges not created yet: start the backend once so it can build the indexes' }));
} catch (e) {
  // Name and code only: a driver message can include the host list or the username.
  print('MongoDB verification failed (' + (e.codeName || e.name) + '). Check Atlas Network Access, the database user and MONGODB_URI.');
  quit(1);
}`;
const result = spawnSync(executable, ['--nodb', '--quiet', '--eval', script], {
  env: { ...process.env, MONGOSH_DISABLE_TELEMETRY: '1' }, encoding: 'utf8', timeout: 15000, windowsHide: true,
});
// Suppress raw stderr: connection failures may contain credentials or cluster details.
if (result.status === 0) process.stdout.write(result.stdout);
else console.log('mongosh verification failed or timed out. Check MONGOSH_PATH and Atlas access.');
process.exitCode = result.status === 0 ? 0 : 1;

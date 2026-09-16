// Load the backend's .env by path, not from the working directory. Services such as the
// chat history store read their configuration when first required, so starting the
// server from any other folder used to silently drop MONGODB_URI and run temporary-only.
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env'), quiet: true });

const { validateEnv } = require('./config/env');
const { errors, warnings } = validateEnv();
for (const w of warnings) console.warn(`Config warning: ${w}`);
if (errors.length > 0) {
  for (const e of errors) console.error(`Config error: ${e}`);
  console.error('Server not started. See .env.example and DEPLOYMENT.md.');
  process.exit(1);
}

const app = require('./app');
const db = require('./config/database');
const { startMaintenance } = require('./jobs/maintenance');

const chatHistory = require('./services/chatHistoryService');
chatHistory.start(); // Optional: never await MongoDB to start the API.

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Verify database connection on startup
    await db.query('SELECT 1');
    console.log('Database connection verified successfully.');

    const server = app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}${process.env.NODE_ENV === 'production' ? ' (production)' : ''}`);
    });

    const stopMaintenance = startMaintenance();

    const shutdown = async (signal) => {
      console.log(`\n${signal} received, shutting down gracefully...`);
      stopMaintenance();
      server.close(async () => {
        await Promise.allSettled([db.pool.end(), chatHistory.close()]);
        process.exit(0);
      });
      // Don't hang forever if connections refuse to drain.
      setTimeout(() => process.exit(1), 10000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('Failed to connect to the database. Server not started.', err.message);
    process.exit(1);
  }
};

startServer();

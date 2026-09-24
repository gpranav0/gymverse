const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const rateLimit = require('express-rate-limit');
const YAML = require('yamljs');
const path = require('path');
const fs = require('fs');
const { expandDevelopmentOrigins } = require('./config/corsOrigins');

const app = express();

// Swagger describes every route including the internals of the auth flow, so it is a
// development aid rather than something to publish. Opt in explicitly.
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_API_DOCS === 'true') {
  const swaggerDocument = YAML.load(path.join(__dirname, '../swagger.yaml'));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
}

// Trust the first proxy hop so express-rate-limit sees the real client IP behind
// a reverse proxy instead of rate-limiting every user as one address.
//
// Only opt in when a proxy is genuinely in front. Trusting X-Forwarded-For on a
// directly-reachable server lets any client forge that header and land in a fresh
// rate-limit bucket on every request, which defeats the login brute-force limiter.
if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

// Advertising the framework tells an attacker which CVE list to work through.
app.disable('x-powered-by');

// Middleware
app.use(helmet());

// Restrict CORS to known origins. CORS_ORIGIN takes a comma-separated list;
// with no value set we fall back to the local Vite dev server.
const configuredOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const allowedOrigins = expandDevelopmentOrigins(configuredOrigins, process.env.NODE_ENV);

// A wildcard origin with credentials enabled means any site can make authenticated
// requests on a visitor's behalf. Refuse to start in that configuration rather than
// serve it.
if (process.env.NODE_ENV === 'production' && allowedOrigins.includes('*')) {
  throw new Error('CORS_ORIGIN cannot be "*" in production. List the allowed origins explicitly.');
}

app.use(cors({
  origin: (origin, callback) => {
    // Requests with no Origin header (curl, server-to-server, same-origin) are allowed.
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Baseline rate limit across the whole API. Auth and chat routes add stricter limits.
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 500,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' }
}));

// Health Check
app.get('/api/health', async (req, res) => {
  try {
    const db = require('./config/database');
    await db.query('SELECT 1');
    res.status(200).json({
      success: true,
      message: 'GymVerse backend is running',
      database: 'connected'
    });
  } catch (error) {
    // The driver's message names the host, port and user it tried. That is a map of the
    // internal network on an endpoint that is deliberately unauthenticated.
    console.error('Health check failed:', error.message);
    res.status(503).json({
      success: false,
      message: 'GymVerse backend is running',
      database: 'disconnected'
    });
  }
});

// Routes
const authRoutes = require('./routes/authRoutes');
const memberRoutes = require('./routes/memberRoutes');
const trainerRoutes = require('./routes/trainerRoutes');
const membershipRoutes = require('./routes/membershipRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const exerciseRoutes = require('./routes/exerciseRoutes');
const workoutPlanRoutes = require('./routes/workoutPlanRoutes');
const memberWorkoutRoutes = require('./routes/memberWorkoutRoutes');
const workoutSessionRoutes = require('./routes/workoutSessionRoutes');
const classRoutes = require('./routes/classRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const reportRoutes = require('./routes/reportRoutes');
const adminRoutes = require('./routes/adminRoutes');
const chatRoutes = require('./routes/chatRoutes');
const trainerAssignmentRoutes = require('./routes/trainerAssignmentRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/trainers', trainerRoutes);
app.use('/api/membership-plans', membershipRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/exercises', exerciseRoutes);
app.use('/api/workout-plans', workoutPlanRoutes);
app.use('/api/member-workouts', memberWorkoutRoutes);
app.use('/api/workout-sessions', workoutSessionRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/trainer-assignments', trainerAssignmentRoutes);

// Single-process production mode: serve the built frontend from this server, so the SPA
// and the API share one origin (no CORS, one TLS certificate, one process to run).
// SERVE_FRONTEND_DIST is relative to gymverse-backend, e.g. ../gymverse-frontend/dist
const frontendDist = process.env.SERVE_FRONTEND_DIST
  ? path.resolve(__dirname, '..', process.env.SERVE_FRONTEND_DIST)
  : null;
if (frontendDist && fs.existsSync(path.join(frontendDist, 'index.html'))) {
  app.use(express.static(frontendDist, {
    index: false,
    setHeaders: (res, file) => {
      // Vite fingerprints everything under assets/, so those can be cached forever;
      // index.html must always be revalidated or users keep loading old bundles.
      const immutable = file.includes(`${path.sep}assets${path.sep}`);
      res.setHeader('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
    }
  }));
  // Client-side routes (/members, /reset-password, ...) all load the SPA shell.
  app.get(/^\/(?!api(?:\/|$)|api-docs(?:\/|$)).*/, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else if (frontendDist) {
  console.warn(`SERVE_FRONTEND_DIST is set but ${frontendDist}/index.html does not exist. Run the frontend build first.`);
}

// Centralized error handler
const { errorHandler } = require('./middleware/errorMiddleware');
const { notFound } = require('./middleware/notFoundMiddleware');

app.use(notFound);
app.use(errorHandler);

module.exports = app;

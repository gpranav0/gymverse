/**
 * An error that carries the HTTP status the client should see.
 *
 * The older pattern (`res.status(403); throw new Error(...)`) only works inside a
 * controller that has `res` in scope, which rules out shared helpers. Attaching the
 * status to the error instead lets any layer — util, service, controller — reject a
 * request, and lets the central error handler read the status off the error itself.
 */
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    // Keep the constructor itself out of the reported stack.
    Error.captureStackTrace?.(this, AppError);
  }
}

const badRequest = (msg) => new AppError(msg, 400);
const forbidden = (msg) => new AppError(msg, 403);
const notFoundError = (msg) => new AppError(msg, 404);
const conflict = (msg) => new AppError(msg, 409);

module.exports = { AppError, badRequest, forbidden, notFoundError, conflict };

// Postgres error codes we can turn into a meaningful client response instead of a
// blanket 500. Anything not listed here stays a 500, which is the safe default.
const PG_ERROR_MAP = {
  '23505': { status: 409, message: 'That record already exists.' },              // unique_violation
  '23503': { status: 409, message: 'Related records prevent this operation.' },  // foreign_key_violation
  '23502': { status: 400, message: 'A required field was missing.' },            // not_null_violation
  '23514': { status: 400, message: 'A value was outside the allowed range.' },   // check_violation
  '22P02': { status: 400, message: 'A value had the wrong type.' },              // invalid_text_representation
  '22003': { status: 400, message: 'A number was out of range.' }                // numeric_value_out_of_range
};

const errorHandler = (err, req, res, next) => {
  // Never swallow a database constraint message into a 200. Resolve the status from the
  // error first, then from whatever the controller already set, then fall back to 500.
  let statusCode = err.statusCode;
  let message = err.message || 'Internal Server Error';

  if (!statusCode && err.code && PG_ERROR_MAP[err.code]) {
    const mapped = PG_ERROR_MAP[err.code];
    statusCode = mapped.status;
    // Constraint names and column details leak schema internals, so send a generic
    // message and keep the driver's own text in the log.
    message = mapped.message;
  }

  if (!statusCode) {
    statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  }

  // Log the full detail server-side regardless of what the client is told.
  if (statusCode >= 500) {
    console.error(err.stack || err);
  } else {
    console.warn(`${req.method} ${req.originalUrl} -> ${statusCode}: ${err.message}`);
  }

  // A 500 must not echo the raw error text: it is frequently a driver or filesystem
  // message that describes internals the caller should never see.
  const body = {
    success: false,
    message: statusCode >= 500 && process.env.NODE_ENV === 'production'
      ? 'Internal Server Error'
      : message
  };

  // Stack traces are only exposed when NODE_ENV is explicitly 'development'.
  // Defaulting the other way leaks internals whenever NODE_ENV is simply unset.
  if (process.env.NODE_ENV === 'development') {
    body.error = err.stack;
  }

  res.status(statusCode).json(body);
};

module.exports = { errorHandler };

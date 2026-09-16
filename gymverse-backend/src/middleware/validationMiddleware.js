const { validationResult } = require('express-validator');

/**
 * Turns express-validator results into a 422 with per-field detail.
 *
 * The response carries an `errors` array as well as the joined message: the frontend's
 * getErrorMessage() already prefers the array, so field-level feedback reaches the form
 * instead of one flattened sentence.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }

  const details = errors.array().map((e) => ({
    field: e.path || e.param,
    msg: e.msg
  }));

  return res.status(422).json({
    success: false,
    message: 'Validation failed: ' + details.map((d) => d.msg).join(', '),
    errors: details
  });
};

module.exports = { validate };

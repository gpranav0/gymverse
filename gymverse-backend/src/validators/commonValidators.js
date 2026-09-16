const { param, query } = require('express-validator');

// Every :id in this API is a Postgres IDENTITY column, so a positive integer.
// Without this, "abc" reached the driver and surfaced as a 500 instead of a 400.
const idParam = (name = 'id') =>
  param(name).isInt({ min: 1 }).withMessage(`${name} must be a positive integer`).toInt();

const paginationQuery = [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('limit must be between 1 and 1000'),
  query('search').optional().isString().isLength({ max: 100 }).withMessage('search must be at most 100 characters')
];

module.exports = { idParam, paginationQuery };

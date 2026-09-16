const db = require('../config/database');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 1000;

// Parses ?page and ?limit into safe values. Without a ceiling a single request could
// ask for millions of rows; without a floor a negative page yields a negative OFFSET,
// which Postgres rejects outright.
const getPagination = (req, { defaultLimit = DEFAULT_LIMIT, maxLimit = MAX_LIMIT } = {}) => {
  const parsedPage = parseInt(req.query.page, 10);
  const parsedLimit = parseInt(req.query.limit, 10);

  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
    ? Math.min(parsedLimit, maxLimit)
    : defaultLimit;

  return { page, limit, offset: (page - 1) * limit };
};

const buildMeta = (page, limit, total) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit) || 0
});

/**
 * One page of a list and its total, fetched together.
 *
 * Both statements share `from` (the FROM clause, joins and WHERE), so the total always
 * counts exactly the rows being paged through. Every list endpoint used to hand-write
 * this pair and run the two queries one after the other.
 *
 * `select`, `from` and `orderBy` are SQL written by the caller, never request input;
 * values go in `params` as $1..$n.
 */
const paginate = async (req, { select, from, orderBy, params = [], ...limits }) => {
  const { page, limit, offset } = getPagination(req, limits);
  const [count, list] = await Promise.all([
    db.query(`SELECT COUNT(*) FROM ${from}`, params),
    db.query(
      `SELECT ${select} FROM ${from} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
  ]);
  return { data: list.rows, meta: buildMeta(page, limit, parseInt(count.rows[0].count, 10)) };
};

module.exports = { getPagination, buildMeta, paginate };

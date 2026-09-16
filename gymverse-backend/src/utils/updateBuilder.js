const { badRequest } = require('./AppError');

/**
 * Builds a parameterised UPDATE from a whitelist of columns.
 *
 * Column names come only from `allowedFields`, never from the request, so they are safe
 * to interpolate; every value goes through a placeholder. This replaces the near-identical
 * loop that had been copy-pasted into each PATCH handler.
 *
 * @param {string} table          table to update
 * @param {string} idColumn       primary key column
 * @param {number|string} id      primary key value
 * @param {string[]} allowedFields columns the caller is permitted to set
 * @param {object} payload        request body
 * @param {object} [opts]
 * @param {string[]} [opts.skip]  columns to drop even if present (e.g. status for non-admins)
 */
const buildUpdate = (table, idColumn, id, allowedFields, payload, { skip = [] } = {}) => {
  const assignments = [];
  const params = [];

  for (const field of allowedFields) {
    if (skip.includes(field)) continue;
    if (payload[field] === undefined) continue;

    params.push(payload[field]);
    assignments.push(`${field} = $${params.length}`);
  }

  if (assignments.length === 0) {
    throw badRequest('No valid fields provided for update');
  }

  params.push(id);

  return {
    text: `UPDATE ${table} SET ${assignments.join(', ')} WHERE ${idColumn} = $${params.length} RETURNING *`,
    params
  };
};

/**
 * PUT semantics without the data loss.
 *
 * The previous PUT handlers destructured the body and passed every value positionally,
 * so a request that omitted `address` silently wrote NULL over it. Requiring the caller
 * to send `requiredFields` means a partial PUT is rejected rather than destructive;
 * optional fields still fall back to their current value via COALESCE-free omission.
 */
const buildReplace = (table, idColumn, id, requiredFields, optionalFields, payload, { skip = [] } = {}) => {
  const missing = requiredFields.filter(
    (f) => payload[f] === undefined || payload[f] === null || payload[f] === ''
  );
  if (missing.length > 0) {
    throw badRequest(
      `PUT replaces the whole record, so these fields are required: ${missing.join(', ')}. Use PATCH for a partial update.`
    );
  }

  return buildUpdate(table, idColumn, id, [...requiredFields, ...optionalFields], payload, { skip });
};

module.exports = { buildUpdate, buildReplace };

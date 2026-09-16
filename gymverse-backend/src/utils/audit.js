/**
 * Writes an application-level audit entry. Row-level triggers only cover users and
 * members; money and roster changes are recorded here, inside the same transaction as the
 * change, so an entry exists if and only if the change committed.
 */
const writeAudit = (client, { userId, action, table, recordId, oldData = null, newData = null }) =>
  client.query(
    `INSERT INTO audit_logs (user_id, action, table_name, record_id, old_data, new_data)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      userId ?? null,
      action,
      table,
      recordId,
      oldData === null ? null : JSON.stringify(oldData),
      newData === null ? null : JSON.stringify(newData),
    ]
  );

module.exports = { writeAudit };

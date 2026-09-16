const db = require('../config/database');
const { paginate } = require('../utils/pagination');
const { parseId, assertFinancialAccess } = require('../utils/authorize');
const { badRequest, notFoundError } = require('../utils/AppError');
const { writeAudit } = require('../utils/audit');
const { withTransaction } = require('../utils/transaction');

const getPayments = async (req, res, next) => {
  try {
    const { data, meta } = await paginate(req, { select: '*', from: 'payments', orderBy: 'created_at DESC' });
    res.status(200).json({ success: true, data, meta });
  } catch (error) { next(error); }
};

const getPaymentById = async (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'payment id');

    const result = await db.query('SELECT * FROM payments WHERE payment_id = $1', [id]);
    if (result.rows.length === 0) { throw notFoundError('Payment not found'); }

    const pay = result.rows[0];
    // Billing is staff-and-self only. A trainer has no business reading a client's
    // payment history, even for a member on their own roster.
    assertFinancialAccess(req, pay.member_id);

    res.status(200).json({ success: true, data: pay });
  } catch (error) { next(error); }
};

const getMemberPayments = async (req, res, next) => {
  try {
    const member_id = parseId(req.params.id, 'member id');
    assertFinancialAccess(req, member_id);

    const { data, meta } = await paginate(req, {
      select: '*', from: 'payments WHERE member_id = $1', orderBy: 'created_at DESC', params: [member_id], maxLimit: 200,
    });
    res.status(200).json({ success: true, data, meta });
  } catch (error) { next(error); }
};

// Creating a manual payment for a subscription. Money movements are audited in the same
// transaction as the write, so the log cannot miss a payment or record one that failed.
const createPayment = async (req, res, next) => {
  try {
    const { subscription_id, member_id, amount, payment_method, notes } = req.body;

    const payment = await withTransaction(async (client) => {
      // The subscription and the member must actually belong together. Without this check
      // a payment could be filed against one member's subscription under another member's
      // id, which silently corrupts every report that joins the two.
      const owns = await client.query(
        'SELECT 1 FROM subscriptions WHERE subscription_id = $1 AND member_id = $2',
        [subscription_id, member_id]
      );
      if (owns.rows.length === 0) {
        throw badRequest('subscription_id does not belong to that member');
      }

      const { rows: [created] } = await client.query(
        `INSERT INTO payments (subscription_id, member_id, amount, payment_method, payment_status, notes)
         VALUES ($1, $2, $3, $4, 'completed', $5) RETURNING *`,
        [subscription_id, member_id, amount, payment_method, notes || null]
      );

      await writeAudit(client, {
        userId: req.user.user_id, action: 'create_payment', table: 'payments', recordId: created.payment_id,
        newData: { subscription_id, member_id, amount: created.amount, payment_method, payment_status: created.payment_status },
      });
      return created;
    });

    res.status(201).json({ success: true, data: payment });
  } catch (error) { next(error); }
};

// A status change (completed → refunded, say) is exactly the kind of edit that needs a
// who-and-when trail; it previously left none.
const patchPayment = async (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'payment id');
    const { payment_status, notes } = req.body;

    if (payment_status === undefined && notes === undefined) {
      throw badRequest('No valid fields provided for update');
    }

    const after = await withTransaction(async (client) => {
      const existing = await client.query('SELECT payment_status, notes FROM payments WHERE payment_id = $1 FOR UPDATE', [id]);
      if (existing.rows.length === 0) { throw notFoundError('Payment not found'); }
      const before = existing.rows[0];

      const { rows: [updated] } = await client.query(
        'UPDATE payments SET payment_status = COALESCE($1, payment_status), notes = COALESCE($2, notes) WHERE payment_id = $3 RETURNING *',
        [payment_status ?? null, notes ?? null, id]
      );

      await writeAudit(client, {
        userId: req.user.user_id, action: 'update_payment', table: 'payments', recordId: id,
        oldData: { payment_status: before.payment_status, notes: before.notes },
        newData: { payment_status: updated.payment_status, notes: updated.notes },
      });
      return updated;
    });

    res.status(200).json({ success: true, data: after });
  } catch (error) { next(error); }
};

module.exports = { getPayments, getPaymentById, getMemberPayments, createPayment, patchPayment };

const db = require('../config/database');
const { paginate } = require('../utils/pagination');
const { parseId, assertFinancialAccess } = require('../utils/authorize');
const { notFoundError, conflict } = require('../utils/AppError');
const { writeAudit } = require('../utils/audit');
const { withTransaction } = require('../utils/transaction');

const createSubscription = async (req, res, next) => {
  try {
    const { member_id, plan_id, payment_method, notes } = req.body;

    const { subscription, payment } = await withTransaction(async (client) => {
      // Lock the *member* row, not the subscription rows.
      //
      // Locking `SELECT ... FROM subscriptions WHERE ... FOR UPDATE` does not serialise
      // concurrent requests: when the member has no active subscription that query matches
      // zero rows and therefore locks nothing, so two requests could both see "no active
      // subscription" and both proceed. The member row gives every request for that member
      // a single queue, whether or not a subscription exists yet.
      const memberLock = await client.query(
        'SELECT member_id, status FROM members WHERE member_id = $1 FOR UPDATE',
        [member_id]
      );
      if (memberLock.rows.length === 0) {
        throw notFoundError('Member not found');
      }

      const existingSub = await client.query(
        `SELECT subscription_id FROM subscriptions WHERE member_id = $1 AND subscription_status = 'active'`,
        [member_id]
      );
      if (existingSub.rows.length > 0) {
        throw conflict('Member already has an active subscription');
      }

      const planResult = await client.query(
        `SELECT duration_months, price, status FROM membership_plans WHERE plan_id = $1`,
        [plan_id]
      );
      if (planResult.rows.length === 0) { throw notFoundError('Plan not found'); }
      const plan = planResult.rows[0];
      if (plan.status !== 'active') {
        throw conflict('That membership plan is no longer available');
      }

      const { rows: [sub] } = await client.query(
        `INSERT INTO subscriptions (member_id, plan_id, start_date, end_date, subscription_status)
         VALUES ($1, $2, CURRENT_DATE, CURRENT_DATE + ($3 || ' months')::interval, 'active') RETURNING *`,
        [member_id, plan_id, plan.duration_months]
      );

      const { rows: [pay] } = await client.query(
        `INSERT INTO payments (subscription_id, member_id, amount, payment_method, payment_status, notes)
         VALUES ($1, $2, $3, $4, 'completed', $5) RETURNING *`,
        [sub.subscription_id, member_id, plan.price, payment_method, notes || null]
      );

      await writeAudit(client, {
        userId: req.user.user_id, action: 'create_subscription', table: 'subscriptions',
        recordId: sub.subscription_id,
        newData: { member_id, plan_id, payment_id: pay.payment_id, amount: plan.price, payment_method },
      });
      return { subscription: sub, payment: pay };
    });

    res.status(201).json({
      success: true,
      message: 'Subscription and payment recorded successfully',
      data: { subscription, payment }
    });
  } catch (error) {
    // uniq_active_subscription_per_member is the database's own guarantee. If it fires,
    // the cause is the same duplicate the check above is for, so report it as such
    // rather than letting a raw unique violation surface as a 500.
    if (error.code === '23505') {
      return next(conflict('Member already has an active subscription'));
    }
    next(error);
  }
};

const getSubscriptions = async (req, res, next) => {
  try {
    const { data, meta } = await paginate(req, {
      select: 's.*, m.member_name, mp.plan_name',
      from: `subscriptions s
             JOIN members m ON s.member_id = m.member_id
             JOIN membership_plans mp ON s.plan_id = mp.plan_id`,
      orderBy: 's.created_at DESC',
    });
    res.status(200).json({ success: true, data, meta });
  } catch (error) { next(error); }
};

const getSubscriptionById = async (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'subscription id');

    const result = await db.query('SELECT * FROM subscriptions WHERE subscription_id = $1', [id]);
    if (result.rows.length === 0) { throw notFoundError('Subscription not found'); }

    const sub = result.rows[0];
    assertFinancialAccess(req, sub.member_id);

    res.status(200).json({ success: true, data: sub });
  } catch (error) { next(error); }
};

const getMemberSubscriptions = async (req, res, next) => {
  try {
    const member_id = parseId(req.params.id, 'member id');
    assertFinancialAccess(req, member_id);

    // plan_name is joined in: the member profile otherwise showed "Plan 3".
    const { data, meta } = await paginate(req, {
      select: 's.*, mp.plan_name',
      from: `subscriptions s
             JOIN membership_plans mp ON mp.plan_id = s.plan_id
             WHERE s.member_id = $1`,
      orderBy: 's.created_at DESC',
      params: [member_id],
      maxLimit: 200,
    });
    res.status(200).json({ success: true, data, meta });
  } catch (error) { next(error); }
};

module.exports = { createSubscription, getSubscriptions, getSubscriptionById, getMemberSubscriptions };

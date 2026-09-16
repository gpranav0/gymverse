const db = require('../config/database');
const { paginate } = require('../utils/pagination');
const { buildUpdate } = require('../utils/updateBuilder');
const { parseId } = require('../utils/authorize');
const { notFoundError, conflict } = require('../utils/AppError');

const WRITABLE_FIELDS = ['plan_name', 'description', 'duration_months', 'price', 'access_level', 'status'];

const getMembershipPlans = async (req, res, next) => {
  try {
    // This route is the public catalogue, so unauthenticated callers see active plans
    // only. Staff, who are the ones editing them, still need to see retired plans.
    const staffView = req.user && (req.user.role === 'admin' || req.user.role === 'receptionist');

    const { data, meta } = await paginate(req, {
      defaultLimit: 50,
      maxLimit: 200,
      select: '*',
      from: `membership_plans${staffView ? '' : ` WHERE status = 'active'`}`,
      orderBy: 'price ASC',
    });
    res.status(200).json({ success: true, data, meta });
  } catch (error) { next(error); }
};

const getMembershipPlanById = async (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'plan id');
    const result = await db.query('SELECT * FROM membership_plans WHERE plan_id = $1', [id]);
    if (result.rows.length === 0) { throw notFoundError('Plan not found'); }
    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const createMembershipPlan = async (req, res, next) => {
  try {
    const { plan_name, description, duration_months, price, access_level, status } = req.body;
    const result = await db.query(
      `INSERT INTO membership_plans (plan_name, description, duration_months, price, access_level, status)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [plan_name, description || null, duration_months, price, access_level || null, status || 'active']
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const updateMembershipPlan = async (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'plan id');
    const { plan_name, description, duration_months, price, access_level, status } = req.body;

    // status is optional on PUT. Defaulting an omitted status to 'active' put retired plans
    // back on sale, where members could buy them, so an omitted status keeps the current one.
    const result = await db.query(
      `UPDATE membership_plans SET plan_name = $1, description = $2, duration_months = $3,
              price = $4, access_level = $5, status = COALESCE($6, status)
       WHERE plan_id = $7 RETURNING *`,
      [plan_name, description || null, duration_months, price, access_level || null, status || null, id]
    );
    if (result.rows.length === 0) { throw notFoundError('Plan not found'); }
    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const patchMembershipPlan = async (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'plan id');

    const { text, params } = buildUpdate('membership_plans', 'plan_id', id, WRITABLE_FIELDS, req.body);

    const result = await db.query(text, params);
    if (result.rows.length === 0) { throw notFoundError('Plan not found'); }

    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
};

const deleteMembershipPlan = async (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'plan id');

    // Deleting a plan that subscriptions point at would cascade or fail depending on the
    // FK; retiring it keeps historical revenue reports intact either way.
    const inUse = await db.query('SELECT 1 FROM subscriptions WHERE plan_id = $1 LIMIT 1', [id]);
    if (inUse.rows.length > 0) {
      throw conflict('Cannot delete a plan that has subscriptions. Set its status to inactive instead.');
    }

    const result = await db.query('DELETE FROM membership_plans WHERE plan_id = $1 RETURNING plan_id', [id]);
    if (result.rows.length === 0) { throw notFoundError('Plan not found'); }

    res.status(200).json({ success: true, message: 'Plan deleted' });
  } catch (error) { next(error); }
};

module.exports = {
  getMembershipPlans,
  getMembershipPlanById,
  createMembershipPlan,
  updateMembershipPlan,
  patchMembershipPlan,
  deleteMembershipPlan
};

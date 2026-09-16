const { paginate } = require('../utils/pagination');

const getRevenueReport = async (req, res, next) => {
  try {
    const { data, meta } = await paginate(req, {
      defaultLimit: 50,
      select: 'p.payment_date, m.member_name, p.amount, p.payment_method, mp.plan_name',
      from: `payments p
             JOIN members m ON p.member_id = m.member_id
             JOIN subscriptions s ON p.subscription_id = s.subscription_id
             JOIN membership_plans mp ON s.plan_id = mp.plan_id
             WHERE p.payment_status = 'completed'`,
      orderBy: 'p.payment_date DESC',
    });
    res.status(200).json({ success: true, data, meta });
  } catch (error) { next(error); }
};

const getMembersReport = async (req, res, next) => {
  try {
    // uniq_active_subscription_per_member allows one active subscription, so the join
    // cannot repeat a member.
    const { data, meta } = await paginate(req, {
      defaultLimit: 50,
      select: `m.member_name, m.email, m.phone, m.join_date, m.status, COALESCE(mp.plan_name, 'None') as active_plan`,
      from: `members m
             LEFT JOIN subscriptions s ON m.member_id = s.member_id AND s.subscription_status = 'active'
             LEFT JOIN membership_plans mp ON s.plan_id = mp.plan_id`,
      orderBy: 'm.join_date DESC',
    });
    res.status(200).json({ success: true, data, meta });
  } catch (error) { next(error); }
};

module.exports = { getRevenueReport, getMembersReport };

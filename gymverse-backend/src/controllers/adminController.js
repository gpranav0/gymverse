const db = require('../config/database');
const { parseId } = require('../utils/authorize');
const { notFoundError, badRequest, forbidden } = require('../utils/AppError');
const { withTransaction } = require('../utils/transaction');
const { writeAudit } = require('../utils/audit');

// Approving and rejecting a trainer signup differ only in the statuses they set and the
// audit action they record, so both are built from this one handler.
const reviewTrainer = ({ userStatus, trainerStatus, action, message }) => async (req, res, next) => {
  try {
    const id = parseId(req.params.id, 'user id');

    // An admin approving or rejecting their own account is a self-review; block it even
    // though the pending-status check makes it unreachable today.
    if (id === req.user.user_id) {
      throw forbidden('You cannot review your own account');
    }

    await withTransaction(async (client) => {
      // FOR UPDATE serialises two admins acting on the same request: without it both read
      // 'pending', both pass the check, and the second write silently overrides the first.
      const { rows: [user] } = await client.query('SELECT status, trainer_id FROM users WHERE user_id = $1 FOR UPDATE', [id]);
      if (!user) throw notFoundError('User not found');
      if (user.status !== 'pending') throw badRequest('User is not pending approval');

      await client.query('UPDATE users SET status = $1 WHERE user_id = $2', [userStatus, id]);

      // The trainer record follows the account. On rejection it is stood down, so a
      // rejected applicant no longer appears in trainer listings or can be assigned classes.
      if (user.trainer_id) {
        await client.query('UPDATE trainers SET status = $1 WHERE trainer_id = $2', [trainerStatus, user.trainer_id]);
      }

      await writeAudit(client, {
        userId: req.user.user_id, action, table: 'users', recordId: id,
        oldData: { status: 'pending' }, newData: { status: userStatus },
      });
    });

    res.status(200).json({ success: true, message });
  } catch (error) {
    next(error);
  }
};

const approveTrainer = reviewTrainer({
  userStatus: 'active', trainerStatus: 'active', action: 'approve_trainer', message: 'Trainer approved successfully',
});

const rejectTrainer = reviewTrainer({
  userStatus: 'rejected', trainerStatus: 'inactive', action: 'reject_trainer', message: 'Trainer rejected successfully',
});

const getPendingTrainers = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT u.user_id, u.username, u.email, u.created_at, t.trainer_name, t.specialization, t.qualification
       FROM users u
       JOIN trainers t ON u.trainer_id = t.trainer_id
       WHERE u.status = 'pending'`
    );
    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

// @route POST /api/admin/maintenance/run — run the scheduled housekeeping immediately.
const runMaintenanceNow = async (req, res, next) => {
  try {
    const { runMaintenance } = require('../jobs/maintenance');
    const result = await runMaintenance();
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  approveTrainer,
  rejectTrainer,
  getPendingTrainers,
  runMaintenanceNow
};

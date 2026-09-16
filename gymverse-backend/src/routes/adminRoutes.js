const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const { idParam } = require('../validators/commonValidators');
const { approveTrainer, rejectTrainer, getPendingTrainers, runMaintenanceNow } = require('../controllers/adminController');

router.use(requireAuth);
router.use(requireRole('admin'));

router.get('/users/pending-trainers', getPendingTrainers);
router.patch('/users/:id/approve', idParam(), validate, approveTrainer);
router.patch('/users/:id/reject', idParam(), validate, rejectTrainer);
router.post('/maintenance/run', runMaintenanceNow);

module.exports = router;

const express = require('express');
const router = express.Router();
const { createSubscription, getSubscriptions, getSubscriptionById, getMemberSubscriptions } = require('../controllers/subscriptionController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const { idParam, paginationQuery } = require('../validators/commonValidators');
const { subscriptionCreateValidator } = require('../validators/resourceValidators');

router.use(requireAuth);

router.route('/')
  .get(requireRole('admin', 'receptionist'), paginationQuery, validate, getSubscriptions)
  .post(requireRole('admin', 'receptionist'), subscriptionCreateValidator, validate, createSubscription);

router.route('/member/:id')
  .get(idParam(), paginationQuery, validate, getMemberSubscriptions);

router.route('/:id')
  .get(idParam(), validate, getSubscriptionById);

module.exports = router;

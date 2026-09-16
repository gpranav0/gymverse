const express = require('express');
const router = express.Router();
const {
  getMembershipPlans, getMembershipPlanById, createMembershipPlan,
  updateMembershipPlan, patchMembershipPlan, deleteMembershipPlan
} = require('../controllers/membershipController');
const { requireAuth, optionalAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const { idParam, paginationQuery } = require('../validators/commonValidators');
const { planCreateValidator, planPatchValidator } = require('../validators/resourceValidators');

// The catalogue stays public, but optionalAuth lets staff see retired plans on the same
// URL instead of needing a separate admin endpoint.
router.route('/')
  .get(optionalAuth, paginationQuery, validate, getMembershipPlans)
  .post(requireAuth, requireRole('admin'), planCreateValidator, validate, createMembershipPlan);

router.route('/:id')
  .get(optionalAuth, idParam(), validate, getMembershipPlanById)
  .put(requireAuth, requireRole('admin'), idParam(), planCreateValidator, validate, updateMembershipPlan)
  .patch(requireAuth, requireRole('admin'), idParam(), planPatchValidator, validate, patchMembershipPlan)
  .delete(requireAuth, requireRole('admin'), idParam(), validate, deleteMembershipPlan);

module.exports = router;

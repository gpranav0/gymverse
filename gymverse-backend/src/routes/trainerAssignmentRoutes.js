const express = require('express');
const router = express.Router();
const { getAssignments, createAssignment, updateAssignment } = require('../controllers/trainerAssignmentController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const { idParam, paginationQuery } = require('../validators/commonValidators');
const {
  trainerAssignmentQuery,
  trainerAssignmentCreateValidator,
  trainerAssignmentUpdateValidator
} = require('../validators/resourceValidators');

router.use(requireAuth);

router.route('/')
  .get(paginationQuery, trainerAssignmentQuery, validate, getAssignments) // scoped per role in the controller
  .post(requireRole('admin', 'receptionist'), trainerAssignmentCreateValidator, validate, createAssignment);

router.patch('/:id', requireRole('admin', 'receptionist'), idParam(), trainerAssignmentUpdateValidator, validate, updateAssignment);

module.exports = router;

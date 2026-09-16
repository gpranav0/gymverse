const express = require('express');
const router = express.Router();
const { assignWorkout, getMemberWorkouts, updateMemberWorkoutStatus } = require('../controllers/memberWorkoutController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const { idParam, paginationQuery } = require('../validators/commonValidators');
const { assignWorkoutValidator, memberWorkoutPatchValidator } = require('../validators/resourceValidators');

router.use(requireAuth);

router.route('/')
  .post(requireRole('admin', 'trainer'), assignWorkoutValidator, validate, assignWorkout);

router.route('/member/:id')
  .get(idParam(), paginationQuery, validate, getMemberWorkouts);

router.route('/:id')
  .patch(idParam(), memberWorkoutPatchValidator, validate, updateMemberWorkoutStatus);

module.exports = router;

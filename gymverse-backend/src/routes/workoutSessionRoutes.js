const express = require('express');
const router = express.Router();
const { logWorkoutSession, getMemberSessions } = require('../controllers/workoutSessionController');
const { requireAuth } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const { idParam, paginationQuery } = require('../validators/commonValidators');
const { workoutSessionValidator } = require('../validators/resourceValidators');

router.use(requireAuth);

router.route('/')
  .post(workoutSessionValidator, validate, logWorkoutSession);

router.route('/member/:id')
  .get(idParam(), paginationQuery, validate, getMemberSessions);

module.exports = router;

const express = require('express');
const router = express.Router();
const { getWorkoutPlans, getWorkoutPlanById, createWorkoutPlan, deleteWorkoutPlan } = require('../controllers/workoutPlanController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const { idParam, paginationQuery } = require('../validators/commonValidators');
const { workoutPlanCreateValidator } = require('../validators/resourceValidators');

router.use(requireAuth);

router.route('/')
  .get(paginationQuery, validate, getWorkoutPlans)
  .post(requireRole('admin', 'trainer'), workoutPlanCreateValidator, validate, createWorkoutPlan);

router.route('/:id')
  .get(idParam(), validate, getWorkoutPlanById)
  .delete(requireRole('admin', 'trainer'), idParam(), validate, deleteWorkoutPlan);

module.exports = router;

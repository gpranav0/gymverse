const express = require('express');
const router = express.Router();
const { getExercises, getExerciseById, createExercise, updateExercise, deleteExercise } = require('../controllers/exerciseController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const { idParam, paginationQuery } = require('../validators/commonValidators');
const { exerciseValidator } = require('../validators/resourceValidators');

router.use(requireAuth);

router.route('/')
  .get(paginationQuery, validate, getExercises)
  .post(requireRole('admin', 'trainer'), exerciseValidator, validate, createExercise);

router.route('/:id')
  .get(idParam(), validate, getExerciseById)
  .put(requireRole('admin', 'trainer'), idParam(), exerciseValidator, validate, updateExercise)
  .delete(requireRole('admin'), idParam(), validate, deleteExercise);

module.exports = router;

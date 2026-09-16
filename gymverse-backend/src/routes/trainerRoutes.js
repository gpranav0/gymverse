const express = require('express');
const router = express.Router();
const {
  getTrainers,
  getTrainerById,
  createTrainer,
  updateTrainer,
  patchTrainer,
  deleteTrainer
} = require('../controllers/trainerController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const { idParam, paginationQuery } = require('../validators/commonValidators');
const {
  trainerCreateValidator,
  trainerUpdateValidator,
  trainerPatchValidator
} = require('../validators/resourceValidators');

router.use(requireAuth);

router.route('/')
  .get(paginationQuery, validate, getTrainers) // projection is chosen per role in the controller
  .post(requireRole('admin'), trainerCreateValidator, validate, createTrainer);

router.route('/:id')
  .get(idParam(), validate, getTrainerById)
  .put(idParam(), trainerUpdateValidator, validate, updateTrainer)
  .patch(idParam(), trainerPatchValidator, validate, patchTrainer)
  .delete(requireRole('admin'), idParam(), validate, deleteTrainer);

module.exports = router;

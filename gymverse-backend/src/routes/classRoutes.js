const express = require('express');
const router = express.Router();
const { getClasses, getClassById, createClass, updateClass, deleteClass } = require('../controllers/classController');
const { requireAuth, optionalAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const { idParam, paginationQuery } = require('../validators/commonValidators');
const { classValidator } = require('../validators/resourceValidators');

// Public catalogue. optionalAuth lets an admin see inactive classes on the same URL
// instead of needing a parallel admin-only endpoint.
router.route('/')
  .get(optionalAuth, paginationQuery, validate, getClasses)
  .post(requireAuth, requireRole('admin'), classValidator, validate, createClass);

router.route('/:id')
  .get(optionalAuth, idParam(), validate, getClassById)
  .put(requireAuth, requireRole('admin'), idParam(), classValidator, validate, updateClass)
  .delete(requireAuth, requireRole('admin'), idParam(), validate, deleteClass);

module.exports = router;

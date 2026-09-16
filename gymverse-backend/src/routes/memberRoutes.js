const express = require('express');
const router = express.Router();
const {
  getMembers,
  getMemberById,
  createMember,
  updateMember,
  patchMember,
  deleteMember
} = require('../controllers/memberController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const { idParam, paginationQuery } = require('../validators/commonValidators');
const {
  memberCreateValidator,
  memberUpdateValidator,
  memberPatchValidator
} = require('../validators/resourceValidators');

router.use(requireAuth);

router.route('/')
  .get(requireRole('admin', 'receptionist', 'trainer'), paginationQuery, validate, getMembers)
  .post(requireRole('admin', 'receptionist'), memberCreateValidator, validate, createMember);

router.route('/:id')
  .get(idParam(), validate, getMemberById)
  .put(idParam(), memberUpdateValidator, validate, updateMember)
  .patch(idParam(), memberPatchValidator, validate, patchMember)
  .delete(requireRole('admin'), idParam(), validate, deleteMember);

module.exports = router;

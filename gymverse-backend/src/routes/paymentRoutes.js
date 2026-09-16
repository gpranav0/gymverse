const express = require('express');
const router = express.Router();
const { getPayments, getPaymentById, getMemberPayments, createPayment, patchPayment } = require('../controllers/paymentController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const { idParam, paginationQuery } = require('../validators/commonValidators');
const { paymentCreateValidator, paymentPatchValidator } = require('../validators/resourceValidators');

router.use(requireAuth);

router.route('/')
  .get(requireRole('admin', 'receptionist'), paginationQuery, validate, getPayments)
  .post(requireRole('admin', 'receptionist'), paymentCreateValidator, validate, createPayment);

router.route('/member/:id')
  .get(idParam(), paginationQuery, validate, getMemberPayments);

router.route('/:id')
  .get(idParam(), validate, getPaymentById)
  .patch(requireRole('admin', 'receptionist'), idParam(), paymentPatchValidator, validate, patchPayment);

module.exports = router;

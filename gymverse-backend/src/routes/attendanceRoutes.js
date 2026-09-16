const express = require('express');
const router = express.Router();
const { checkIn, checkOut, getAttendanceHistory, getMemberAttendance } = require('../controllers/attendanceController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const { idParam, paginationQuery } = require('../validators/commonValidators');
const { checkInValidator, checkOutValidator } = require('../validators/resourceValidators');

router.use(requireAuth);

router.route('/')
  .get(requireRole('admin', 'receptionist'), paginationQuery, validate, getAttendanceHistory);

// Check-in and check-out happen at the front desk. Members used to be able to call these
// for themselves from anywhere, which let an attendance record be created without anyone
// being in the building.
router.post('/check-in', requireRole('admin', 'receptionist'), checkInValidator, validate, checkIn);
router.patch('/check-out', requireRole('admin', 'receptionist'), checkOutValidator, validate, checkOut);

router.route('/member/:id')
  .get(idParam(), paginationQuery, validate, getMemberAttendance);

module.exports = router;

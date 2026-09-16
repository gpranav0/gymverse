const express = require('express');
const router = express.Router();
const { createSchedule, getSchedules, updateSchedule, enrollInClass, getMemberEnrollments } = require('../controllers/scheduleController');
const { requireAuth, optionalAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const { idParam, paginationQuery } = require('../validators/commonValidators');
const {
  scheduleCreateValidator, scheduleUpdateValidator, scheduleListQuery, enrollValidator
} = require('../validators/resourceValidators');

router.route('/')
  // The upcoming timetable is public; optionalAuth lets an admin include cancelled sessions.
  .get(optionalAuth, paginationQuery, scheduleListQuery, validate, getSchedules)
  .post(requireAuth, requireRole('admin'), scheduleCreateValidator, validate, createSchedule);

router.patch('/:id', requireAuth, requireRole('admin'), idParam(), scheduleUpdateValidator, validate, updateSchedule);

router.post('/:id/enroll', requireAuth, idParam(), enrollValidator, validate, enrollInClass);

router.get('/member/:id', requireAuth, idParam(), paginationQuery, validate, getMemberEnrollments);

module.exports = router;

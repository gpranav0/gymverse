const express = require('express');
const router = express.Router();
const { getRevenueReport, getMembersReport } = require('../controllers/reportController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const { paginationQuery } = require('../validators/commonValidators');

router.get('/revenue', requireAuth, requireRole('admin'), paginationQuery, validate, getRevenueReport);
router.get('/members', requireAuth, requireRole('admin', 'receptionist'), paginationQuery, validate, getMembersReport);

module.exports = router;

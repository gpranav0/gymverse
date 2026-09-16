const express = require('express');
const router = express.Router();
const { getOverview, getTrainerDashboard, getMemberDashboard, getRevenueDashboard } = require('../controllers/dashboardController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

router.get('/overview', requireAuth, requireRole('admin', 'receptionist'), getOverview);
router.get('/revenue', requireAuth, requireRole('admin'), getRevenueDashboard);
router.get('/trainer', requireAuth, requireRole('trainer'), getTrainerDashboard);
router.get('/member', requireAuth, requireRole('member'), getMemberDashboard);

module.exports = router;

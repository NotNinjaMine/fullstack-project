const express = require('express');
const adminController = require('../controllers/adminController');
const { authenticate } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/rbacMiddleware');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate, requireRole('hr_admin'));
router.post('/holidays/load', asyncHandler(adminController.loadHolidays));

module.exports = router;

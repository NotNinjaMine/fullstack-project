const express = require('express');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorHandler');
const { loginRateLimit } = require('../middleware/securityMiddleware');

const router = express.Router();

router.post('/login', loginRateLimit, asyncHandler(authController.login));
router.get('/me', authenticate, asyncHandler(authController.me));
router.put('/me', authenticate, asyncHandler(authController.updateMe));
router.get('/staff', authenticate, asyncHandler(authController.searchStaff));

module.exports = router;

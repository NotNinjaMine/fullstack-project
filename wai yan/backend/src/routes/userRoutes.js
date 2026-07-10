const express = require('express');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

router.use(authenticate);

// ENH-1: authenticated user updates own profile (phone, address, etc.)
router.put('/profile', asyncHandler(authController.updateMe));

module.exports = router;

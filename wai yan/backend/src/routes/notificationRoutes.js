const express = require('express');
const notificationController = require('../controllers/notificationController');
const { authenticate } = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

router.use(authenticate);

// Static path before :id
router.put('/read-all', asyncHandler(notificationController.markAllRead));
router.get('/', asyncHandler(notificationController.listNotifications));
router.put('/:id/read', asyncHandler(notificationController.markRead));

module.exports = router;

const express = require('express');
const leaveController = require('../controllers/leaveController');
const { authenticate } = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

router.use(authenticate);

// Static paths before :id
router.get('/overlap', asyncHandler(leaveController.checkOverlap));
router.get('/balance', asyncHandler(leaveController.getLeaveBalance));
router.get('/', asyncHandler(leaveController.listLeave));
router.post('/', asyncHandler(leaveController.createLeave));
router.get('/:id', asyncHandler(leaveController.getLeaveById));
router.post('/:id/cancel', asyncHandler(leaveController.cancelLeave));

module.exports = router;

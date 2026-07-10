const express = require('express');
const aiController = require('../controllers/aiController');
const { authenticate } = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

router.use(authenticate);

router.get('/balance-summary', asyncHandler(aiController.balanceSummary));
router.get('/coverage-brief', asyncHandler(aiController.coverageBrief));
router.post('/explain-status', asyncHandler(aiController.explainStatus));
router.post('/draft-note', asyncHandler(aiController.draftNote));
router.post('/parse-leave', asyncHandler(aiController.parseLeave));
router.post('/leave-tips', asyncHandler(aiController.leaveTips));
router.post('/policy-qa', asyncHandler(aiController.policyQa));
router.post('/improve-remarks', asyncHandler(aiController.improveRemarks));

module.exports = router;

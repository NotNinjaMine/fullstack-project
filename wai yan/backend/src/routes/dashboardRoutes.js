const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/rbacMiddleware');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

router.use(authenticate);

router.get('/summary', asyncHandler(dashboardController.summary));
router.get('/balance', asyncHandler(dashboardController.balance));
router.get('/whos-away', asyncHandler(dashboardController.whosAway));
router.get('/holidays', asyncHandler(dashboardController.holidays));
router.get('/company', asyncHandler(dashboardController.company));

// HR edit panel — company + multi-country office addresses
router.put(
  '/company',
  requireRole('hr_admin'),
  asyncHandler(dashboardController.updateCompany)
);
router.put(
  '/company/offices',
  requireRole('hr_admin'),
  asyncHandler(dashboardController.replaceOffices)
);
router.put(
  '/company/offices/:code',
  requireRole('hr_admin'),
  asyncHandler(dashboardController.upsertOffice)
);
router.delete(
  '/company/offices/:code',
  requireRole('hr_admin'),
  asyncHandler(dashboardController.deleteOffice)
);
router.get('/export/my-leave.csv', asyncHandler(dashboardController.exportMyLeave));
router.get(
  '/export/approvals.csv',
  asyncHandler(dashboardController.exportApprovals)
);
router.get(
  '/export/summary.csv',
  asyncHandler(dashboardController.exportSummary)
);
router.get(
  '/export/whos-away.csv',
  asyncHandler(dashboardController.exportWhosAway)
);

module.exports = router;

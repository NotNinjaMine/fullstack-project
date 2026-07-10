const express = require('express');
const approvalController = require('../controllers/approvalController');
const { authenticate } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/rbacMiddleware');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

router.use(authenticate);

// Static paths before :id
router.get(
  '/calendar',
  requireRole('supervisor', 'manager', 'hr_admin', 'employee'),
  asyncHandler(approvalController.calendar)
);
router.get(
  '/history',
  requireRole('supervisor', 'manager', 'hr_admin', 'employee'),
  asyncHandler(approvalController.history)
);
router.post(
  '/bulk',
  requireRole('supervisor', 'manager', 'hr_admin', 'employee'),
  asyncHandler(approvalController.bulk)
);

// UC-15 delegations
router.get(
  '/delegations',
  requireRole('supervisor', 'manager', 'hr_admin', 'employee'),
  asyncHandler(approvalController.listDelegations)
);
router.post(
  '/delegations',
  requireRole('supervisor', 'manager', 'hr_admin'),
  asyncHandler(approvalController.createDelegation)
);
router.delete(
  '/delegations/:id',
  requireRole('supervisor', 'manager', 'hr_admin'),
  asyncHandler(approvalController.revokeDelegation)
);

router.get(
  '/',
  requireRole('supervisor', 'manager', 'hr_admin'),
  asyncHandler(approvalController.listApprovals)
);

router.put(
  '/:id/approve',
  requireRole('supervisor', 'manager', 'hr_admin', 'employee'),
  asyncHandler(approvalController.approve)
);

router.put(
  '/:id/reject',
  requireRole('supervisor', 'manager', 'hr_admin', 'employee'),
  asyncHandler(approvalController.reject)
);

module.exports = router;

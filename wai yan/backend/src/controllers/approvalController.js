const { success } = require('../utils/response');
const approvalService = require('../services/approvalService');
const delegationService = require('../services/delegationService');

async function listApprovals(req, res) {
  const data = await approvalService.listPendingForApprover(req.user);
  return success(res, data);
}

/** UC-08 calendar */
async function calendar(req, res) {
  const data = await approvalService.listCalendar(req.user, req.query);
  return success(res, data);
}

/** UC-08 history */
async function history(req, res) {
  const data = await approvalService.listHistory(req.user, req.query);
  return success(res, data);
}

async function approve(req, res) {
  const data = await approvalService.approve(
    req.user,
    Number(req.params.id),
    req.body?.note ?? null
  );
  return success(res, data);
}

async function reject(req, res) {
  const data = await approvalService.reject(
    req.user,
    Number(req.params.id),
    req.body?.note
  );
  return success(res, data);
}

/** UC-16 bulk */
async function bulk(req, res) {
  const data = await approvalService.bulkAction(req.user, req.body || {});
  return success(res, data);
}

/** UC-15 list */
async function listDelegations(req, res) {
  const data = await delegationService.listMyDelegations(req.user.id);
  return success(res, data);
}

/** UC-15 create */
async function createDelegation(req, res) {
  const data = await delegationService.createDelegation(req.user, req.body || {});
  return success(res, data, 201);
}

/** UC-15 revoke */
async function revokeDelegation(req, res) {
  const data = await delegationService.revokeDelegation(
    req.user,
    Number(req.params.id)
  );
  return success(res, data);
}

module.exports = {
  listApprovals,
  calendar,
  history,
  approve,
  reject,
  bulk,
  listDelegations,
  createDelegation,
  revokeDelegation,
};

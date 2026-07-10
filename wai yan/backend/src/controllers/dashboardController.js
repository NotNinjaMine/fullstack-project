const { success } = require('../utils/response');
const dashboardService = require('../services/dashboardService');

async function summary(req, res) {
  const data = await dashboardService.getSummary(req.user);
  return success(res, data);
}

async function balance(req, res) {
  const year = req.query.year ? Number(req.query.year) : undefined;
  const data = await dashboardService.getMyBalance(req.user, year);
  return success(res, data);
}

async function whosAway(req, res) {
  const data = await dashboardService.getWhosAway(req.user, req.query);
  return success(res, data);
}

async function holidays(req, res) {
  // { holidays, meta } — meta explains cache vs online fetch
  const data = await dashboardService.getPublicHolidays(req.user, req.query);
  return success(res, data);
}

async function company(req, res) {
  const data = await dashboardService.getCompanyInfo(req.user, req.query);
  return success(res, data);
}

/** HR only — company name, HQ, staff count, description, etc. */
async function updateCompany(req, res) {
  const data = await dashboardService.updateCompanyProfile(req.user, req.body);
  return success(res, data);
}

/** HR only — create/update one country office */
async function upsertOffice(req, res) {
  const data = await dashboardService.upsertCompanyOffice(req.user, {
    ...req.body,
    code: req.params.code || req.body?.code,
  });
  return success(res, data);
}

/** HR only — delete office by country code */
async function deleteOffice(req, res) {
  const data = await dashboardService.deleteCompanyOffice(
    req.user,
    req.params.code
  );
  return success(res, data);
}

/** HR only — save full offices list */
async function replaceOffices(req, res) {
  const offices = req.body?.offices || req.body;
  const data = await dashboardService.replaceCompanyOffices(req.user, offices);
  return success(res, data);
}

async function exportMyLeave(req, res) {
  const csv = await dashboardService.exportMyLeaveCsv(req.user, req.query);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="my-leave-history.csv"'
  );
  return res.status(200).send(csv);
}

async function exportApprovals(req, res) {
  const csv = await dashboardService.exportApprovalsCsv(req.user);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="approvals-export.csv"'
  );
  return res.status(200).send(csv);
}

async function exportSummary(req, res) {
  const csv = await dashboardService.exportDashboardSummaryCsv(req.user);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="dashboard-summary.csv"'
  );
  return res.status(200).send(csv);
}

async function exportWhosAway(req, res) {
  const csv = await dashboardService.exportWhosAwayCsv(req.user, req.query);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="whos-away.csv"'
  );
  return res.status(200).send(csv);
}

module.exports = {
  summary,
  balance,
  whosAway,
  holidays,
  company,
  updateCompany,
  upsertOffice,
  deleteOffice,
  replaceOffices,
  exportMyLeave,
  exportApprovals,
  exportSummary,
  exportWhosAway,
};

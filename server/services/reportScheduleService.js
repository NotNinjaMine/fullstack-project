// M5 (UC-30): scheduled report delivery. Uses setInterval (no node-cron, matching
// the M3 reminder pattern). Generates each active report scoped to its owner's role
// visibility and emails it (best-effort) to the recipient list. Retry-once, then
// notify the owner on the second failure.
const { ReportSchedule, User } = require('../models');
const reportService = require('./reportService');
const mailer = require('./mailer');
const { notify } = require('./notificationService');

// Deliver one schedule now. Returns { sent, recipients }.
const deliverSchedule = async (schedule) => {
    const owner = await User.findByPk(schedule.ownerUserId);
    if (!owner) throw new Error("Schedule owner not found.");

    const report = await reportService.runReport(schedule.reportType, {
        id: owner.id, role: owner.role, team: owner.team, country: owner.country
    });
    const csv = reportService.reportToCsv(report);
    const subject = `Scheduled report: ${report.title}`;
    const recipients = Array.isArray(schedule.recipients) ? schedule.recipients : [];

    // Best-effort email to each recipient (offline mode logs to console).
    for (const to of recipients) {
        try {
            await mailer.sendNotificationEmail(to, subject, csv.slice(0, 4000));
        } catch (_) { /* swallow — try the rest */ }
    }
    return { sent: recipients.length, recipients, title: report.title };
};

// Decide if a schedule is due (simple demo cadence relative to lastRunAt).
const isDue = (schedule, now) => {
    if (!schedule.active) return false;
    if (!schedule.lastRunAt) return true;
    const last = new Date(schedule.lastRunAt);
    const ms = now - last;
    const day = 24 * 60 * 60 * 1000;
    if (schedule.frequency === "weekly") return ms >= 7 * day;
    if (schedule.frequency === "monthly") return ms >= 30 * day;
    if (schedule.frequency === "quarterly") return ms >= 90 * day;
    return false;
};

const runDueSchedules = async () => {
    const now = new Date();
    const schedules = await ReportSchedule.findAll({ where: { active: true } });
    let delivered = 0;
    for (const s of schedules) {
        if (!isDue(s, now)) continue;
        try {
            await deliverSchedule(s);
            s.lastRunAt = new Date();
            await s.save();
            delivered++;
        } catch (err) {
            // retry once
            try {
                await deliverSchedule(s);
                s.lastRunAt = new Date();
                await s.save();
                delivered++;
            } catch (err2) {
                await notify(s.ownerUserId,
                    `Scheduled report "${s.reportType}" failed to deliver twice. Please check the schedule.`,
                    { type: "REPORT" });
            }
        }
    }
    return delivered;
};

let _started = false;
const startReportScheduler = () => {
    if (_started) return;
    _started = true;
    // Sweep hourly (like the M3 reminder); demo "run-now" is available on-demand.
    setInterval(() => { runDueSchedules().catch(() => {}); }, 60 * 60 * 1000);
};

module.exports = { deliverSchedule, isDue, runDueSchedules, startReportScheduler };

// M3: in-app + best-effort email notifications, and 24h pending-approval reminders.
// All route code should call notify() here — never create Notification rows directly.
const { Notification, User, LeaveRequest, AuditLog } = require('../models');
const mailer = require('./mailer');

const NOTIFY_SUBJECT = "Leave Management System: update";

const notify = async (userId, message, opts = {}) => {
    const row = await Notification.create({
        userId,
        message,
        type: opts.type ?? null,
        requestId: opts.requestId ?? null
    });

    // Best-effort email: never let mail failure block the in-app notification
    try {
        const user = await User.findByPk(userId, { attributes: ["email"] });
        if (user?.email) {
            await mailer.sendNotificationEmail(user.email, NOTIFY_SUBJECT, message);
        }
    } catch (_) {
        // swallow — mail is optional
    }

    return row;
};

// Pure: is a still-pending request due for a 24h reminder?
const isReminderDue = (request, now) => {
    const pending = request.status === "PENDING_SUPERVISOR" || request.status === "PENDING_MANAGER";
    if (!pending) return false;

    const createdAt = new Date(request.createdAt);
    const ageMs = now - createdAt;
    if (ageMs < 24 * 60 * 60 * 1000) return false;

    if (request.reminderSentAt == null) return true;
    const sinceReminder = now - new Date(request.reminderSentAt);
    return sinceReminder >= 24 * 60 * 60 * 1000;
};

// Find pending requests due for reminder; notify current-tier team approvers.
// Never changes status. Returns the number of requests reminded.
const runPendingReminders = async () => {
    const now = new Date();
    const pending = await LeaveRequest.findAll({
        where: {
            status: ["PENDING_SUPERVISOR", "PENDING_MANAGER"]
        },
        include: [{ model: User, as: "employee", attributes: ["id", "team", "name"] }]
    });

    let count = 0;
    for (const request of pending) {
        try {
            if (!isReminderDue(request, now)) continue;

            const team = request.employee?.team;
            if (!team) continue;

            const roleNeeded = request.status === "PENDING_SUPERVISOR" ? "SUPERVISOR" : "MANAGER";
            const approvers = await User.findAll({
                where: { team, role: roleNeeded }
            });

            for (const a of approvers) {
                await notify(
                    a.id,
                    `Reminder: leave request ${request.id} has been pending for over 24 hours.`,
                    { type: "REMINDER", requestId: request.id }
                );
            }

            await AuditLog.create({
                requestId: request.id,
                actorName: "System",
                action: "24-hour reminder sent"
            });

            request.reminderSentAt = new Date();
            await request.save();
            count++;
        } catch (_) {
            // continue sweep even if one request fails (e.g. mailer throw inside notify is already swallowed)
        }
    }
    return count;
};

let _schedulerStarted = false;

const startReminderScheduler = () => {
    if (_schedulerStarted) return;
    _schedulerStarted = true;

    // Run once ~10s after boot, then hourly
    setTimeout(() => {
        runPendingReminders().catch(() => {});
    }, 10 * 1000);

    setInterval(() => {
        runPendingReminders().catch(() => {});
    }, 60 * 60 * 1000);
};

module.exports = {
    notify,
    isReminderDue,
    runPendingReminders,
    startReminderScheduler
};

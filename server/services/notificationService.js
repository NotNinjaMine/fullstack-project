// M3 notification orchestration: independent in-app/email preferences,
// authorization-derived recipients, safe templates and stage-aware reminders.
// Routes call this service only after committing their business transaction.
const { Op } = require('sequelize');
const { sequelize, Notification, User, LeaveRequest, AuditLog, Delegation } = require('../models');
const mailer = require('./mailer');
const { buildNotificationEmail } = require('./emailTemplates');
const { todayISO } = require('./businessTime');
const chain = require('./approvalChain');
const { isDelegationActive, assignedApproverId } = require('./delegationService');

const routingUserAttributes = () => {
    const attributes = ['id', 'name', 'role', 'team', 'email', 'notifyInApp', 'notifyEmail', 'status'];
    for (const key of ['supervisorId', 'managerId']) {
        if (User.rawAttributes?.[key]) attributes.push(key);
    }
    return attributes;
};

const baseOutcome = (userId) => ({
    userId: Number(userId),
    inApp: { created: false, skipped: true, reason: 'NOT_ATTEMPTED', row: null },
    email: { sent: false, skipped: true, reason: 'NOT_ATTEMPTED' }
});

const logContext = (opts = {}) =>
    `type=${opts.event || opts.type || 'GENERAL'} request=${opts.requestId || 'none'}`;

const deliverToUser = async (user, message, opts = {}, claimedEmails = new Set()) => {
    const outcome = baseOutcome(user?.id);
    if (!user || user.status !== 'ACTIVE') {
        outcome.inApp.reason = 'USER_INACTIVE_OR_MISSING';
        outcome.email.reason = 'USER_INACTIVE_OR_MISSING';
        return outcome;
    }

    if (user.notifyInApp && opts.inApp !== false) {
        try {
            const row = await Notification.create({
                userId: user.id,
                message: String(message || '').slice(0, 255),
                type: opts.type ?? null,
                requestId: opts.requestId ?? null
            });
            outcome.inApp = { created: true, skipped: false, row };
        } catch (_) {
            outcome.inApp = { created: false, skipped: false, reason: 'IN_APP_PERSIST_FAILED', row: null };
            console.error(`[notification] in-app persistence failed user=${user.id} ${logContext(opts)}.`);
        }
    } else {
        outcome.inApp.reason = opts.inApp === false ? 'CHANNEL_SUPPRESSED' : 'PREFERENCE_DISABLED';
    }

    // Email is evaluated independently of in-app persistence. A failed row does
    // not suppress email; a failed email never removes a successful row.
    if (!user.notifyEmail || opts.email === false) {
        outcome.email.reason = opts.email === false ? 'CHANNEL_SUPPRESSED' : 'PREFERENCE_DISABLED';
        return outcome;
    }
    if (!mailer.validEmail(user.email)) {
        outcome.email.reason = 'MISSING_RECIPIENT_EMAIL';
        console.error(`[notification-email] skipped user=${user.id} reason=MISSING_RECIPIENT_EMAIL ${logContext(opts)}.`);
        return outcome;
    }

    const normalized = mailer.normalizedEmail(user.email);
    if (claimedEmails.has(normalized)) {
        outcome.email.reason = 'DUPLICATE_RECIPIENT_EMAIL';
        return outcome;
    }
    claimedEmails.add(normalized);

    const template = buildNotificationEmail(opts, message);
    try {
        const delivery = await mailer.sendNotificationEmail(
            user.email,
            template.subject,
            template.text,
            {
                html: template.html,
                context: {
                    eventType: template.event,
                    userId: user.id,
                    requestId: opts.requestId
                }
            }
        );
        outcome.email = delivery || { sent: false, skipped: false, reason: 'UNKNOWN_DELIVERY_RESULT' };
        if (delivery && delivery.sent === false && !delivery.skipped) {
            console.error(`[notification-email] delivery failed user=${user.id} category=${delivery.category || delivery.reason || 'UNKNOWN'} ${logContext(opts)}.`);
        }
    } catch (_) {
        // Defense in depth for mocks or future providers that violate the shared
        // mailer's never-throw contract.
        outcome.email = { sent: false, skipped: false, reason: 'DELIVERY_THREW' };
        console.error(`[notification-email] delivery threw user=${user.id} ${logContext(opts)}.`);
    }
    return outcome;
};

// Single-recipient compatibility API used across the existing application.
const notify = async (userId, message, opts = {}) => {
    const user = await User.findByPk(userId, {
        attributes: ['id', 'email', 'notifyInApp', 'notifyEmail', 'status']
    });
    if (!user) {
        const outcome = baseOutcome(userId);
        outcome.inApp.reason = 'USER_INACTIVE_OR_MISSING';
        outcome.email.reason = 'USER_INACTIVE_OR_MISSING';
        return outcome;
    }
    return deliverToUser(user, message, opts, new Set());
};

// Batch API for M3 events. User ids are deduplicated first. In-app delivery is
// still per account, while email is additionally deduplicated by normalized
// address so shared/duplicate account addresses receive at most one message.
const notifyMany = async (recipients, message, opts = {}) => {
    const excluded = new Set((opts.excludeUserIds || []).map(Number));
    const ids = [...new Set((recipients || [])
        .map((recipient) => Number(recipient?.id ?? recipient))
        .filter((id) => Number.isInteger(id) && id > 0 && !excluded.has(id)))];
    if (ids.length === 0) return [];

    let users;
    try {
        users = await User.findAll({
            where: { id: { [Op.in]: ids }, status: 'ACTIVE' },
            attributes: ['id', 'email', 'notifyInApp', 'notifyEmail', 'status']
        });
    } catch (_) {
        console.error(`[notification] recipient resolution failed ${logContext(opts)}.`);
        return ids.map((id) => {
            const outcome = baseOutcome(id);
            outcome.inApp.reason = 'RECIPIENT_RESOLUTION_FAILED';
            outcome.email.reason = 'RECIPIENT_RESOLUTION_FAILED';
            return outcome;
        });
    }

    const byId = new Map(users.map((user) => [Number(user.id), user]));
    const claimedEmails = new Set();
    const outcomes = [];
    for (const id of ids) {
        const user = byId.get(id);
        if (!user) {
            const outcome = baseOutcome(id);
            outcome.inApp.reason = 'USER_INACTIVE_OR_MISSING';
            outcome.email.reason = 'USER_INACTIVE_OR_MISSING';
            outcomes.push(outcome);
            continue;
        }
        outcomes.push(await deliverToUser(user, message, opts, claimedEmails));
    }
    return outcomes;
};

// Current-stage recipients include the original approver(s) and any active
// same-tier delegate(s). Authority remains tied to the employee's original
// team; delegation adds an acting approver and never reroutes ownership.
const getResponsibleApprovers = async (request) => {
    const role = chain.approverRoleFor(request.status);
    if (!role) return [];

    const employee = request.employee || await User.findByPk(request.employeeId, {
        attributes: routingUserAttributes()
    });
    if (!employee) return [];

    // Executive leave (a Manager's or the Boss's own) is decided by role
    // COMPANY-WIDE, not inside the applicant's team, and is never delegated -
    // so resolve it directly and skip the team/delegation lookup below.
    // See services/approvalChain.js for the routing table.
    if (chain.isExecutiveRequest({ employee })) {
        const requiredRole = chain.executiveApproverRoleFor({ employee });
        if (requiredRole !== role) return [];
        return User.findAll({
            where: {
                role: requiredRole,
                status: 'ACTIVE',
                id: { [Op.ne]: employee.id }
            },
            attributes: routingUserAttributes()
        });
    }

    if (!employee.team) return [];

    const assignedId = assignedApproverId(request, role);
    const originals = await User.findAll({
        where: assignedId
            ? { id: assignedId, role, status: 'ACTIVE' }
            : { team: employee.team, role, status: 'ACTIVE' },
        attributes: routingUserAttributes()
    });
    if (originals.length === 0) return [];

    const delegations = await Delegation.findAll({
        where: {
            fromUserId: { [Op.in]: originals.map((user) => user.id) },
            active: true
        },
        include: [{
            model: User,
            as: 'toUser',
            attributes: routingUserAttributes()
        }]
    });
    const today = todayISO();
    const delegates = delegations
        .filter((delegation) =>
            delegation.toUser?.status === 'ACTIVE' &&
            delegation.toUser.role === role &&
            isDelegationActive(delegation, today))
        .map((delegation) => delegation.toUser);

    return [...new Map([...originals, ...delegates].map((user) => [Number(user.id), user])).values()];
};

// UC-28 participants: owner, both original tiers and active same-tier delegates
// covering either original tier. HR remains an audit reader, not a comment
// notification participant.
const getCommentParticipants = async (request) => {
    const employee = await User.findByPk(request.employeeId, {
        attributes: routingUserAttributes()
    });
    if (!employee) return [];

    // Executive threads have no team approver: the counterpart role is the
    // whole participant set alongside the applicant.
    if (chain.isExecutiveRequest({ employee })) {
        const counterparts = await User.findAll({
            where: {
                role: chain.executiveApproverRoleFor({ employee }),
                status: 'ACTIVE',
                id: { [Op.ne]: employee.id }
            },
            attributes: routingUserAttributes()
        });
        return [employee, ...counterparts].filter((user) => user?.status === 'ACTIVE');
    }

    if (!employee.team) return [];

    const supervisorId = assignedApproverId(request, 'SUPERVISOR');
    const managerId = assignedApproverId(request, 'MANAGER');
    const explicitIds = [supervisorId, managerId].filter(Boolean);
    const originals = await User.findAll({
        where: explicitIds.length
            ? { id: { [Op.in]: explicitIds }, role: { [Op.in]: ['SUPERVISOR', 'MANAGER'] }, status: 'ACTIVE' }
            : { team: employee.team, role: { [Op.in]: ['SUPERVISOR', 'MANAGER'] }, status: 'ACTIVE' },
        attributes: routingUserAttributes()
    });

    const participants = [employee, ...originals].filter((user) => user?.status === 'ACTIVE');
    if (originals.length > 0) {
        const delegations = await Delegation.findAll({
            where: {
                fromUserId: { [Op.in]: originals.map((user) => user.id) },
                active: true
            },
            include: [{
                model: User,
                as: 'toUser',
                attributes: routingUserAttributes()
            }]
        });
        const today = todayISO();
        for (const delegation of delegations) {
            const original = originals.find((user) => user.id === delegation.fromUserId);
            if (
                original &&
                delegation.toUser?.status === 'ACTIVE' &&
                delegation.toUser.role === original.role &&
                isDelegationActive(delegation, today)
            ) {
                participants.push(delegation.toUser);
            }
        }
    }

    return [...new Map(participants.map((user) => [Number(user.id), user])).values()];
};

const reminderStageStart = (request) => request.stageEnteredAt || request.createdAt;

const normalizedRecipientIds = (ids) => [...new Set((ids || [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))]
    .sort((a, b) => a - b);

const buildReminderKey = (request, recipientIds) => {
    const stageStart = new Date(reminderStageStart(request));
    if (Number.isNaN(stageStart.getTime())) return null;
    return `${request.status}|${stageStart.toISOString()}|${normalizedRecipientIds(recipientIds).join(',')}|24h`;
};

const parseReminderKey = (key) => {
    const value = String(key || '');
    let match = value.match(/^(PENDING_(?:SUPERVISOR|MANAGER|BOSS))\|([^|]+)\|([0-9,]*)\|24h$/);
    if (!match) {
        // Compatibility with the earlier colon-delimited implementation.
        match = value.match(/^(PENDING_(?:SUPERVISOR|MANAGER|BOSS)):(.+Z):([0-9,]*):24h$/);
    }
    if (!match) return null;
    const stageStart = new Date(match[2]);
    if (Number.isNaN(stageStart.getTime())) return null;
    return {
        status: match[1],
        stageStart: stageStart.toISOString(),
        recipientIds: normalizedRecipientIds(match[3] ? match[3].split(',') : [])
    };
};

const sameReminderStage = (left, right) =>
    !!left && !!right && left.status === right.status && left.stageStart === right.stageStart;

// Pure: whether a still-pending request has crossed 24 hours at its current
// stage and has at least one recipient not already claimed for that stage.
const isReminderDue = (request, now, reminderKey = null) => {
    const pending = chain.PENDING_STATUSES.includes(request.status);
    if (!pending) return false;

    const stageStart = new Date(reminderStageStart(request));
    if (Number.isNaN(stageStart.getTime())) return false;
    if (now - stageStart < 24 * 60 * 60 * 1000) return false;

    const existing = parseReminderKey(request.lastReminderKey);
    if (reminderKey) {
        const proposed = parseReminderKey(reminderKey);
        if (!proposed) return false;
        if (!sameReminderStage(existing, proposed)) return true;
        const sent = new Set(existing.recipientIds);
        return proposed.recipientIds.some((id) => !sent.has(id));
    }
    if (existing) {
        const current = {
            status: request.status,
            stageStart: stageStart.toISOString(),
            recipientIds: []
        };
        return !sameReminderStage(existing, current);
    }
    // Compatibility for rows created before stage-scoped reminder keys.
    if (!request.stageEnteredAt && request.reminderSentAt) return false;
    return true;
};

// Find due requests, atomically claim only not-yet-reminded recipients, then
// deliver after the claim transaction commits. The sweep never changes status.
const runPendingReminders = async () => {
    const now = new Date();
    const pending = await LeaveRequest.findAll({
        where: { status: { [Op.in]: chain.PENDING_STATUSES } },
        include: [{ model: User, as: 'employee', attributes: routingUserAttributes() }]
    });

    let count = 0;
    for (const request of pending) {
        try {
            if (!isReminderDue(request, now)) continue;
            const approvers = await getResponsibleApprovers(request);
            const desiredIds = normalizedRecipientIds(approvers.map((approver) => approver.id));
            if (desiredIds.length === 0) continue;
            const proposedKey = buildReminderKey(request, desiredIds);
            if (!proposedKey) continue;

            const claimedIds = await sequelize.transaction(async (transaction) => {
                const current = await LeaveRequest.findByPk(request.id, {
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });
                if (!current || !isReminderDue(current, now, proposedKey)) return [];

                const existing = parseReminderKey(current.lastReminderKey);
                const proposed = parseReminderKey(proposedKey);
                const alreadyClaimed = sameReminderStage(existing, proposed)
                    ? new Set(existing.recipientIds)
                    : new Set();
                const missing = desiredIds.filter((id) => !alreadyClaimed.has(id));
                if (missing.length === 0) return [];

                const merged = normalizedRecipientIds([...alreadyClaimed, ...missing]);
                current.lastReminderKey = buildReminderKey(current, merged);
                current.reminderSentAt = now;
                await current.save({ transaction });
                await AuditLog.create({
                    requestId: current.id,
                    actorName: 'System',
                    action: `24-hour reminder issued for ${current.status}`
                }, { transaction });
                return missing;
            });
            if (claimedIds.length === 0) continue;

            await notifyMany(
                claimedIds,
                `Reminder: leave request REQ-${request.id} has been pending at ${request.status.replace('_', ' ')} for 24 hours.`,
                {
                    type: 'REMINDER',
                    event: 'REMINDER_24H',
                    requestId: request.id,
                    startDate: request.startDate,
                    endDate: request.endDate,
                    stage: chain.stageLabel(request.status)
                }
            );
            count++;
        } catch (_) {
            console.error(`[reminder] sweep failed for request ${request.id}.`);
        }
    }
    return count;
};

let schedulerStarted = false;

const startReminderScheduler = () => {
    if (schedulerStarted) return;
    schedulerStarted = true;
    setTimeout(() => { runPendingReminders().catch(() => {}); }, 10 * 1000);
    setInterval(() => { runPendingReminders().catch(() => {}); }, 60 * 60 * 1000);
};

module.exports = {
    notify,
    notifyMany,
    getResponsibleApprovers,
    getCommentParticipants,
    isReminderDue,
    buildReminderKey,
    parseReminderKey,
    runPendingReminders,
    startReminderScheduler
};

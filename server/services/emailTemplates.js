// Server-owned notification templates. Route-controlled event names select a
// fixed subject/title; frontend input can only appear as escaped, length-limited
// detail values and can never become an arbitrary email template.

const APP_NAME = () => String(
    process.env.SMTP_FROM_NAME || 'Annual Leave Management System'
).replace(/[\r\n\0]+/g, ' ').trim().slice(0, 100) || 'Annual Leave Management System';

const clean = (value, max = 300) => String(value ?? '')
    .replace(/[\r\n\0\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const requestReference = (opts = {}) => {
    const supplied = clean(opts.requestReference, 40);
    if (supplied) return supplied;
    const id = Number(opts.requestId);
    return Number.isInteger(id) && id > 0 ? `REQ-${id}` : '';
};

const safeClientUrl = () => {
    try {
        const url = new URL(process.env.CLIENT_URL || 'http://localhost:5173');
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol');
        url.search = '';
        url.hash = '';
        return url.toString().replace(/\/+$/, '');
    } catch (_) {
        return 'http://localhost:5173';
    }
};

const addRequestDetails = (details, opts, reference) => {
    if (reference) details.push(['Request', reference]);
    if (opts.startDate && opts.endDate) {
        details.push(['Dates', `${clean(opts.startDate, 20)} to ${clean(opts.endDate, 20)}`]);
    }
};

const buildNotificationEmail = (opts = {}, fallbackMessage = '') => {
    const event = clean(opts.event || opts.type || 'GENERAL', 50).toUpperCase();
    const reference = requestReference(opts);
    const employeeName = clean(opts.employeeName, 80) || 'An employee';
    const actorName = clean(opts.actorName, 80) || 'A participant';
    const rejectionReason = clean(opts.rejectionReason, 300);
    const role = clean(opts.delegationRole || opts.role, 30);
    const team = clean(opts.team, 80);
    const details = [];
    let subject = 'Leave request update';
    let title = 'Leave request update';
    let summary = clean(fallbackMessage, 600) || 'There is an update in the leave system.';
    let action = 'Sign in to the leave system to view the latest details.';

    switch (event) {
    case 'LEAVE_REQUEST_SUBMITTED':
        subject = 'New leave request awaiting review';
        title = 'New leave request awaiting review';
        summary = `${employeeName} submitted a leave request that is awaiting Supervisor review.`;
        addRequestDetails(details, opts, reference);
        details.push(['Stage', 'Supervisor review']);
        action = 'Sign in to the leave system to review the request.';
        break;
    case 'SUPERVISOR_APPROVED':
        subject = 'Leave request moved to Manager review';
        title = 'Supervisor review completed';
        summary = 'The Supervisor endorsed this request and it is now awaiting Manager review.';
        addRequestDetails(details, opts, reference);
        details.push(['Stage', 'Manager review']);
        break;
    case 'MANAGER_REVIEW_REQUIRED':
        subject = 'Leave request awaiting final review';
        title = 'Manager review required';
        summary = `${employeeName}'s leave request completed Supervisor review and needs a final Manager decision.`;
        addRequestDetails(details, opts, reference);
        details.push(['Stage', 'Manager review']);
        action = 'Sign in to the leave system to review the request.';
        break;
    case 'SUPERVISOR_REJECTED':
        subject = 'Leave request decision';
        title = 'Leave request rejected by Supervisor';
        summary = 'Your leave request was not approved at Supervisor review.';
        addRequestDetails(details, opts, reference);
        if (rejectionReason) details.push(['Reason', rejectionReason]);
        break;
    case 'MANAGER_APPROVED':
        subject = 'Leave request approved';
        title = 'Leave request approved';
        summary = 'Your leave request received final Manager approval.';
        addRequestDetails(details, opts, reference);
        break;
    case 'MANAGER_REJECTED':
        subject = 'Leave request decision';
        title = 'Leave request rejected by Manager';
        summary = 'Your leave request was not approved at Manager review.';
        addRequestDetails(details, opts, reference);
        if (rejectionReason) details.push(['Reason', rejectionReason]);
        break;
    case 'COMMENT_ADDED':
        subject = reference ? `New comment on leave request ${reference}` : 'New leave request comment';
        title = 'New comment';
        summary = `${actorName} posted a new comment${reference ? ` on leave request ${reference}` : ''}.`;
        addRequestDetails(details, opts, reference);
        action = 'Sign in to the leave system to read the comment and reply.';
        break;
    case 'DELEGATION_CREATED':
        subject = 'Approval delegation created';
        title = 'Approval delegation created';
        summary = 'A temporary approval delegation has been created.';
        if (role) details.push(['Approval tier', role]);
        if (opts.startDate && opts.endDate) {
            details.push(['Effective dates', `${clean(opts.startDate, 20)} to ${clean(opts.endDate, 20)}`]);
        }
        if (team) details.push(['Acting-for team', team]);
        action = 'Sign in to the leave system to view the delegation.';
        break;
    case 'DELEGATION_REVOKED':
        subject = 'Approval delegation revoked';
        title = 'Approval delegation revoked';
        summary = 'The temporary approval delegation has ended early.';
        if (role) details.push(['Approval tier', role]);
        if (team) details.push(['Acting-for team', team]);
        action = 'Sign in to the leave system to view the updated delegation.';
        break;
    case 'DELEGATION_EXPIRED':
        subject = 'Approval delegation expired';
        title = 'Approval delegation expired';
        summary = 'The temporary approval delegation reached its scheduled end date.';
        if (role) details.push(['Approval tier', role]);
        if (team) details.push(['Acting-for team', team]);
        action = 'Sign in to the leave system to view the updated delegation.';
        break;
    case 'REQUEST_CANCELLED':
        subject = 'Leave request cancelled';
        title = 'Leave request cancelled';
        summary = `${employeeName} cancelled a pending leave request. No approval action is required.`;
        addRequestDetails(details, opts, reference);
        break;
    case 'REMINDER_24H':
        subject = 'Reminder: leave request awaiting review';
        title = '24-hour approval reminder';
        summary = 'A leave request has been waiting at its current approval stage for at least 24 hours.';
        addRequestDetails(details, opts, reference);
        if (opts.stage) details.push(['Stage', clean(opts.stage, 40)]);
        action = 'Sign in to the leave system to review the pending request.';
        break;
    case 'FORFEITURE_RISK': {
        const tierWord = opts.tier === 'critical' ? 'Urgent' : opts.tier === 'warning' ? 'Important' : 'Heads up';
        subject = `${tierWord}: annual leave at risk of forfeiture`;
        title = 'You may lose unused annual leave';
        summary = clean(fallbackMessage, 600) || 'You have unused annual leave at risk of being forfeited at year-end.';
        if (opts.atRisk != null) details.push(['Days at risk of forfeiture', String(clean(opts.atRisk, 10))]);
        if (opts.available != null) details.push(['Days available now', String(clean(opts.available, 10))]);
        if (opts.carryForwardMax != null) details.push(['Carries forward into next year', `${clean(opts.carryForwardMax, 10)}d max`]);
        action = 'Sign in to the leave system to plan time off before the days are lost.';
        break;
    }
    default:
        if (reference) addRequestDetails(details, opts, reference);
        break;
    }

    const appName = APP_NAME();
    const url = safeClientUrl();
    const detailText = details.map(([label, value]) => `${label}: ${value}`).join('\n');
    const text = [
        appName,
        title,
        '',
        summary,
        detailText ? `\n${detailText}` : '',
        '',
        `${action} ${url}`,
        '',
        'This email was generated automatically. Please do not reply.'
    ].filter((line, index, all) => line !== '' || all[index - 1] !== '').join('\n');

    const detailHtml = details.length
        ? `<dl style="margin:16px 0">${details.map(([label, value]) =>
            `<dt style="font-weight:600;margin-top:8px">${escapeHtml(label)}</dt>` +
            `<dd style="margin:2px 0 0">${escapeHtml(value)}</dd>`
        ).join('')}</dl>`
        : '';
    const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.5">` +
        `<main style="max-width:640px;margin:0 auto;padding:24px">` +
        `<p style="color:#64748b;margin:0 0 8px">${escapeHtml(appName)}</p>` +
        `<h1 style="font-size:22px;margin:0 0 16px">${escapeHtml(title)}</h1>` +
        `<p>${escapeHtml(summary)}</p>${detailHtml}` +
        `<p>${escapeHtml(action)} ` +
        `<a href="${escapeHtml(url)}">Open the leave system</a>.</p>` +
        `<hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0">` +
        `<p style="font-size:12px;color:#64748b">This email was generated automatically. Please do not reply.</p>` +
        `</main></body></html>`;

    return { event, subject, text, html };
};

module.exports = { buildNotificationEmail, escapeHtml, clean, requestReference, safeClientUrl };

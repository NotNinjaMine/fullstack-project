/**
 * UC-02 Two-tier approval + cancel approval path.
 * UC-08 calendar/history · UC-16 bulk · AI-3 summary · UC-15 acting approver.
 */

const db = require('../config/db');
const { appError } = require('../middleware/errorHandler');
const policyEngine = require('./policyEngine');
const overlapService = require('./overlapService');
const auditService = require('./auditService');
const notificationService = require('./notificationService');
const {
  buildApprovalSummary,
  buildRuleBasedSummary,
} = require('./aiSummaryService');
const { getActingForUserIds } = require('./delegationService');
const { toDateOnly, yearFromDate } = require('../utils/dates');
const { APPLICANT_SELECT, applicantFromRow } = require('../utils/userProfile');

function mapAwaitingRole(row) {
  if (
    row.status === 'pending' ||
    (row.status === 'cancel_pending' && row.supervisor_status === 'pending')
  ) {
    return 'supervisor';
  }
  if (
    row.status === 'supervisor_approved' ||
    (row.status === 'cancel_pending' && row.supervisor_status === 'approved')
  ) {
    return 'manager';
  }
  return null;
}

/**
 * @param {'off'|'rules'|'llm'} aiMode
 *  - rules (default for lists): fast local AI-3 card, no external API
 *  - llm: OpenRouter when configured (slower; use for detail)
 *  - off: no ai_summary
 */
async function mapApprovalDto(row, teamCount, { aiMode = 'rules' } = {}) {
  const applicant = applicantFromRow(row);
  const dto = {
    id: row.id,
    applicant,
    leave_type: row.leave_type,
    start_date: toDateOnly(row.start_date),
    end_date: toDateOnly(row.end_date),
    half_day_flag: Boolean(row.half_day_flag),
    half_day_period: row.half_day_period,
    days_count: Number(row.days_count),
    overlap_flag: Boolean(row.overlap_flag),
    special_approval_flag: Boolean(row.special_approval_flag),
    remarks: row.remarks || null,
    status: row.status,
    supervisor_status: row.supervisor_status,
    manager_status: row.manager_status,
    awaiting_role: mapAwaitingRole(row),
    team_on_leave_count: teamCount,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (aiMode === 'rules') {
    dto.ai_summary = buildRuleBasedSummary(dto, { teamOnLeaveCount: teamCount });
  } else if (aiMode === 'llm') {
    dto.ai_summary = await buildApprovalSummary(dto, {
      teamOnLeaveCount: teamCount,
    });
  }
  return dto;
}

/**
 * UC-02 queue — role-scoped + UC-15 acting approver visibility.
 */
async function listPendingForApprover(user) {
  const actingIds = await getActingForUserIds(user.id);
  const params = [];
  const clauses = [];

  if (user.role === 'hr_admin') {
    clauses.push(`lr.status IN ('pending', 'supervisor_approved', 'cancel_pending')`);
  } else {
    // Placeholders for IN list
    const placeholders = actingIds.map((_, i) => `$${i + 1}`).join(',');
    actingIds.forEach((id) => params.push(id));
    clauses.push(
      `(
        (
          lr.supervisor_id IN (${placeholders})
          AND (
            (lr.status = 'pending' AND lr.supervisor_status = 'pending')
            OR (lr.status = 'cancel_pending' AND lr.supervisor_status = 'pending')
          )
        )
        OR
        (
          lr.manager_id IN (${placeholders})
          AND (
            (lr.status = 'supervisor_approved' AND lr.manager_status = 'pending')
            OR (lr.status = 'cancel_pending' AND lr.supervisor_status = 'approved' AND lr.manager_status = 'pending')
          )
        )
      )`
    );
    // Pure employees with no active delegation → empty queue (not an error)
    if (
      !['supervisor', 'manager', 'hr_admin'].includes(user.role) &&
      actingIds.length === 1 &&
      actingIds[0] === user.id
    ) {
      return [];
    }
  }

  const result = await db.query(
    `SELECT lr.*,
            ${APPLICANT_SELECT}
     FROM leave_requests lr
     JOIN users u ON u.id = lr.user_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY lr.created_at ASC`,
    params
  );

  // Parallelize team counts (avoid N+1 serial awaits)
  const enriched = await Promise.all(
    result.rows.map(async (row) => {
      const teamCount = await overlapService.countTeamOnLeave(
        row.applicant_department,
        row.start_date,
        row.end_date
      );
      // rules mode: no per-item LLM (performance + cost)
      return mapApprovalDto(row, teamCount, { aiMode: 'rules' });
    })
  );
  return Promise.all(enriched);
}

/**
 * UC-08: Role-based calendar feed for approver perspective.
 * Query: start_date, end_date (required).
 */
async function listCalendar(user, { start_date, end_date }) {
  if (!start_date || !end_date) {
    throw appError('MISSING_DATE_PARAMS', 'start_date and end_date query params are required');
  }
  const actingIds = await getActingForUserIds(user.id);
  const params = [start_date, end_date];
  let scope = '';

  if (user.role === 'hr_admin') {
    scope = 'TRUE';
  } else if (
    ['supervisor', 'manager'].includes(user.role) ||
    actingIds.length > 1
  ) {
    const ph = actingIds.map((_, i) => `$${i + 3}`).join(',');
    actingIds.forEach((id) => params.push(id));
    scope = `(lr.supervisor_id IN (${ph}) OR lr.manager_id IN (${ph}) OR u.supervisor_id IN (${ph}) OR u.manager_id IN (${ph}))`;
  } else {
    return [];
  }

  const result = await db.query(
    `SELECT lr.id, lr.leave_type, lr.start_date, lr.end_date, lr.status,
            lr.days_count, lr.half_day_flag, lr.overlap_flag,
            ${APPLICANT_SELECT}
     FROM leave_requests lr
     JOIN users u ON u.id = lr.user_id
     WHERE lr.status NOT IN ('rejected', 'cancelled')
       AND lr.start_date <= $2
       AND lr.end_date >= $1
       AND ${scope}
     ORDER BY lr.start_date ASC`,
    params
  );

  return result.rows.map((row) => ({
    id: row.id,
    leave_type: row.leave_type,
    start_date: toDateOnly(row.start_date),
    end_date: toDateOnly(row.end_date),
    status: row.status,
    days_count: Number(row.days_count),
    half_day_flag: Boolean(row.half_day_flag),
    overlap_flag: Boolean(row.overlap_flag),
    applicant: applicantFromRow(row),
  }));
}

/**
 * UC-08: Approver history (already actioned / team leave history).
 */
async function listHistory(user, { status, year } = {}) {
  const actingIds = await getActingForUserIds(user.id);
  const params = [];
  let scope = '';

  if (user.role === 'hr_admin') {
    scope = 'TRUE';
  } else if (
    ['supervisor', 'manager'].includes(user.role) ||
    actingIds.length > 1
  ) {
    const ph = actingIds.map((_, i) => `$${i + 1}`).join(',');
    actingIds.forEach((id) => params.push(id));
    scope = `(lr.supervisor_id IN (${ph}) OR lr.manager_id IN (${ph}))`;
  } else {
    return [];
  }

  const clauses = [scope, `lr.status IN ('approved', 'rejected', 'cancelled', 'supervisor_approved')`];
  if (status) {
    params.push(status);
    clauses.push(`lr.status = $${params.length}`);
  }
  if (year) {
    params.push(Number(year));
    clauses.push(`EXTRACT(YEAR FROM lr.start_date) = $${params.length}`);
  }

  const result = await db.query(
    `SELECT lr.*,
            ${APPLICANT_SELECT}
     FROM leave_requests lr
     JOIN users u ON u.id = lr.user_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY lr.updated_at DESC
     LIMIT 200`,
    params
  );

  return Promise.all(
    result.rows.map((row) => mapApprovalDto(row, 0, { aiMode: 'off' }))
  );
}

/**
 * UC-16: bulk approve or reject with a shared comment.
 */
async function bulkAction(user, { action, ids, note }) {
  if (!action || !['approve', 'reject'].includes(action)) {
    throw appError('VALIDATION_ERROR', 'action must be approve or reject');
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    throw appError('VALIDATION_ERROR', 'ids must be a non-empty array');
  }
  if (ids.length > 50) {
    throw appError('VALIDATION_ERROR', 'Bulk limit is 50 requests');
  }
  if (action === 'reject' && (!note || !String(note).trim())) {
    throw appError('VALIDATION_ERROR', 'Rejection note is required for bulk reject');
  }

  const results = [];
  for (const rawId of ids) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const data =
        action === 'approve'
          ? await approve(user, rawId, note || null)
          : await reject(user, rawId, note);
      results.push({ id: Number(rawId), success: true, data });
    } catch (err) {
      results.push({
        id: Number(rawId),
        success: false,
        code: err.code || 'INTERNAL_ERROR',
        message: err.message,
      });
    }
  }

  return {
    action,
    total: ids.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}

async function assertCanActAsSupervisor(user, leave) {
  const actingIds = await getActingForUserIds(user.id);
  if (!actingIds.includes(leave.supervisor_id)) {
    throw appError('FORBIDDEN', 'Not the assigned supervisor (or acting delegate)');
  }
}

async function assertCanActAsManager(user, leave) {
  const actingIds = await getActingForUserIds(user.id);
  if (!actingIds.includes(leave.manager_id)) {
    throw appError('FORBIDDEN', 'Not the assigned manager (or acting delegate)');
  }
}

async function approve(user, id, note = null) {
  const leaveId = Number(id);
  if (!Number.isFinite(leaveId) || leaveId <= 0) {
    throw appError('NOT_FOUND', 'Leave request not found');
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `SELECT * FROM leave_requests WHERE id = $1 FOR UPDATE`,
      [leaveId]
    );
    if (result.rows.length === 0) {
      throw appError('NOT_FOUND', 'Leave request not found');
    }

    const leave = result.rows[0];
    const before = { ...leave };
    let responseData;

    // Decide which step based on leave state (supports UC-15 acting approver)
    const needsSupervisor =
      leave.status === 'pending' ||
      (leave.status === 'cancel_pending' && leave.supervisor_status === 'pending');
    const needsManager =
      leave.status === 'supervisor_approved' ||
      (leave.status === 'cancel_pending' &&
        leave.supervisor_status === 'approved' &&
        leave.manager_status === 'pending');

    if (leave.status === 'cancel_pending') {
      if (needsSupervisor) {
        await assertCanActAsSupervisor(user, leave);
      } else if (needsManager) {
        await assertCanActAsManager(user, leave);
      }
      // Pass role hint via temporary flag for cancel path
      const actingUser = {
        ...user,
        role: needsSupervisor ? 'supervisor' : 'manager',
      };
      responseData = await approveCancellation(client, actingUser, leave, before, note);
      await client.query('COMMIT');
      return responseData;
    }

    if (needsSupervisor) {
      await assertCanActAsSupervisor(user, leave);
      responseData = await approveAsSupervisor(client, user, leave, before, note);
    } else if (needsManager) {
      await assertCanActAsManager(user, leave);
      responseData = await approveAsManager(client, user, leave, before, note);
    } else {
      throw appError('ALREADY_ACTIONED', 'This request is not awaiting approval');
    }

    await client.query('COMMIT');
    return responseData;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function approveCancellation(client, user, leave, before, note) {
  const id = leave.id;

  if (user.role === 'supervisor') {
    if (leave.supervisor_status !== 'pending') {
      throw appError('ALREADY_ACTIONED', 'Supervisor already actioned this cancellation');
    }

    const upd = await client.query(
      `UPDATE leave_requests
       SET supervisor_status = 'approved',
           supervisor_note = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, note]
    );
    const updated = upd.rows[0];

    await auditService.writeAudit(
      {
        action: 'leave_cancel_supervisor_approved',
        actorUserId: user.id,
        entityType: 'leave_request',
        entityId: id,
        beforeState: before,
        afterState: updated,
      },
      client
    );
    await notificationService.notifyCancelPending(updated, [updated.manager_id], client);

    return {
      id: updated.id,
      supervisor_status: updated.supervisor_status,
      manager_status: updated.manager_status,
      status: updated.status,
    };
  }

  // Manager final cancel approval
  if (leave.supervisor_status !== 'approved') {
    throw appError('FORBIDDEN', 'Supervisor must approve cancellation first');
  }
  if (leave.manager_status !== 'pending') {
    throw appError('ALREADY_ACTIONED', 'Manager already actioned this cancellation');
  }

  const year = yearFromDate(leave.start_date);
  // Restore only if balance was deducted (fully approved leave)
  if (leave.prior_status === 'approved') {
    await policyEngine.restoreBalance(
      leave.user_id,
      leave.leave_type,
      Number(leave.days_count),
      year,
      client
    );
  }

  const upd = await client.query(
    `UPDATE leave_requests
     SET manager_status = 'approved',
         manager_note = $2,
         status = 'cancelled',
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, note]
  );
  const updated = upd.rows[0];

  await auditService.writeAudit(
    {
      action: 'leave_request_cancelled',
      actorUserId: user.id,
      entityType: 'leave_request',
      entityId: id,
      beforeState: before,
      afterState: updated,
    },
    client
  );
  await notificationService.notify(
    {
      userId: updated.user_id,
      type: 'cancelled',
      message: `Your cancellation for ${updated.leave_type} leave has been approved.`,
      leaveRequestId: updated.id,
      emailSubject: 'Leave cancellation approved',
      emailBody: 'Your leave cancellation has been approved. Sign in for details.',
    },
    client
  );

  return {
    id: updated.id,
    manager_status: updated.manager_status,
    status: updated.status,
  };
}

async function approveAsSupervisor(client, user, leave, before, note) {
  if (leave.status !== 'pending' || leave.supervisor_status !== 'pending') {
    throw appError('ALREADY_ACTIONED', 'This request is not awaiting supervisor approval');
  }

  const upd = await client.query(
    `UPDATE leave_requests
     SET supervisor_status = 'approved',
         supervisor_note = $2,
         status = 'supervisor_approved',
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [leave.id, note]
  );
  const updated = upd.rows[0];

  await auditService.writeAudit(
    {
      action: 'leave_request_supervisor_approved',
      actorUserId: user.id,
      entityType: 'leave_request',
      entityId: leave.id,
      beforeState: before,
      afterState: updated,
    },
    client
  );
  await notificationService.notifySupervisorDecision(updated, updated.manager_id, true, client);

  return {
    id: updated.id,
    supervisor_status: updated.supervisor_status,
    manager_status: updated.manager_status,
    status: updated.status,
  };
}

async function approveAsManager(client, user, leave, before, note) {
  if (leave.status !== 'supervisor_approved' || leave.manager_status !== 'pending') {
    throw appError('ALREADY_ACTIONED', 'This request is not awaiting manager approval');
  }
  if (leave.supervisor_status !== 'approved') {
    throw appError('FORBIDDEN', 'Supervisor cannot be bypassed');
  }

  const year = yearFromDate(leave.start_date);
  await policyEngine.deductBalance(
    leave.user_id,
    leave.leave_type,
    Number(leave.days_count),
    year,
    client
  );

  const upd = await client.query(
    `UPDATE leave_requests
     SET manager_status = 'approved',
         manager_note = $2,
         status = 'approved',
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [leave.id, note]
  );
  const updated = upd.rows[0];

  await auditService.writeAudit(
    {
      action: 'leave_request_manager_approved',
      actorUserId: user.id,
      entityType: 'leave_request',
      entityId: leave.id,
      beforeState: before,
      afterState: updated,
    },
    client
  );
  await notificationService.notifyFinalDecision(updated, updated.user_id, true, client);

  return {
    id: updated.id,
    manager_status: updated.manager_status,
    status: updated.status,
    balance_deducted: Number(updated.days_count),
  };
}

async function reject(user, id, note) {
  if (!note || !String(note).trim()) {
    throw appError('VALIDATION_ERROR', 'Rejection reason is required.');
  }
  note = String(note).trim();

  const leaveId = Number(id);
  if (!Number.isFinite(leaveId) || leaveId <= 0) {
    throw appError('NOT_FOUND', 'Leave request not found');
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `SELECT * FROM leave_requests WHERE id = $1 FOR UPDATE`,
      [leaveId]
    );
    if (result.rows.length === 0) {
      throw appError('NOT_FOUND', 'Leave request not found');
    }

    const leave = result.rows[0];
    const before = { ...leave };
    let updated;

    const needsSupervisor =
      leave.status === 'pending' ||
      (leave.status === 'cancel_pending' && leave.supervisor_status === 'pending');
    const needsManager =
      leave.status === 'supervisor_approved' ||
      (leave.status === 'cancel_pending' &&
        leave.supervisor_status === 'approved' &&
        leave.manager_status === 'pending');

    if (leave.status === 'cancel_pending') {
      if (needsSupervisor) await assertCanActAsSupervisor(user, leave);
      else if (needsManager) await assertCanActAsManager(user, leave);
      const actingUser = {
        ...user,
        role: needsSupervisor ? 'supervisor' : 'manager',
      };
      updated = await rejectCancellation(client, actingUser, leave, before, note);
      await client.query('COMMIT');
      return { id: updated.id, status: updated.status };
    }

    if (needsSupervisor) {
      await assertCanActAsSupervisor(user, leave);
      if (leave.status !== 'pending' || leave.supervisor_status !== 'pending') {
        throw appError('ALREADY_ACTIONED', 'This request is not awaiting supervisor action');
      }

      const upd = await client.query(
        `UPDATE leave_requests
         SET supervisor_status = 'rejected',
             supervisor_note = $2,
             status = 'rejected',
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [leaveId, note]
      );
      updated = upd.rows[0];

      await auditService.writeAudit(
        {
          action: 'leave_request_rejected',
          actorUserId: user.id,
          entityType: 'leave_request',
          entityId: leaveId,
          beforeState: before,
          afterState: updated,
        },
        client
      );
      await notificationService.notifySupervisorDecision(
        updated,
        updated.manager_id,
        false,
        client
      );
      await notificationService.notifyFinalDecision(updated, updated.user_id, false, client);
    } else if (needsManager) {
      await assertCanActAsManager(user, leave);
      if (leave.status !== 'supervisor_approved' || leave.manager_status !== 'pending') {
        throw appError('ALREADY_ACTIONED', 'This request is not awaiting manager action');
      }

      const upd = await client.query(
        `UPDATE leave_requests
         SET manager_status = 'rejected',
             manager_note = $2,
             status = 'rejected',
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [leaveId, note]
      );
      updated = upd.rows[0];

      await auditService.writeAudit(
        {
          action: 'leave_request_rejected',
          actorUserId: user.id,
          entityType: 'leave_request',
          entityId: leaveId,
          beforeState: before,
          afterState: updated,
        },
        client
      );
      await notificationService.notifyFinalDecision(updated, updated.user_id, false, client);
    } else {
      throw appError('ALREADY_ACTIONED', 'This request is not awaiting rejection');
    }

    await client.query('COMMIT');
    return { id: updated.id, status: updated.status };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function rejectCancellation(client, user, leave, before, note) {
  const id = leave.id;

  if (user.role === 'supervisor') {
    if (leave.supervisor_status !== 'pending') {
      throw appError('ALREADY_ACTIONED', 'Not awaiting supervisor cancel decision');
    }
  } else {
    if (leave.manager_status !== 'pending') {
      throw appError('ALREADY_ACTIONED', 'Not awaiting manager cancel decision');
    }
    if (leave.supervisor_status !== 'approved') {
      throw appError('FORBIDDEN', 'Supervisor must act first');
    }
  }

  const restoreStatus = leave.prior_status || 'approved';
  const noteCol = user.role === 'supervisor' ? 'supervisor_note' : 'manager_note';

  // Parameterized values only — column name chosen from fixed whitelist above
  const upd = await client.query(
    `UPDATE leave_requests
     SET status = $2,
         supervisor_status = CASE
           WHEN $2 = 'approved' THEN 'approved'
           WHEN $2 = 'supervisor_approved' THEN 'approved'
           ELSE supervisor_status END,
         manager_status = CASE WHEN $2 = 'approved' THEN 'approved' ELSE 'pending' END,
         ${noteCol} = $3,
         prior_status = NULL,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, restoreStatus, note]
  );
  const updated = upd.rows[0];

  await auditService.writeAudit(
    {
      action: 'leave_cancel_rejected',
      actorUserId: user.id,
      entityType: 'leave_request',
      entityId: id,
      beforeState: before,
      afterState: updated,
    },
    client
  );
  await notificationService.notify(
    {
      userId: updated.user_id,
      type: 'cancel_rejected',
      message: 'Your leave cancellation request was rejected.',
      leaveRequestId: updated.id,
      emailSubject: 'Leave cancellation rejected',
      emailBody: 'Your leave cancellation was rejected. Sign in for details.',
    },
    client
  );

  return updated;
}

module.exports = {
  listPendingForApprover,
  listCalendar,
  listHistory,
  bulkAction,
  approve,
  reject,
};

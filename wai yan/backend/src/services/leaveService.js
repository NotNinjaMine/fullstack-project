/**
 * Leave request business logic (UC-01, UC-03).
 * Controllers stay thin — all multi-step DB work lives here.
 */

const db = require('../config/db');
const { appError } = require('../middleware/errorHandler');
const policyEngine = require('./policyEngine');
const overlapService = require('./overlapService');
const auditService = require('./auditService');
const notificationService = require('./notificationService');
const { toDateOnly, yearFromDate } = require('../utils/dates');
const { APPLICANT_SELECT, applicantFromRow } = require('../utils/userProfile');

const LEAVE_TYPES = new Set(['annual', 'sick', 'unpaid', 'other']);

function mapLeaveRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    leave_type: row.leave_type,
    start_date: toDateOnly(row.start_date),
    end_date: toDateOnly(row.end_date),
    half_day_flag: row.half_day_flag,
    half_day_period: row.half_day_period,
    status: row.status,
    supervisor_status: row.supervisor_status,
    manager_status: row.manager_status,
    special_approval_flag: row.special_approval_flag,
    overlap_flag: row.overlap_flag,
    days_count: Number(row.days_count),
    created_at: row.created_at,
    updated_at: row.updated_at,
    remarks: row.remarks,
    supervisor_note: row.supervisor_note,
    manager_note: row.manager_note,
    supervisor_id: row.supervisor_id,
    manager_id: row.manager_id,
    user_id: row.user_id,
  };
}

function applyApplicantOverrides(applicant, leave) {
  return {
    ...applicant,
    name: leave.applicant_name_override || applicant.name,
    department: leave.applicant_department_override || applicant.department,
  };
}

function canViewLeave(user, leave) {
  if (user.role === 'hr_admin' || user.role === 'hod' || user.role === 'manager') {
    return true;
  }
  if (leave.user_id === user.id) return true;
  if (user.role === 'supervisor' && leave.supervisor_id === user.id) return true;
  return false;
}

async function listForUser(user, { status, year, leave_type } = {}) {
  const params = [user.id];
  const clauses = ['user_id = $1'];

  if (status) {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  }
  if (leave_type) {
    params.push(leave_type);
    clauses.push(`leave_type = $${params.length}`);
  }
  if (year) {
    params.push(Number(year));
    clauses.push(`EXTRACT(YEAR FROM start_date) = $${params.length}`);
  }

  const result = await db.query(
    `SELECT * FROM leave_requests
     WHERE ${clauses.join(' AND ')}
     ORDER BY created_at DESC`,
    params
  );

  return result.rows.map(mapLeaveRow);
}

async function getById(user, id) {
  const leaveId = Number(id);
  if (!Number.isFinite(leaveId) || leaveId <= 0) {
    throw appError('NOT_FOUND', 'Leave request not found');
  }

  const result = await db.query(
    `SELECT lr.*,
            ${APPLICANT_SELECT}
     FROM leave_requests lr
     JOIN users u ON u.id = lr.user_id
     WHERE lr.id = $1`,
    [leaveId]
  );

  if (result.rows.length === 0) {
    throw appError('NOT_FOUND', 'Leave request not found');
  }

  const row = result.rows[0];
  if (!canViewLeave(user, row)) {
    throw appError('FORBIDDEN', 'You cannot view this leave request');
  }

  const mapped = mapLeaveRow(row);
  mapped.applicant = applyApplicantOverrides(applicantFromRow(row), row);
  return mapped;
}

/**
 * UC-01: Employee applies for leave.
 * Balance is checked but NOT deducted until final manager approval.
 *
 * TODO AI-1: Member 4 natural-language parser can map free text → structured body
 * before this function is called. Accept the same structured payload only.
 */
async function createLeave(user, body) {
  const {
    leave_type,
    start_date,
    end_date,
    half_day_flag = false,
    half_day_period = null,
    remarks = null,
    applicant_name_override = null,
    applicant_department_override = null,
  } = body || {};

  if (!leave_type || !LEAVE_TYPES.has(leave_type)) {
    throw appError('VALIDATION_ERROR', 'Valid leave_type is required');
  }
  if (!start_date || !end_date) {
    throw appError('VALIDATION_ERROR', 'start_date and end_date are required');
  }
  if (half_day_flag && start_date !== end_date) {
    throw appError('INVALID_DATE_RANGE', 'Half-day requests must be a single calendar day');
  }
  if (half_day_flag && half_day_period && !['AM', 'PM'].includes(half_day_period)) {
    throw appError('VALIDATION_ERROR', 'half_day_period must be AM or PM');
  }
  if (end_date < start_date) {
    throw appError('INVALID_DATE_RANGE', 'end_date must be on or after start_date');
  }
  if (applicant_name_override !== null && String(applicant_name_override).trim().length > 255) {
    throw appError('VALIDATION_ERROR', 'Applicant name override is too long');
  }
  if (applicant_department_override !== null && String(applicant_department_override).trim().length > 100) {
    throw appError('VALIDATION_ERROR', 'Applicant department override is too long');
  }
  if (!user.supervisor_id || !user.manager_id) {
    throw appError(
      'VALIDATION_ERROR',
      'Your profile is missing supervisor or manager assignment'
    );
  }

  const daysCount = await policyEngine.calcDaysCount(
    start_date,
    end_date,
    Boolean(half_day_flag),
    user.country_code
  );

  if (daysCount <= 0) {
    throw appError(
      'INVALID_DATE_RANGE',
      'Selected range has no working days (weekends/holidays only)'
    );
  }

  const year = yearFromDate(start_date);
  await policyEngine.checkSufficientBalance(user.id, leave_type, daysCount, year);

  const overlapping = await overlapService.findOverlappingLeave({
    userId: user.id,
    department: user.department,
    startDate: start_date,
    endDate: end_date,
  });
  const hasOverlap = overlapping.length > 0;
  // Simplified coverage rule (Member 4 may refine): any team overlap → special approval
  const specialApproval = hasOverlap;

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const insert = await client.query(
      `INSERT INTO leave_requests (
         user_id, leave_type, start_date, end_date, half_day_flag, half_day_period,
         remarks, days_count, status, supervisor_id, supervisor_status,
         manager_id, manager_status, special_approval_flag, overlap_flag,
         applicant_name_override, applicant_department_override
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,'pending',$10,'pending',$11,$12,$13,$14
       ) RETURNING *`,
      [
        user.id,
        leave_type,
        start_date,
        end_date,
        Boolean(half_day_flag),
        half_day_flag ? half_day_period || 'AM' : null,
        remarks,
        daysCount,
        user.supervisor_id,
        user.manager_id,
        specialApproval,
        hasOverlap,
        applicant_name_override ? String(applicant_name_override).trim() : null,
        applicant_department_override ? String(applicant_department_override).trim() : null,
      ]
    );

    const leave = insert.rows[0];

    await auditService.writeAudit(
      {
        action: 'leave_request_created',
        actorUserId: user.id,
        entityType: 'leave_request',
        entityId: leave.id,
        beforeState: null,
        afterState: leave,
      },
      client
    );

    await notificationService.notifyLeaveSubmitted(leave, user.supervisor_id, client);

    if (hasOverlap) {
      await notificationService.notifyOverlapWarning(user.id, leave.id, client);
    }

    await client.query('COMMIT');

    return {
      id: leave.id,
      status: leave.status,
      overlap_flag: leave.overlap_flag,
      special_approval_flag: leave.special_approval_flag,
      days_count: Number(leave.days_count),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * UC-03: Cancel leave.
 * - pending → cancelled immediately (no balance change)
 * - approved | supervisor_approved → cancel_pending (two-tier re-approval)
 * Balance restored only when cancel is fully approved (see approvalService).
 */
async function cancelLeave(user, id, reason) {
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
    const isOwner = leave.user_id === user.id;
    const isHr = user.role === 'hr_admin';
    if (!isOwner && !isHr) {
      throw appError('FORBIDDEN', 'Only the owner or HR admin can cancel this request');
    }

    if (leave.status === 'cancelled' || leave.status === 'cancel_pending') {
      throw appError('ALREADY_CANCELLED', 'Request is already cancelled or cancel pending');
    }
    if (leave.status === 'rejected') {
      throw appError('ALREADY_CANCELLED', 'Rejected requests cannot be cancelled');
    }

    const before = { ...leave };
    let updated;

    const nextRemarks = reason
      ? `${leave.remarks ? `${leave.remarks}\n` : ''}${
          leave.status === 'pending' ? '[Cancel] ' : '[Cancel request] '
        }${reason}`
      : leave.remarks;

    if (leave.status === 'pending') {
      const upd = await client.query(
        `UPDATE leave_requests
         SET status = 'cancelled',
             remarks = $2,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [leaveId, nextRemarks]
      );
      updated = upd.rows[0];

      await auditService.writeAudit(
        {
          action: 'leave_request_cancelled',
          actorUserId: user.id,
          entityType: 'leave_request',
          entityId: leaveId,
          beforeState: before,
          afterState: updated,
        },
        client
      );
    } else {
      // approved or supervisor_approved → cancel_pending two-tier
      const upd = await client.query(
        `UPDATE leave_requests
         SET status = 'cancel_pending',
             prior_status = $2,
             supervisor_status = 'pending',
             manager_status = 'pending',
             remarks = $3,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [leaveId, leave.status, nextRemarks]
      );
      updated = upd.rows[0];

      await auditService.writeAudit(
        {
          action: 'leave_request_cancel_pending',
          actorUserId: user.id,
          entityType: 'leave_request',
          entityId: leaveId,
          beforeState: before,
          afterState: updated,
        },
        client
      );

      await notificationService.notifyCancelPending(updated, [updated.supervisor_id], client);
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

async function checkOverlap(user, startDate, endDate) {
  if (!startDate || !endDate) {
    throw appError('MISSING_DATE_PARAMS', 'start_date and end_date query params are required');
  }

  const members = await overlapService.findOverlappingLeave({
    userId: user.id,
    department: user.department,
    startDate,
    endDate,
  });

  return {
    has_overlap: members.length > 0,
    overlapping_members: members.map((m) => ({
      user_id: m.user_id,
      name: m.name,
      leave_type: m.leave_type,
      start_date: m.start_date,
      end_date: m.end_date,
    })),
  };
}

module.exports = {
  mapLeaveRow,
  listForUser,
  getById,
  createLeave,
  cancelLeave,
  checkOverlap,
};

/**
 * UC-15: Approval Delegation / Acting Approver
 * Delegator (supervisor/manager) assigns a temporary acting approver.
 */

const db = require('../config/db');
const { appError } = require('../middleware/errorHandler');
const auditService = require('./auditService');
const { toDateOnly } = require('../utils/dates');

async function listMyDelegations(userId) {
  const result = await db.query(
    `SELECT d.*,
            g.name AS delegator_name, g.role AS delegator_role,
            e.name AS delegate_name, e.role AS delegate_role
     FROM approval_delegations d
     JOIN users g ON g.id = d.delegator_id
     JOIN users e ON e.id = d.delegate_id
     WHERE d.delegator_id = $1 OR d.delegate_id = $1
     ORDER BY d.start_date DESC`,
    [userId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    delegator_id: row.delegator_id,
    delegator_name: row.delegator_name,
    delegate_id: row.delegate_id,
    delegate_name: row.delegate_name,
    start_date: toDateOnly(row.start_date),
    end_date: toDateOnly(row.end_date),
    active: Boolean(row.active),
    created_at: row.created_at,
  }));
}

/**
 * Create delegation. Only supervisor/manager/hr_admin can create.
 */
async function createDelegation(user, { delegate_id, start_date, end_date }) {
  if (!['supervisor', 'manager', 'hr_admin'].includes(user.role)) {
    throw appError('FORBIDDEN', 'Only approvers can create delegations');
  }
  if (!delegate_id || !start_date || !end_date) {
    throw appError('VALIDATION_ERROR', 'delegate_id, start_date and end_date are required');
  }
  if (end_date < start_date) {
    throw appError('INVALID_DATE_RANGE', 'end_date must be on or after start_date');
  }
  if (Number(delegate_id) === user.id) {
    throw appError('VALIDATION_ERROR', 'Cannot delegate to yourself');
  }

  const del = await db.query(`SELECT id, active FROM users WHERE id = $1`, [delegate_id]);
  if (del.rows.length === 0 || !del.rows[0].active) {
    throw appError('NOT_FOUND', 'Delegate user not found');
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO approval_delegations
         (delegator_id, delegate_id, start_date, end_date, active)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING *`,
      [user.id, delegate_id, start_date, end_date]
    );
    const row = ins.rows[0];
    await auditService.writeAudit(
      {
        action: 'approval_delegation_created',
        actorUserId: user.id,
        entityType: 'approval_delegation',
        entityId: row.id,
        beforeState: null,
        afterState: row,
      },
      client
    );
    await client.query('COMMIT');
    return {
      id: row.id,
      delegator_id: row.delegator_id,
      delegate_id: row.delegate_id,
      start_date: toDateOnly(row.start_date),
      end_date: toDateOnly(row.end_date),
      active: Boolean(row.active),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function revokeDelegation(user, id) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const cur = await client.query(
      `SELECT * FROM approval_delegations WHERE id = $1`,
      [id]
    );
    if (cur.rows.length === 0) throw appError('NOT_FOUND', 'Delegation not found');
    const row = cur.rows[0];
    if (row.delegator_id !== user.id && user.role !== 'hr_admin') {
      throw appError('FORBIDDEN', 'Only the delegator or HR can revoke');
    }
    const upd = await client.query(
      `UPDATE approval_delegations SET active = FALSE WHERE id = $1 RETURNING *`,
      [id]
    );
    await auditService.writeAudit(
      {
        action: 'approval_delegation_revoked',
        actorUserId: user.id,
        entityType: 'approval_delegation',
        entityId: id,
        beforeState: row,
        afterState: upd.rows[0],
      },
      client
    );
    await client.query('COMMIT');
    return { id: Number(id), active: false };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * IDs of approvers this user may act for today (including self).
 */
async function getActingForUserIds(userId) {
  const today = new Date().toISOString().slice(0, 10);
  const result = await db.query(
    `SELECT delegator_id FROM approval_delegations
     WHERE delegate_id = $1
       AND active = TRUE
       AND start_date <= $2
       AND end_date >= $2`,
    [userId, today]
  );
  const ids = new Set([userId]);
  result.rows.forEach((r) => ids.add(r.delegator_id));
  return [...ids];
}

module.exports = {
  listMyDelegations,
  createDelegation,
  revokeDelegation,
  getActingForUserIds,
};

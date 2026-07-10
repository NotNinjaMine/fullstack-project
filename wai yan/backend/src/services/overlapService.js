/**
 * Simplified overlap service (Member 4 owns full version).
 * Finds overlapping non-rejected/non-cancelled team leave in a range.
 */

const db = require('../config/db');

async function findOverlappingLeave({
  userId,
  department,
  startDate,
  endDate,
  excludeRequestId = null,
  client = db,
}) {
  const params = [startDate, endDate, userId];
  let deptClause = '';
  let excludeClause = '';

  if (department) {
    params.push(department);
    deptClause = `AND u.department = $${params.length}`;
  }

  if (excludeRequestId) {
    params.push(excludeRequestId);
    excludeClause = `AND lr.id <> $${params.length}`;
  }

  const result = await client.query(
    `SELECT lr.id, lr.user_id, u.name, lr.leave_type,
            lr.start_date::text AS start_date,
            lr.end_date::text AS end_date,
            lr.status
     FROM leave_requests lr
     JOIN users u ON u.id = lr.user_id
     WHERE lr.status NOT IN ('rejected', 'cancelled')
       AND lr.user_id <> $3
       AND lr.start_date <= $2
       AND lr.end_date >= $1
       ${deptClause}
       ${excludeClause}
     ORDER BY lr.start_date`,
    params
  );

  const { toDateOnly } = require('../utils/dates');
  return result.rows.map((row) => ({
    user_id: row.user_id,
    name: row.name,
    leave_type: row.leave_type,
    start_date: toDateOnly(row.start_date),
    end_date: toDateOnly(row.end_date),
    leave_request_id: row.id,
    status: row.status,
  }));
}

async function countTeamOnLeave(department, startDate, endDate, client = db) {
  if (!department) return 0;
  const result = await client.query(
    `SELECT COUNT(DISTINCT lr.user_id)::int AS cnt
     FROM leave_requests lr
     JOIN users u ON u.id = lr.user_id
     WHERE u.department = $1
       AND lr.status IN ('pending', 'supervisor_approved', 'approved', 'cancel_pending')
       AND lr.start_date <= $3
       AND lr.end_date >= $2`,
    [department, startDate, endDate]
  );
  return result.rows[0]?.cnt || 0;
}

module.exports = {
  findOverlappingLeave,
  countTeamOnLeave,
};

/**
 * Simplified policy engine (Member 4 owns full version).
 * calcDaysCount excludes weekends + public_holidays; half-day returns 0.5.
 */

const db = require('../config/db');
const { toDateOnly } = require('../utils/dates');
const holidayService = require('./holidayService');

function eachDay(start, end) {
  const days = [];
  const cur = new Date(`${toDateOnly(start)}T00:00:00Z`);
  const last = new Date(`${toDateOnly(end)}T00:00:00Z`);
  while (cur <= last) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

async function getHolidaySet(countryCode, start, end, client = db) {
  // Lazy-load any missing years in range (online only if not in DB yet)
  try {
    await holidayService.ensureRange(countryCode, start, end);
  } catch (err) {
    console.warn('[policyEngine] holiday ensureRange:', err.message);
  }

  const result = await client.query(
    `SELECT holiday_date AS holiday_date
     FROM public_holidays
     WHERE country_code = $1
       AND holiday_date BETWEEN $2 AND $3`,
    [countryCode, toDateOnly(start), toDateOnly(end)]
  );
  return new Set(
    result.rows.map((r) => String(r.holiday_date).slice(0, 10))
  );
}

/**
 * @returns {Promise<number>} working days count
 */
async function calcDaysCount(start, end, halfDayFlag, countryCode, client = db) {
  const startDate = toDateOnly(start);
  const endDate = toDateOnly(end);

  if (endDate < startDate) {
    const err = new Error('End date must be on or after start date');
    err.code = 'INVALID_DATE_RANGE';
    throw err;
  }

  if (halfDayFlag) {
    if (startDate !== endDate) {
      const err = new Error('Half-day requests must be a single calendar day');
      err.code = 'INVALID_DATE_RANGE';
      throw err;
    }
    const holidays = await getHolidaySet(countryCode, startDate, endDate, client);
    const d = new Date(`${startDate}T00:00:00Z`);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6 || holidays.has(startDate)) {
      return 0;
    }
    return 0.5;
  }

  const holidays = await getHolidaySet(countryCode, startDate, endDate, client);
  let count = 0;
  for (const day of eachDay(startDate, endDate)) {
    const d = new Date(`${day}T00:00:00Z`);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    if (holidays.has(day)) continue;
    count += 1;
  }
  return count;
}

async function getBalance(userId, year, client = db) {
  const result = await client.query(
    `SELECT * FROM leave_balances WHERE user_id = $1 AND year = $2`,
    [userId, year]
  );
  return result.rows[0] || null;
}

async function checkSufficientBalance(userId, leaveType, daysCount, year, client = db) {
  if (leaveType === 'unpaid' || leaveType === 'other') {
    return true;
  }
  const balance = await getBalance(userId, year, client);
  if (!balance) {
    const err = new Error('Leave balance not found for this year');
    err.code = 'INSUFFICIENT_BALANCE';
    throw err;
  }
  if (leaveType === 'annual' && Number(balance.annual_balance) < daysCount) {
    const err = new Error('Insufficient annual leave balance');
    err.code = 'INSUFFICIENT_BALANCE';
    throw err;
  }
  if (leaveType === 'sick' && Number(balance.sick_balance) < daysCount) {
    const err = new Error('Insufficient sick leave balance');
    err.code = 'INSUFFICIENT_BALANCE';
    throw err;
  }
  return true;
}

async function deductBalance(userId, leaveType, daysCount, year, client = db) {
  if (leaveType === 'unpaid' || leaveType === 'other') {
    return null;
  }
  await checkSufficientBalance(userId, leaveType, daysCount, year, client);

  if (leaveType === 'annual') {
    const result = await client.query(
      `UPDATE leave_balances
       SET annual_balance = annual_balance - $1
       WHERE user_id = $2 AND year = $3
         AND annual_balance >= $1
       RETURNING *`,
      [daysCount, userId, year]
    );
    if (result.rows.length === 0) {
      const err = new Error('Insufficient annual leave balance');
      err.code = 'INSUFFICIENT_BALANCE';
      throw err;
    }
    return result.rows[0];
  }

  if (leaveType === 'sick') {
    const result = await client.query(
      `UPDATE leave_balances
       SET sick_balance = sick_balance - $1
       WHERE user_id = $2 AND year = $3
         AND sick_balance >= $1
       RETURNING *`,
      [daysCount, userId, year]
    );
    if (result.rows.length === 0) {
      const err = new Error('Insufficient sick leave balance');
      err.code = 'INSUFFICIENT_BALANCE';
      throw err;
    }
    return result.rows[0];
  }

  return null;
}

async function restoreBalance(userId, leaveType, daysCount, year, client = db) {
  if (leaveType === 'unpaid' || leaveType === 'other') {
    return null;
  }
  if (leaveType === 'annual') {
    const result = await client.query(
      `UPDATE leave_balances
       SET annual_balance = annual_balance + $1
       WHERE user_id = $2 AND year = $3
       RETURNING *`,
      [daysCount, userId, year]
    );
    return result.rows[0] || null;
  }
  if (leaveType === 'sick') {
    const result = await client.query(
      `UPDATE leave_balances
       SET sick_balance = sick_balance + $1
       WHERE user_id = $2 AND year = $3
       RETURNING *`,
      [daysCount, userId, year]
    );
    return result.rows[0] || null;
  }
  return null;
}

module.exports = {
  calcDaysCount,
  getBalance,
  checkSufficientBalance,
  deductBalance,
  restoreBalance,
};

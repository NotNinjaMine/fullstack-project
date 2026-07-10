/**
 * Public holidays: database cache first, fetch online only when a user searches
 * a year/country that is not yet cached.
 *
 * Online source: Nager.Date (free, no API key)
 *   GET https://date.nager.at/api/v3/PublicHolidays/{year}/{countryCode}
 *
 * Coverage target: 2025–2035+ on demand. When the calendar year reaches 2030,
 * the server prefetches a rolling 10-year window (current year → +10).
 *
 * Myanmar (MM) is not always on Nager — uses civil-date templates when online fails.
 */

const db = require('../config/db');
const {
  COUNTRY_LABELS,
  SUPPORTED_COUNTRY_CODES,
} = require('../config/company');
const { toDateOnly } = require('../utils/dates');

const NAGER_BASE =
  process.env.HOLIDAY_API_BASE_URL || 'https://date.nager.at/api/v3';

/** Prefetch window length when rolling update fires */
const ROLLING_YEARS = 10;
const ROLLING_TRIGGER_YEAR = 2030;

const inFlight = new Map(); // key `${cc}:${year}` → Promise
let schemaReady = false;
let rollingStarted = false;

function countryName(code) {
  return COUNTRY_LABELS[code] || code;
}

async function ensureSchema() {
  if (schemaReady) return;
  const sqlite = db.driver === 'sqlite';
  await db.query(
    sqlite
      ? `CREATE TABLE IF NOT EXISTS holiday_fetch_log (
           country_code TEXT NOT NULL,
           year INTEGER NOT NULL,
           source TEXT NOT NULL,
           holiday_count INTEGER NOT NULL DEFAULT 0,
           fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
           PRIMARY KEY (country_code, year)
         )`
      : `CREATE TABLE IF NOT EXISTS holiday_fetch_log (
           country_code VARCHAR(2) NOT NULL,
           year INTEGER NOT NULL,
           source VARCHAR(32) NOT NULL,
           holiday_count INTEGER NOT NULL DEFAULT 0,
           fetched_at TIMESTAMP NOT NULL DEFAULT NOW(),
           PRIMARY KEY (country_code, year)
         )`
  );
  schemaReady = true;
}

async function isYearCached(countryCode, year) {
  await ensureSchema();
  const r = await db.query(
    `SELECT holiday_count FROM holiday_fetch_log
     WHERE country_code = $1 AND year = $2`,
    [countryCode, year]
  );
  return r.rows.length > 0;
}

async function markCached(countryCode, year, source, count) {
  await ensureSchema();
  // Upsert without driver-specific ON CONFLICT syntax issues:
  // delete + insert is fine for small meta rows
  await db.query(
    `DELETE FROM holiday_fetch_log WHERE country_code = $1 AND year = $2`,
    [countryCode, year]
  );
  await db.query(
    `INSERT INTO holiday_fetch_log (country_code, year, source, holiday_count, fetched_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [countryCode, year, source, count, new Date().toISOString()]
  );
}

/**
 * Civil / template holidays for countries missing from Nager (or offline).
 * Fixed dates only (demo-safe). Lunar festivals need online source when available.
 */
function templateHolidays(year, countryCode) {
  const y = Number(year);
  const cn = countryName(countryCode);
  const fixed = {
    SG: [
      [`${y}-01-01`, "New Year's Day"],
      [`${y}-05-01`, 'Labour Day'],
      [`${y}-08-09`, 'National Day'],
      [`${y}-12-25`, 'Christmas Day'],
    ],
    CN: [
      [`${y}-01-01`, "New Year's Day"],
      [`${y}-05-01`, 'Labour Day'],
      [`${y}-10-01`, 'National Day'],
    ],
    ID: [
      [`${y}-01-01`, "New Year's Day"],
      [`${y}-05-01`, 'Labour Day'],
      [`${y}-08-17`, 'Independence Day'],
      [`${y}-12-25`, 'Christmas Day'],
    ],
    JP: [
      [`${y}-01-01`, "New Year's Day"],
      [`${y}-02-11`, 'National Foundation Day'],
      [`${y}-02-23`, "Emperor's Birthday"],
      [`${y}-04-29`, 'Shōwa Day'],
      [`${y}-05-03`, 'Constitution Memorial Day'],
      [`${y}-05-04`, 'Greenery Day'],
      [`${y}-05-05`, "Children's Day"],
      [`${y}-08-11`, 'Mountain Day'],
      [`${y}-11-03`, 'Culture Day'],
      [`${y}-11-23`, 'Labour Thanksgiving Day'],
    ],
    MY: [
      [`${y}-01-01`, "New Year's Day"],
      [`${y}-05-01`, 'Labour Day'],
      [`${y}-08-31`, 'National Day (Merdeka)'],
      [`${y}-09-16`, 'Malaysia Day'],
      [`${y}-12-25`, 'Christmas Day'],
    ],
    MM: [
      [`${y}-01-04`, 'Independence Day'],
      [`${y}-02-12`, 'Union Day'],
      [`${y}-03-02`, "Peasants' Day"],
      [`${y}-03-27`, 'Armed Forces Day'],
      [`${y}-05-01`, 'Labour Day'],
      [`${y}-07-19`, "Martyrs' Day"],
      [`${y}-12-25`, 'Christmas Day'],
    ],
    NZ: [
      [`${y}-01-01`, "New Year's Day"],
      [`${y}-01-02`, "Day after New Year's Day"],
      [`${y}-02-06`, 'Waitangi Day'],
      [`${y}-04-25`, 'ANZAC Day'],
      [`${y}-12-25`, 'Christmas Day'],
      [`${y}-12-26`, 'Boxing Day'],
    ],
    PH: [
      [`${y}-01-01`, "New Year's Day"],
      [`${y}-04-09`, 'Araw ng Kagitingan'],
      [`${y}-05-01`, 'Labour Day'],
      [`${y}-06-12`, 'Independence Day'],
      [`${y}-08-21`, 'Ninoy Aquino Day'],
      [`${y}-11-30`, 'Bonifacio Day'],
      [`${y}-12-25`, 'Christmas Day'],
      [`${y}-12-30`, 'Rizal Day'],
    ],
    TH: [
      [`${y}-01-01`, "New Year's Day"],
      [`${y}-04-06`, 'Chakri Memorial Day'],
      [`${y}-05-01`, 'Labour Day'],
      [`${y}-05-04`, 'Coronation Day'],
      [`${y}-07-28`, "King's Birthday"],
      [`${y}-08-12`, "Mother's Day"],
      [`${y}-10-13`, 'King Bhumibol Memorial Day'],
      [`${y}-12-05`, "Father's Day"],
      [`${y}-12-10`, 'Constitution Day'],
    ],
    VN: [
      [`${y}-01-01`, "New Year's Day"],
      [`${y}-04-30`, 'Reunification Day'],
      [`${y}-05-01`, 'Labour Day'],
      [`${y}-09-02`, 'National Day'],
    ],
  };

  const list = fixed[countryCode] || [[`${y}-01-01`, "New Year's Day"]];
  return list.map(([date, name]) => ({
    date,
    country_code: countryCode,
    name,
    description: `${name} is a public holiday in ${cn} (${y}). Cached from template (offline / Nager unavailable). Leave day-count excludes this date for ${countryCode} staff.`,
    source: 'template',
  }));
}

async function fetchFromNager(year, countryCode) {
  const url = `${NAGER_BASE}/PublicHolidays/${year}/${countryCode}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (res.status === 404) {
      return null; // country/year not supported
    }
    if (!res.ok) {
      throw new Error(`Nager HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!Array.isArray(data)) return null;

    return data
      .filter((h) => {
        // Prefer public holidays; if types missing, keep all
        if (!h.types || !Array.isArray(h.types)) return true;
        return h.types.includes('Public') || h.types.length === 0;
      })
      .map((h) => {
        const name = h.localName || h.name || 'Public holiday';
        const eng = h.name && h.name !== name ? ` (${h.name})` : '';
        return {
          date: String(h.date).slice(0, 10),
          country_code: countryCode,
          name: `${name}${eng}`.slice(0, 200),
          description: `${name} is a public holiday in ${countryName(
            countryCode
          )} on ${h.date}. Source: Nager.Date online API. Working-day leave counts exclude this date for ${countryCode} employees.`,
          source: 'nager',
        };
      });
  } finally {
    clearTimeout(timer);
  }
}

async function insertHolidays(rows) {
  let n = 0;
  for (const h of rows) {
    try {
      // Avoid duplicates via UNIQUE(holiday_date, country_code)
      const existing = await db.query(
        `SELECT id FROM public_holidays
         WHERE holiday_date = $1 AND country_code = $2`,
        [h.date, h.country_code]
      );
      if (existing.rows.length) continue;
      await db.query(
        `INSERT INTO public_holidays (holiday_date, country_code, holiday_name, description)
         VALUES ($1, $2, $3, $4)`,
        [h.date, h.country_code, h.name, h.description || null]
      );
      n += 1;
    } catch (err) {
      // race / unique — ignore
      if (!/unique|duplicate/i.test(err.message || '')) {
        console.warn('[holidayService] insert:', err.message);
      }
    }
  }
  return n;
}

/**
 * Ensure one country+year is in the DB. Fetches online only if not cached.
 */
async function ensureCountryYear(countryCode, year) {
  const cc = String(countryCode || '').toUpperCase();
  const y = Number(year);
  if (!cc || !Number.isInteger(y) || y < 1) {
    return { cached: false, source: null, count: 0 };
  }

  if (await isYearCached(cc, y)) {
    return { cached: true, source: 'db', count: 0 };
  }

  const key = `${cc}:${y}`;
  if (inFlight.has(key)) {
    return inFlight.get(key);
  }

  const work = (async () => {
    let rows = null;
    let source = 'template';

    try {
      rows = await fetchFromNager(y, cc);
      if (rows && rows.length) {
        source = 'nager';
      }
    } catch (err) {
      console.warn(
        `[holidayService] online fetch failed ${cc} ${y}:`,
        err.message
      );
    }

    if (!rows || !rows.length) {
      rows = templateHolidays(y, cc);
      source = 'template';
    }

    const inserted = await insertHolidays(rows);
    await markCached(cc, y, source, rows.length);
    console.log(
      `[holidayService] cached ${cc} ${y}: ${rows.length} holidays (source=${source}, new=${inserted})`
    );
    return { cached: false, source, count: rows.length };
  })().finally(() => inFlight.delete(key));

  inFlight.set(key, work);
  return work;
}

/**
 * Ensure holidays exist for all office countries for a year (user search).
 */
async function ensureYear(year, countryCodes = SUPPORTED_COUNTRY_CODES) {
  const codes = (countryCodes || SUPPORTED_COUNTRY_CODES).map((c) =>
    String(c).toUpperCase()
  );
  const results = [];
  // Sequential to be kind to free API
  for (const cc of codes) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await ensureCountryYear(cc, year));
  }
  return results;
}


/** Load the ten following years in the background after a 2030+ request. */
async function prefetchFutureYears(countryCodes, firstYear, count = ROLLING_YEARS) {
  for (let offset = 0; offset < count; offset += 1) {
    for (const countryCode of countryCodes) {
      // Keep external API calls polite and reuse in-flight/cached requests.
      // eslint-disable-next-line no-await-in-loop
      await ensureCountryYear(countryCode, firstYear + offset);
    }
  }
}

function triggerFuturePrefetch(countryCodes, year) {
  if (Number(year) < ROLLING_TRIGGER_YEAR) return;
  void prefetchFutureYears(countryCodes, Number(year) + 1).catch((err) => {
    console.warn('[holidayService] future prefetch:', err.message);
  });
}

async function loadRange(countryCode, yearFrom, yearTo) {
  const cc = String(countryCode || '').toUpperCase();
  const from = Number(yearFrom);
  const to = Number(yearTo);
  if (!SUPPORTED_COUNTRY_CODES.includes(cc)) {
    throw new Error(`Unsupported country code: ${cc || 'missing'}`);
  }
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
    throw new Error('year_from and year_to must be a valid ascending range');
  }
  const results = [];
  for (let year = from; year <= to; year += 1) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await ensureCountryYear(cc, year));
  }
  return { country_code: cc, year_from: from, year_to: to, results };
}

/**
 * Ensure years covering a date range (for leave day-count).
 */
async function ensureRange(countryCode, startDate, endDate) {
  const startY = Number(String(toDateOnly(startDate)).slice(0, 4));
  const endY = Number(String(toDateOnly(endDate)).slice(0, 4));
  if (!Number.isFinite(startY) || !Number.isFinite(endY)) return;
  for (let y = startY; y <= endY; y += 1) {
    // eslint-disable-next-line no-await-in-loop
    await ensureCountryYear(countryCode, y);
  }
  triggerFuturePrefetch([countryCode], endY);
}

/**
 * List holidays for UI. Loads from DB; fetches online only for missing years.
 * @returns {{ holidays, meta }}
 */
async function listHolidays({ year, country_code } = {}) {
  const y = Number(year) || new Date().getFullYear();
  const cc = (country_code || 'ALL').toUpperCase();

  const codes =
    cc && cc !== 'ALL' && cc !== '*'
      ? [cc]
      : [...SUPPORTED_COUNTRY_CODES];

  const ensureMeta = await ensureYear(y, codes);
  triggerFuturePrefetch(codes, y);

  const params = [`${y}-01-01`, `${y}-12-31`];
  let where = `holiday_date >= $1 AND holiday_date <= $2`;
  if (cc && cc !== 'ALL' && cc !== '*') {
    params.push(cc);
    where += ` AND country_code = $3`;
  }

  const result = await db.query(
    `SELECT holiday_date, country_code, holiday_name, description
     FROM public_holidays
     WHERE ${where}
     ORDER BY holiday_date, country_code`,
    params
  );

  const holidays = result.rows.map((r) => ({
    date: toDateOnly(r.holiday_date),
    country_code: r.country_code,
    country_name: countryName(r.country_code),
    name: r.holiday_name,
    description:
      r.description ||
      `${r.holiday_name} is a public holiday in ${countryName(r.country_code)}.`,
  }));

  const fetchedOnline = ensureMeta.some((m) => m.source === 'nager');
  const usedTemplate = ensureMeta.some((m) => m.source === 'template');

  return {
    holidays,
    meta: {
      year: y,
      country_filter: cc,
      total: holidays.length,
      source_note: fetchedOnline
        ? 'Loaded from online holiday API and saved to database for next time.'
        : usedTemplate
          ? 'Some countries used offline templates (API unavailable or unsupported).'
          : 'Served from database cache (no new online fetch).',
      strategy: 'db_first_online_on_miss',
    },
  };
}

/**
 * When calendar year ≥ 2030, prefetch current year → +10 for all offices.
 * Safe to call often; skips years already in holiday_fetch_log.
 */
async function maybePrefetchRollingWindow(force = false) {
  const nowY = new Date().getFullYear();
  if (!force && nowY < ROLLING_TRIGGER_YEAR) {
    // Still warm current year only (cheap) so day-count works offline-ish
    return ensureYear(nowY);
  }
  if (rollingStarted && !force) return;
  rollingStarted = true;

  const start = nowY + 1;
  const end = nowY + ROLLING_YEARS;
  console.log(
    `[holidayService] rolling prefetch ${start}–${end} for ${SUPPORTED_COUNTRY_CODES.length} countries`
  );

  for (let y = start; y <= end; y += 1) {
    // eslint-disable-next-line no-await-in-loop
    await ensureYear(y);
  }
}

/**
 * Warm current year at server boot (non-blocking).
 */
function startHolidayWarmup() {
  setImmediate(() => {
    maybePrefetchRollingWindow(false).catch((err) => {
      console.warn('[holidayService] warmup:', err.message);
    });
  });
}

/**
 * Mark seed data as already cached so we do not re-fetch 2026 on first request.
 */
async function markSeedYearCached(year, countryCodes, source = 'seed') {
  await ensureSchema();
  for (const cc of countryCodes) {
    const r = await db.query(
      `SELECT COUNT(*)::int AS c FROM public_holidays
       WHERE country_code = $1
         AND holiday_date >= $2 AND holiday_date <= $3`,
      [cc, `${year}-01-01`, `${year}-12-31`]
    );
    const count = Number(r.rows[0]?.c || 0);
    if (count > 0) {
      // eslint-disable-next-line no-await-in-loop
      await markCached(cc, year, source, count);
    }
  }
}

module.exports = {
  ensureCountryYear,
  ensureYear,
  ensureRange,
  loadRange,
  listHolidays,
  maybePrefetchRollingWindow,
  startHolidayWarmup,
  markSeedYearCached,
  templateHolidays,
};

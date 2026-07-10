/**
 * Editable company profile + multi-country offices (HR admin).
 * Defaults from config/company.js; persisted in DB so HR edits survive restarts.
 */

const db = require('../config/db');
const { appError } = require('../middleware/errorHandler');
const {
  COMPANY_PROFILE,
  OFFICES,
  COUNTRY_FLAGS,
} = require('../config/company');

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS company_profile (
      id                 INTEGER PRIMARY KEY CHECK (id = 1),
      name               TEXT NOT NULL,
      short_name         TEXT,
      reg_no             TEXT,
      hq_country         TEXT,
      hq_country_code    TEXT,
      hq_address         TEXT,
      staff_count        INTEGER,
      industry           TEXT,
      timezone_primary   TEXT,
      website            TEXT,
      description        TEXT,
      updated_at         TEXT,
      updated_by         INTEGER
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS company_offices (
      code          TEXT PRIMARY KEY,
      country       TEXT NOT NULL,
      flag          TEXT,
      branch        TEXT NOT NULL,
      city          TEXT,
      address       TEXT,
      approx_staff  INTEGER DEFAULT 0,
      is_hq         INTEGER NOT NULL DEFAULT 0,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      phone         TEXT,
      email         TEXT,
      notes         TEXT
    )
  `);

  // Bootstrap defaults if empty
  const existing = await db.query(`SELECT id FROM company_profile WHERE id = 1`);
  if (existing.rows.length === 0) {
    await seedDefaults();
  }

  schemaReady = true;
}

async function seedDefaults() {
  const p = COMPANY_PROFILE;
  await db.query(
    `INSERT INTO company_profile (
       id, name, short_name, reg_no, hq_country, hq_country_code, hq_address,
       staff_count, industry, timezone_primary, website, description, updated_at
     ) VALUES (1, $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      p.name,
      p.short_name,
      p.reg_no,
      p.hq_country,
      p.hq_country_code,
      p.hq_address,
      p.staff_count,
      p.industry,
      p.timezone_primary,
      p.website,
      p.description,
      new Date().toISOString(),
    ]
  );

  let order = 0;
  for (const o of OFFICES) {
    // eslint-disable-next-line no-await-in-loop
    await db.query(
      `INSERT INTO company_offices (
         code, country, flag, branch, city, address, approx_staff, is_hq, sort_order
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        o.code,
        o.country,
        o.flag || COUNTRY_FLAGS[o.code] || '',
        o.branch,
        o.city,
        o.address,
        o.approx_staff || 0,
        o.is_hq ? 1 : 0,
        order,
      ]
    );
    order += 1;
  }
}

function mapProfileRow(row) {
  if (!row) return { ...COMPANY_PROFILE };
  return {
    name: row.name,
    short_name: row.short_name,
    reg_no: row.reg_no,
    hq_country: row.hq_country,
    hq_country_code: row.hq_country_code,
    hq_address: row.hq_address,
    staff_count: Number(row.staff_count) || 0,
    industry: row.industry,
    timezone_primary: row.timezone_primary,
    website: row.website,
    description: row.description,
    updated_at: row.updated_at || null,
    updated_by: row.updated_by || null,
  };
}

function mapOfficeRow(row) {
  return {
    code: row.code,
    country: row.country,
    flag: row.flag || COUNTRY_FLAGS[row.code] || '',
    branch: row.branch,
    city: row.city || '',
    address: row.address || '',
    approx_staff: Number(row.approx_staff) || 0,
    is_hq: Boolean(row.is_hq),
    sort_order: Number(row.sort_order) || 0,
    phone: row.phone || null,
    email: row.email || null,
    notes: row.notes || null,
  };
}

/**
 * Live company profile + offices (for APIs / UI).
 */
async function getLiveCompanyProfile() {
  await ensureSchema();

  const profileRes = await db.query(`SELECT * FROM company_profile WHERE id = 1`);
  const officesRes = await db.query(
    `SELECT * FROM company_offices ORDER BY sort_order ASC, code ASC`
  );

  const profile = mapProfileRow(profileRes.rows[0]);
  const offices = officesRes.rows.map(mapOfficeRow);

  const total_offices = offices.length;
  const total_countries = new Set(offices.map((o) => o.code)).size;
  const hq = offices.find((o) => o.is_hq) || offices[0];

  return {
    ...profile,
    total_offices,
    total_countries,
    // Keep HQ address in sync preference: profile field wins if set
    hq_address: profile.hq_address || hq?.address || COMPANY_PROFILE.hq_address,
    hq_country: profile.hq_country || hq?.country || COMPANY_PROFILE.hq_country,
    hq_country_code:
      profile.hq_country_code || hq?.code || COMPANY_PROFILE.hq_country_code,
    countries: offices.map((o) => ({
      code: o.code,
      name: o.country,
      flag: o.flag,
    })),
    offices,
    country_labels: Object.fromEntries(offices.map((o) => [o.code, o.country])),
    can_edit: true, // controller strips for non-HR if needed
  };
}

/**
 * HR: update company-level fields (name, HQ address, staff count, description, …).
 */
async function updateCompanyProfile(user, body = {}) {
  if (!user || user.role !== 'hr_admin') {
    throw appError('FORBIDDEN', 'Only HR admin can edit company details');
  }
  await ensureSchema();

  const allowed = [
    'name',
    'short_name',
    'reg_no',
    'hq_country',
    'hq_country_code',
    'hq_address',
    'staff_count',
    'industry',
    'timezone_primary',
    'website',
    'description',
  ];

  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (body[key] !== undefined) {
      let val = body[key];
      if (typeof val === 'string') val = val.trim();
      if (key === 'staff_count') val = Math.max(0, Number(val) || 0);
      if (key === 'hq_country_code' && val) val = String(val).toUpperCase().slice(0, 2);
      if (key === 'name' && !val) {
        throw appError('VALIDATION_ERROR', 'Company name is required');
      }
      params.push(val);
      sets.push(`${key} = $${params.length}`);
    }
  }

  if (sets.length === 0) {
    throw appError('VALIDATION_ERROR', 'No company fields to update');
  }

  params.push(new Date().toISOString());
  sets.push(`updated_at = $${params.length}`);
  params.push(user.id);
  sets.push(`updated_by = $${params.length}`);

  await db.query(
    `UPDATE company_profile SET ${sets.join(', ')} WHERE id = 1`,
    params
  );

  return getLiveCompanyProfile();
}

/**
 * HR: create or update one office (by country code).
 */
async function upsertOffice(user, body = {}) {
  if (!user || user.role !== 'hr_admin') {
    throw appError('FORBIDDEN', 'Only HR admin can edit office details');
  }
  await ensureSchema();

  const code = String(body.code || '')
    .trim()
    .toUpperCase()
    .slice(0, 2);
  if (!code || code.length !== 2) {
    throw appError('VALIDATION_ERROR', 'Office country code must be 2 letters (e.g. SG, MM)');
  }
  if (!body.branch || !String(body.branch).trim()) {
    throw appError('VALIDATION_ERROR', 'Office branch name is required');
  }
  if (!body.country || !String(body.country).trim()) {
    throw appError('VALIDATION_ERROR', 'Country name is required');
  }

  const existing = await db.query(
    `SELECT code FROM company_offices WHERE code = $1`,
    [code]
  );

  const fields = {
    country: String(body.country).trim(),
    flag: body.flag != null ? String(body.flag) : COUNTRY_FLAGS[code] || '',
    branch: String(body.branch).trim(),
    city: body.city != null ? String(body.city).trim() : '',
    address: body.address != null ? String(body.address).trim() : '',
    approx_staff: Math.max(0, Number(body.approx_staff) || 0),
    is_hq: body.is_hq ? 1 : 0,
    sort_order: Number.isFinite(Number(body.sort_order))
      ? Number(body.sort_order)
      : 99,
    phone: body.phone != null ? String(body.phone).trim() : null,
    email: body.email != null ? String(body.email).trim() : null,
    notes: body.notes != null ? String(body.notes).trim() : null,
  };

  // Only one HQ
  if (fields.is_hq) {
    await db.query(`UPDATE company_offices SET is_hq = 0 WHERE code <> $1`, [code]);
  }

  if (existing.rows.length) {
    await db.query(
      `UPDATE company_offices SET
         country = $1, flag = $2, branch = $3, city = $4, address = $5,
         approx_staff = $6, is_hq = $7, sort_order = $8, phone = $9, email = $10, notes = $11
       WHERE code = $12`,
      [
        fields.country,
        fields.flag,
        fields.branch,
        fields.city,
        fields.address,
        fields.approx_staff,
        fields.is_hq,
        fields.sort_order,
        fields.phone,
        fields.email,
        fields.notes,
        code,
      ]
    );
  } else {
    await db.query(
      `INSERT INTO company_offices (
         code, country, flag, branch, city, address, approx_staff, is_hq, sort_order, phone, email, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        code,
        fields.country,
        fields.flag,
        fields.branch,
        fields.city,
        fields.address,
        fields.approx_staff,
        fields.is_hq,
        fields.sort_order,
        fields.phone,
        fields.email,
        fields.notes,
      ]
    );
  }

  // Touch company profile timestamp
  await db.query(
    `UPDATE company_profile SET updated_at = $1, updated_by = $2 WHERE id = 1`,
    [new Date().toISOString(), user.id]
  );

  return getLiveCompanyProfile();
}

/**
 * HR: delete an office (cannot delete last office or sole HQ without reassignment).
 */
async function deleteOffice(user, code) {
  if (!user || user.role !== 'hr_admin') {
    throw appError('FORBIDDEN', 'Only HR admin can delete offices');
  }
  await ensureSchema();

  const cc = String(code || '')
    .trim()
    .toUpperCase();
  if (!cc) throw appError('VALIDATION_ERROR', 'Office code required');

  const all = await db.query(`SELECT code, is_hq FROM company_offices`);
  if (all.rows.length <= 1) {
    throw appError('VALIDATION_ERROR', 'Cannot delete the last remaining office');
  }

  const target = all.rows.find((r) => r.code === cc);
  if (!target) throw appError('NOT_FOUND', 'Office not found');

  await db.query(`DELETE FROM company_offices WHERE code = $1`, [cc]);

  // If we deleted HQ, promote first remaining
  if (target.is_hq) {
    const next = await db.query(
      `SELECT code FROM company_offices ORDER BY sort_order ASC LIMIT 1`
    );
    if (next.rows[0]) {
      await db.query(`UPDATE company_offices SET is_hq = 1 WHERE code = $1`, [
        next.rows[0].code,
      ]);
    }
  }

  await db.query(
    `UPDATE company_profile SET updated_at = $1, updated_by = $2 WHERE id = 1`,
    [new Date().toISOString(), user.id]
  );

  return getLiveCompanyProfile();
}

/**
 * HR: replace all offices in one save (bulk editor).
 */
async function replaceAllOffices(user, offices = []) {
  if (!user || user.role !== 'hr_admin') {
    throw appError('FORBIDDEN', 'Only HR admin can edit offices');
  }
  if (!Array.isArray(offices) || offices.length === 0) {
    throw appError('VALIDATION_ERROR', 'At least one office is required');
  }
  await ensureSchema();

  // Validate
  const codes = new Set();
  let hqCount = 0;
  for (const o of offices) {
    const code = String(o.code || '')
      .trim()
      .toUpperCase();
    if (!code || code.length !== 2) {
      throw appError('VALIDATION_ERROR', 'Each office needs a 2-letter country code');
    }
    if (codes.has(code)) {
      throw appError('VALIDATION_ERROR', `Duplicate office code: ${code}`);
    }
    codes.add(code);
    if (!o.branch || !String(o.branch).trim()) {
      throw appError('VALIDATION_ERROR', `Branch name required for ${code}`);
    }
    if (o.is_hq) hqCount += 1;
  }
  if (hqCount === 0) {
    offices[0].is_hq = true;
  }

  await db.query(`DELETE FROM company_offices`);

  let order = 0;
  for (const o of offices) {
    const code = String(o.code).trim().toUpperCase().slice(0, 2);
    // eslint-disable-next-line no-await-in-loop
    await db.query(
      `INSERT INTO company_offices (
         code, country, flag, branch, city, address, approx_staff, is_hq, sort_order, phone, email, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        code,
        String(o.country || code).trim(),
        o.flag || COUNTRY_FLAGS[code] || '',
        String(o.branch).trim(),
        o.city != null ? String(o.city).trim() : '',
        o.address != null ? String(o.address).trim() : '',
        Math.max(0, Number(o.approx_staff) || 0),
        o.is_hq ? 1 : 0,
        order,
        o.phone || null,
        o.email || null,
        o.notes || null,
      ]
    );
    order += 1;
  }

  await db.query(
    `UPDATE company_profile SET updated_at = $1, updated_by = $2 WHERE id = 1`,
    [new Date().toISOString(), user.id]
  );

  return getLiveCompanyProfile();
}

module.exports = {
  ensureSchema,
  getLiveCompanyProfile,
  updateCompanyProfile,
  upsertOffice,
  deleteOffice,
  replaceAllOffices,
  seedDefaults,
};

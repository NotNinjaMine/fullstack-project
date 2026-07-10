/**
 * Shared employee / company profile shaping for APIs.
 */

const { COMPANY_PROFILE, countryName } = require('../config/company');

const COMPANY = {
  name: COMPANY_PROFILE.name,
  reg_no: COMPANY_PROFILE.reg_no,
  hq_address: COMPANY_PROFILE.hq_address,
  staff_count: COMPANY_PROFILE.staff_count,
  total_countries: COMPANY_PROFILE.total_countries,
  total_offices: COMPANY_PROFILE.total_offices,
};

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    employee_id: row.employee_id || null,
    name: row.name,
    email: row.email,
    phone: row.phone || null,
    address: row.address || row.personal_address || null,
    personal_address: row.address || row.personal_address || null,
    job_title: row.job_title || null,
    department: row.department || null,
    office_branch: row.office_branch || null,
    office_city: row.office_city || null,
    office_country: row.office_country || null,
    country_code: row.country_code,
    country_name: countryName(row.country_code),
    company_name: row.company_name || COMPANY.name,
    company_address: row.company_address || COMPANY.hq_address,
    company_reg_no: COMPANY.reg_no,
    company_staff_count: COMPANY.staff_count,
    company_total_countries: COMPANY.total_countries,
    company_total_offices: COMPANY.total_offices,
    date_of_birth: row.date_of_birth || null,
    join_date: row.join_date || null,
    gender: row.gender || null,
    role: row.role,
    supervisor_id: row.supervisor_id,
    manager_id: row.manager_id,
    hod_id: row.hod_id,
    active: row.active === undefined ? true : Boolean(row.active),
  };
}

/** Applicant block on leave/approval payloads */
function applicantFromRow(row, prefix = 'applicant_') {
  const get = (key) =>
    row[`${prefix}${key}`] !== undefined ? row[`${prefix}${key}`] : row[key];

  return {
    id: get('id'),
    employee_id: get('employee_id'),
    name: get('name'),
    email: get('email'),
    phone: get('phone'),
    address: get('address') || get('personal_address'),
    personal_address: get('address') || get('personal_address'),
    job_title: get('job_title'),
    department: get('department'),
    office_branch: get('office_branch'),
    office_city: get('office_city'),
    office_country: get('office_country'),
    country_code: get('country') || get('country_code'),
    country_name: countryName(get('country') || get('country_code')),
    company_name: get('company_name') || COMPANY.name,
    company_address: get('company_address') || COMPANY.hq_address,
  };
}

const USER_PROFILE_COLUMNS = `
  id, employee_id, name, email, phone, address, personal_address, job_title, department,
  office_branch, office_city, office_country, company_name, company_address,
  country_code, date_of_birth, join_date, gender, role, supervisor_id, manager_id, hod_id, active
`;

const APPLICANT_SELECT = `
  u.id AS applicant_id,
  u.employee_id AS applicant_employee_id,
  u.name AS applicant_name,
  u.email AS applicant_email,
  u.phone AS applicant_phone,
  u.address AS applicant_address,
  u.personal_address AS applicant_personal_address,
  u.job_title AS applicant_job_title,
  u.department AS applicant_department,
  u.office_branch AS applicant_office_branch,
  u.office_city AS applicant_office_city,
  u.office_country AS applicant_office_country,
  u.company_name AS applicant_company_name,
  u.company_address AS applicant_company_address,
  u.country_code AS applicant_country
`;

module.exports = {
  publicUser,
  applicantFromRow,
  USER_PROFILE_COLUMNS,
  APPLICANT_SELECT,
  COMPANY,
};

/**
 * Apex Global Solutions — multi-office company profile.
 * Singapore HQ · ~60 staff · 10 offices across Asia-Pacific.
 */

const COMPANY_PROFILE = {
  name: 'Apex Global Solutions Pte Ltd',
  short_name: 'Apex Global',
  reg_no: '201912345K',
  hq_country: 'Singapore',
  hq_country_code: 'SG',
  hq_address:
    '12 Marina Boulevard, #28-01, Marina Bay Financial Centre Tower 3, Singapore 018982',
  /** Approximate headcount (real-world company scale for the product demo) */
  staff_count: 60,
  /** Distinct countries with local offices */
  total_countries: 10,
  total_offices: 10,
  industry: 'Regional professional services & operations',
  timezone_primary: 'Asia/Singapore',
  website: 'https://www.apexglobal.example',
  description:
    'Apex Global Solutions is headquartered in Singapore with approximately 60 staff across 10 Asian offices — China, Indonesia, Japan, Malaysia, Myanmar, New Zealand, Philippines, Singapore, Thailand, and Vietnam. Leave balances, public holidays, and working-day calculations follow each employee’s assigned country office.',
};

/** ISO country code → office metadata */
const OFFICES = [
  {
    code: 'SG',
    country: 'Singapore',
    flag: '🇸🇬',
    branch: 'Singapore HQ',
    city: 'Singapore',
    address:
      '12 Marina Boulevard, #28-01, MBFC Tower 3, Singapore 018982',
    approx_staff: 18,
    is_hq: true,
  },
  {
    code: 'CN',
    country: 'China',
    flag: '🇨🇳',
    branch: 'Shanghai Office',
    city: 'Shanghai',
    address: 'Apex Global China — 100 Century Avenue, Pudong, Shanghai 200120',
    approx_staff: 6,
    is_hq: false,
  },
  {
    code: 'ID',
    country: 'Indonesia',
    flag: '🇮🇩',
    branch: 'Jakarta Office',
    city: 'Jakarta',
    address:
      'Apex Global Indonesia — Sudirman Central Business District, Jakarta 12190',
    approx_staff: 5,
    is_hq: false,
  },
  {
    code: 'JP',
    country: 'Japan',
    flag: '🇯🇵',
    branch: 'Tokyo Office',
    city: 'Tokyo',
    address: 'Apex Global Japan — 2-1-1 Marunouchi, Chiyoda-ku, Tokyo 100-0005',
    approx_staff: 4,
    is_hq: false,
  },
  {
    code: 'MY',
    country: 'Malaysia',
    flag: '🇲🇾',
    branch: 'Kuala Lumpur Office',
    city: 'Kuala Lumpur',
    address:
      'Apex Global Malaysia — Level 20, Menara Exchange 106, KL 50250',
    approx_staff: 5,
    is_hq: false,
  },
  {
    code: 'MM',
    country: 'Myanmar',
    flag: '🇲🇲',
    branch: 'Yangon Branch (Myanmar)',
    city: 'Yangon',
    address:
      'Apex Global Solutions Myanmar — Level 8, Junction City Tower, Bogyoke Aung San Rd, Yangon',
    approx_staff: 3,
    is_hq: false,
  },
  {
    code: 'NZ',
    country: 'New Zealand',
    flag: '🇳🇿',
    branch: 'Auckland Office',
    city: 'Auckland',
    address: 'Apex Global NZ — 188 Quay Street, Auckland 1010',
    approx_staff: 3,
    is_hq: false,
  },
  {
    code: 'PH',
    country: 'Philippines',
    flag: '🇵🇭',
    branch: 'Manila Office',
    city: 'Manila',
    address:
      'Apex Global Philippines — 30th Floor, One Bonifacio High Street, Taguig 1634',
    approx_staff: 5,
    is_hq: false,
  },
  {
    code: 'TH',
    country: 'Thailand',
    flag: '🇹🇭',
    branch: 'Bangkok Regional Office',
    city: 'Bangkok',
    address:
      'Apex Global Solutions (Thailand) Co., Ltd — 999/9 Rama I Rd, Pathum Wan, Bangkok 10330',
    approx_staff: 6,
    is_hq: false,
  },
  {
    code: 'VN',
    country: 'Vietnam',
    flag: '🇻🇳',
    branch: 'Ho Chi Minh City Office',
    city: 'Ho Chi Minh City',
    address:
      'Apex Global Vietnam — Bitexco Financial Tower, 2 Hai Trieu, District 1, HCMC',
    approx_staff: 5,
    is_hq: false,
  },
];

const COUNTRY_LABELS = Object.fromEntries(
  OFFICES.map((o) => [o.code, o.country])
);

const COUNTRY_FLAGS = Object.fromEntries(OFFICES.map((o) => [o.code, o.flag]));

const SUPPORTED_COUNTRY_CODES = OFFICES.map((o) => o.code);

/** Default leave policy ranges by country (demo entitlements) */
const DEFAULT_LEAVE_POLICIES = [
  { country_code: 'SG', annual_min: 14, annual_max: 24, sick_with_mc: 12, sick_no_mc: 2, carry_forward_max: 5 },
  { country_code: 'CN', annual_min: 5, annual_max: 15, sick_with_mc: 10, sick_no_mc: 0, carry_forward_max: 5 },
  { country_code: 'ID', annual_min: 12, annual_max: 12, sick_with_mc: 12, sick_no_mc: 0, carry_forward_max: 5 },
  { country_code: 'JP', annual_min: 10, annual_max: 20, sick_with_mc: 10, sick_no_mc: 0, carry_forward_max: 5 },
  { country_code: 'MY', annual_min: 12, annual_max: 14, sick_with_mc: 12, sick_no_mc: 2, carry_forward_max: 5 },
  { country_code: 'MM', annual_min: 10, annual_max: 14, sick_with_mc: 10, sick_no_mc: 0, carry_forward_max: 5 },
  { country_code: 'NZ', annual_min: 20, annual_max: 20, sick_with_mc: 10, sick_no_mc: 0, carry_forward_max: 5 },
  { country_code: 'PH', annual_min: 5, annual_max: 15, sick_with_mc: 10, sick_no_mc: 0, carry_forward_max: 5 },
  { country_code: 'TH', annual_min: 8, annual_max: 11, sick_with_mc: 30, sick_no_mc: 0, carry_forward_max: 5 },
  { country_code: 'VN', annual_min: 12, annual_max: 16, sick_with_mc: 12, sick_no_mc: 0, carry_forward_max: 5 },
];

function getCompanyProfile() {
  return {
    ...COMPANY_PROFILE,
    countries: OFFICES.map((o) => ({
      code: o.code,
      name: o.country,
      flag: o.flag,
    })),
    offices: OFFICES,
    country_labels: COUNTRY_LABELS,
  };
}

function getOfficeByCode(code) {
  if (!code) return null;
  return OFFICES.find((o) => o.code === String(code).toUpperCase()) || null;
}

function countryName(code) {
  return COUNTRY_LABELS[code] || code;
}

module.exports = {
  COMPANY_PROFILE,
  OFFICES,
  COUNTRY_LABELS,
  COUNTRY_FLAGS,
  SUPPORTED_COUNTRY_CODES,
  DEFAULT_LEAVE_POLICIES,
  getCompanyProfile,
  getOfficeByCode,
  countryName,
};

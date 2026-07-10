/**
 * Apex Global — 10 APAC offices (mirrors backend company config).
 */

export const COMPANY = {
  name: 'Apex Global Solutions Pte Ltd',
  shortName: 'Apex Global',
  staffCount: 60,
  totalCountries: 10,
  totalOffices: 10,
  hqCountry: 'Singapore',
  hqAddress:
    '12 Marina Boulevard, #28-01, Marina Bay Financial Centre Tower 3, Singapore 018982',
};

export const OFFICE_COUNTRIES = [
  { code: 'ALL', label: 'All countries', flag: '🌏' },
  { code: 'SG', label: 'Singapore', flag: '🇸🇬' },
  { code: 'CN', label: 'China', flag: '🇨🇳' },
  { code: 'ID', label: 'Indonesia', flag: '🇮🇩' },
  { code: 'JP', label: 'Japan', flag: '🇯🇵' },
  { code: 'MY', label: 'Malaysia', flag: '🇲🇾' },
  { code: 'MM', label: 'Myanmar', flag: '🇲🇲' },
  { code: 'NZ', label: 'New Zealand', flag: '🇳🇿' },
  { code: 'PH', label: 'Philippines', flag: '🇵🇭' },
  { code: 'TH', label: 'Thailand', flag: '🇹🇭' },
  { code: 'VN', label: 'Vietnam', flag: '🇻🇳' },
];

export const FLAG = Object.fromEntries(
  OFFICE_COUNTRIES.filter((c) => c.code !== 'ALL').map((c) => [c.code, c.flag])
);

export const COUNTRY_LABEL = Object.fromEntries(
  OFFICE_COUNTRIES.filter((c) => c.code !== 'ALL').map((c) => [c.code, c.label])
);

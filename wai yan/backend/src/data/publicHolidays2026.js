/**
 * 2026 public holidays for Apex Global's 10 office countries.
 * Used by seed + day-count (policyEngine excludes these for matching country_code).
 * Dates are representative national calendars for the product demo.
 */

/** @type {Array<[string, string, string, string]>} [date, country_code, name, description] */
const PUBLIC_HOLIDAYS_2026 = [
  // ── Singapore ──
  ['2026-01-01', 'SG', "New Year's Day", 'Public holiday marking the start of the calendar year. Offices closed; leave day-count excludes this date for SG staff.'],
  ['2026-02-17', 'SG', 'Chinese New Year', 'First day of the Lunar New Year. Major celebration for Chinese communities in Singapore.'],
  ['2026-02-18', 'SG', 'Chinese New Year Holiday', 'Second CNY public holiday. High leave demand for family travel.'],
  ['2026-04-03', 'SG', 'Good Friday', 'Christian observance; public holiday in Singapore.'],
  ['2026-05-01', 'SG', 'Labour Day', 'International Workers’ Day; statutory public holiday in Singapore.'],
  ['2026-05-27', 'SG', 'Vesak Day', 'Buddhist holiday commemorating the birth, enlightenment and passing of Buddha.'],
  ['2026-06-17', 'SG', 'Hari Raya Haji', 'Eid al-Adha; Islamic festival and public holiday in Singapore.'],
  ['2026-08-09', 'SG', 'National Day', 'Singapore’s National Day (independence 1965). Full office closure at HQ.'],
  ['2026-11-08', 'SG', 'Deepavali', 'Hindu festival of lights; public holiday in Singapore.'],
  ['2026-12-25', 'SG', 'Christmas Day', 'Christian holiday; often combined with year-end leave.'],

  // ── China ──
  ['2026-01-01', 'CN', "New Year's Day", 'Gregorian New Year; public holiday for China-based staff.'],
  ['2026-02-16', 'CN', 'Spring Festival Eve', 'Eve of Chinese New Year — start of the main annual leave peak for CN offices.'],
  ['2026-02-17', 'CN', 'Spring Festival (CNY Day 1)', 'Lunar New Year Day 1. Plan multi-day coverage for Shanghai office.'],
  ['2026-02-18', 'CN', 'Spring Festival (CNY Day 2)', 'Second day of Spring Festival public holiday period.'],
  ['2026-02-19', 'CN', 'Spring Festival (CNY Day 3)', 'Third day of Spring Festival public holiday period.'],
  ['2026-04-05', 'CN', 'Qingming Festival', 'Tomb-Sweeping Day; traditional family memorial holiday.'],
  ['2026-05-01', 'CN', 'Labour Day', 'International Labour Day public holiday in China.'],
  ['2026-06-19', 'CN', 'Dragon Boat Festival', 'Duanwu Festival; public holiday with traditional races and rice dumplings.'],
  ['2026-10-01', 'CN', 'National Day', 'PRC National Day — start of Golden Week; expect extended leave around this date.'],
  ['2026-10-02', 'CN', 'National Day Holiday', 'Second day of National Day Golden Week holiday.'],
  ['2026-10-03', 'CN', 'National Day Holiday', 'Third day of National Day Golden Week holiday.'],

  // ── Indonesia ──
  ['2026-01-01', 'ID', "New Year's Day", 'New Year public holiday in Indonesia.'],
  ['2026-03-20', 'ID', 'Nyepi (Balinese New Year)', 'Day of Silence; national public holiday (strongest observance in Bali).'],
  ['2026-03-21', 'ID', 'Idul Fitri Day 1', 'Eid al-Fitr first day (representative). Major multi-day leave period nationwide.'],
  ['2026-03-22', 'ID', 'Idul Fitri Day 2', 'Eid al-Fitr second day public holiday.'],
  ['2026-05-01', 'ID', 'Labour Day', 'International Labour Day in Indonesia.'],
  ['2026-05-14', 'ID', 'Ascension of Jesus Christ', 'Christian public holiday observed in Indonesia.'],
  ['2026-05-27', 'ID', 'Waisak Day', 'Buddhist Vesak public holiday in Indonesia.'],
  ['2026-06-01', 'ID', 'Pancasila Day', 'Commemorates Pancasila; national public holiday.'],
  ['2026-08-17', 'ID', 'Independence Day', 'Indonesian Independence Day (17 August 1945). Major national celebration.'],
  ['2026-12-25', 'ID', 'Christmas Day', 'Christmas public holiday in Indonesia.'],

  // ── Japan ──
  ['2026-01-01', 'JP', "New Year's Day", 'Ganjitsu — primary New Year public holiday in Japan.'],
  ['2026-01-12', 'JP', 'Coming of Age Day', 'Seijin no Hi (second Monday of January).'],
  ['2026-02-11', 'JP', 'National Foundation Day', 'Kenkoku Kinen no Hi; public holiday in Japan.'],
  ['2026-02-23', 'JP', "Emperor's Birthday", 'Tennō Tanjōbi; public holiday.'],
  ['2026-03-20', 'JP', 'Vernal Equinox Day', 'Shunbun no Hi; public holiday.'],
  ['2026-04-29', 'JP', 'Shōwa Day', 'Start of Golden Week; public holiday.'],
  ['2026-05-03', 'JP', 'Constitution Memorial Day', 'Kenpō Kinenbi; Golden Week holiday.'],
  ['2026-05-04', 'JP', 'Greenery Day', 'Midori no Hi; Golden Week holiday.'],
  ['2026-05-05', 'JP', "Children's Day", 'Kodomo no Hi; Golden Week holiday. High leave demand adjacent days.'],
  ['2026-07-20', 'JP', 'Marine Day', 'Umi no Hi (third Monday of July).'],
  ['2026-08-11', 'JP', 'Mountain Day', 'Yama no Hi; summer public holiday.'],
  ['2026-09-21', 'JP', 'Respect for the Aged Day', 'Keirō no Hi (third Monday of September).'],
  ['2026-09-22', 'JP', 'Autumnal Equinox Day', 'Shūbun no Hi; public holiday.'],
  ['2026-10-12', 'JP', 'Sports Day', 'Sports no Hi (second Monday of October).'],
  ['2026-11-03', 'JP', 'Culture Day', 'Bunka no Hi; public holiday.'],
  ['2026-11-23', 'JP', 'Labour Thanksgiving Day', 'Kinrō Kansha no Hi; public holiday.'],

  // ── Malaysia ──
  ['2026-01-01', 'MY', "New Year's Day", 'New Year public holiday in many Malaysian states.'],
  ['2026-02-01', 'MY', 'Federal Territory Day', 'Holiday in KL, Labuan and Putrajaya (not all states).'],
  ['2026-02-17', 'MY', 'Chinese New Year', 'Lunar New Year; high multi-day leave demand.'],
  ['2026-02-18', 'MY', 'Chinese New Year Holiday', 'Second CNY holiday in Malaysia.'],
  ['2026-05-01', 'MY', 'Labour Day', 'National Labour Day public holiday.'],
  ['2026-05-27', 'MY', 'Wesak Day', 'Buddhist Wesak public holiday.'],
  ['2026-06-01', 'MY', "Yang di-Pertuan Agong's Birthday", 'Birthday of the Malaysian King (Agong).'],
  ['2026-08-31', 'MY', 'National Day (Merdeka)', 'Malaysia Independence Day (Merdeka).'],
  ['2026-09-16', 'MY', 'Malaysia Day', 'Formation of Malaysia; national public holiday.'],
  ['2026-11-08', 'MY', 'Deepavali', 'Festival of lights; public holiday in many states.'],
  ['2026-12-25', 'MY', 'Christmas Day', 'Christmas public holiday on federal calendar.'],

  // ── Myanmar ──
  ['2026-01-04', 'MM', 'Independence Day', 'Myanmar Independence Day (1948). Yangon office closed.'],
  ['2026-02-12', 'MM', 'Union Day', 'Commemorates the Panglong Agreement; national public holiday.'],
  ['2026-03-02', 'MM', "Peasants' Day", 'National public holiday honouring farmers.'],
  ['2026-03-27', 'MM', 'Armed Forces Day', 'National public holiday in Myanmar.'],
  ['2026-04-13', 'MM', 'Thingyan (Water Festival) Day 1', 'Myanmar New Year water festival begins — major travel period.'],
  ['2026-04-14', 'MM', 'Thingyan Day 2', 'Second day of Thingyan public holiday period.'],
  ['2026-04-15', 'MM', 'Thingyan Day 3', 'Third day of Thingyan; plan coverage for Yangon branch.'],
  ['2026-04-16', 'MM', 'Myanmar New Year', 'Traditional Myanmar New Year Day.'],
  ['2026-05-01', 'MM', 'Labour Day', 'International Labour Day public holiday.'],
  ['2026-07-19', 'MM', "Martyrs' Day", 'Remembers the assassination of Aung San and cabinet (1947).'],
  ['2026-12-25', 'MM', 'Christmas Day', 'Observed by many private firms and multi-faith offices.'],

  // ── New Zealand ──
  ['2026-01-01', 'NZ', "New Year's Day", 'New Year public holiday in New Zealand.'],
  ['2026-01-02', 'NZ', "Day after New Year's Day", 'Statutory holiday following New Year’s Day.'],
  ['2026-02-06', 'NZ', 'Waitangi Day', 'New Zealand’s national day; public holiday.'],
  ['2026-04-03', 'NZ', 'Good Friday', 'Christian public holiday; NZ offices closed.'],
  ['2026-04-06', 'NZ', 'Easter Monday', 'Public holiday following Easter Sunday.'],
  ['2026-04-25', 'NZ', 'ANZAC Day', 'Commemorates Australian and New Zealand Army Corps.'],
  ['2026-06-01', 'NZ', "King's Birthday", 'Observed on the first Monday in June.'],
  ['2026-10-26', 'NZ', 'Labour Day', 'Fourth Monday in October; public holiday.'],
  ['2026-12-25', 'NZ', 'Christmas Day', 'Christmas public holiday in New Zealand.'],
  ['2026-12-28', 'NZ', 'Boxing Day (observed)', 'Boxing Day observed (25–26 Dec weekend adjustment for demo).'],

  // ── Philippines ──
  ['2026-01-01', 'PH', "New Year's Day", 'New Year public holiday in the Philippines.'],
  ['2026-04-02', 'PH', 'Maundy Thursday', 'Holy Week holiday; many firms closed.'],
  ['2026-04-03', 'PH', 'Good Friday', 'Holy Week public holiday in the Philippines.'],
  ['2026-04-09', 'PH', 'Araw ng Kagitingan', 'Day of Valor; national public holiday.'],
  ['2026-05-01', 'PH', 'Labour Day', 'International Labour Day public holiday.'],
  ['2026-06-12', 'PH', 'Independence Day', 'Philippine Independence Day (1898).'],
  ['2026-08-21', 'PH', 'Ninoy Aquino Day', 'Special non-working holiday commemorating Benigno Aquino Jr.'],
  ['2026-08-31', 'PH', 'National Heroes Day', 'Last Monday of August; national public holiday.'],
  ['2026-11-30', 'PH', 'Bonifacio Day', 'Birth of Andrés Bonifacio; public holiday.'],
  ['2026-12-25', 'PH', 'Christmas Day', 'Major holiday; peak year-end leave season.'],
  ['2026-12-30', 'PH', 'Rizal Day', 'Commemorates José Rizal; public holiday.'],

  // ── Thailand ──
  ['2026-01-01', 'TH', "New Year's Day", 'Thai public holiday for the international New Year.'],
  ['2026-02-26', 'TH', 'Makha Bucha', 'Important Buddhist holy day; public holiday.'],
  ['2026-04-06', 'TH', 'Chakri Memorial Day', 'Founding of the Chakri dynasty; official public holiday.'],
  ['2026-04-13', 'TH', 'Songkran (Day 1)', 'Thai New Year water festival begins — high leave demand.'],
  ['2026-04-14', 'TH', 'Songkran (Day 2)', 'Second Songkran public holiday day.'],
  ['2026-04-15', 'TH', 'Songkran (Day 3)', 'Final Songkran public holiday day for demo calendar.'],
  ['2026-05-01', 'TH', 'Labour Day', 'International Labour Day in Thailand.'],
  ['2026-05-04', 'TH', 'Coronation Day', 'Coronation of King Rama X; official public holiday.'],
  ['2026-06-03', 'TH', "Queen Suthida's Birthday", 'Official holiday for the Queen’s birthday.'],
  ['2026-07-28', 'TH', "King's Birthday", 'Birthday of King Rama X; national public holiday.'],
  ['2026-08-12', 'TH', "Mother's Day / Queen Mother's Birthday", 'Mother’s Day in Thailand; public holiday.'],
  ['2026-10-13', 'TH', 'King Bhumibol Memorial Day', 'Remembers King Bhumibol Adulyadej.'],
  ['2026-12-05', 'TH', "Father's Day / King Bhumibol's Birthday", 'Father’s Day; public holiday across Thailand.'],
  ['2026-12-10', 'TH', 'Constitution Day', 'Commemorates Thailand’s constitution.'],
  ['2026-12-31', 'TH', "New Year's Eve", 'Often observed as a public / substitute holiday.'],

  // ── Vietnam ──
  ['2026-01-01', 'VN', "New Year's Day", 'Gregorian New Year public holiday in Vietnam.'],
  ['2026-02-16', 'VN', 'Tết (Lunar New Year Eve)', 'Start of Tết holiday period — main annual leave peak for VN staff.'],
  ['2026-02-17', 'VN', 'Tết (Day 1)', 'First day of Vietnamese Lunar New Year.'],
  ['2026-02-18', 'VN', 'Tết (Day 2)', 'Second day of Tết public holiday.'],
  ['2026-02-19', 'VN', 'Tết (Day 3)', 'Third day of Tết public holiday.'],
  ['2026-04-30', 'VN', 'Reunification Day', 'Liberation / Reunification Day; national public holiday.'],
  ['2026-05-01', 'VN', 'Labour Day', 'International Labour Day; often combined with 30 Apr leave.'],
  ['2026-09-02', 'VN', 'National Day', 'Vietnam National Day (independence 1945).'],
  ['2026-09-03', 'VN', 'National Day Holiday', 'Additional National Day holiday (representative).'],
];

module.exports = { PUBLIC_HOLIDAYS_2026 };

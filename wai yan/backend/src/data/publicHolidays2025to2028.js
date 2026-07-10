/**
 * Static public-holiday baseline for the 10 supported office countries, 2025-2028.
 * These fixed-date statutory holidays make a new install useful offline; missing
 * movable/lunar dates are refreshed by holidayService when an uncached year is requested.
 */
const FIXED_HOLIDAYS = {
  CN: [['01-01', "New Year's Day"], ['05-01', 'Labour Day'], ['10-01', 'National Day']],
  ID: [['01-01', "New Year's Day"], ['05-01', 'Labour Day'], ['08-17', 'Independence Day'], ['12-25', 'Christmas Day']],
  JP: [['01-01', "New Year's Day"], ['02-11', 'National Foundation Day'], ['02-23', "Emperor's Birthday"], ['04-29', 'Sh?wa Day'], ['05-03', 'Constitution Memorial Day'], ['05-05', "Children's Day"], ['11-03', 'Culture Day'], ['11-23', 'Labour Thanksgiving Day']],
  MY: [['01-01', "New Year's Day"], ['05-01', 'Labour Day'], ['08-31', 'National Day'], ['09-16', 'Malaysia Day'], ['12-25', 'Christmas Day']],
  MM: [['01-04', 'Independence Day'], ['02-12', 'Union Day'], ['03-02', "Peasants' Day"], ['03-27', 'Armed Forces Day'], ['05-01', 'Labour Day'], ['07-19', "Martyrs' Day"], ['12-25', 'Christmas Day']],
  NZ: [['01-01', "New Year's Day"], ['01-02', "Day after New Year's Day"], ['02-06', 'Waitangi Day'], ['04-25', 'ANZAC Day'], ['12-25', 'Christmas Day'], ['12-26', 'Boxing Day']],
  PH: [['01-01', "New Year's Day"], ['04-09', 'Araw ng Kagitingan'], ['05-01', 'Labour Day'], ['06-12', 'Independence Day'], ['08-21', 'Ninoy Aquino Day'], ['11-30', 'Bonifacio Day'], ['12-25', 'Christmas Day'], ['12-30', 'Rizal Day']],
  SG: [['01-01', "New Year's Day"], ['05-01', 'Labour Day'], ['08-09', 'National Day'], ['12-25', 'Christmas Day']],
  TH: [['01-01', "New Year's Day"], ['04-06', 'Chakri Memorial Day'], ['05-01', 'Labour Day'], ['05-04', 'Coronation Day'], ['07-28', "King's Birthday"], ['08-12', "Mother's Day"], ['10-13', 'King Bhumibol Memorial Day'], ['12-05', "Father's Day"], ['12-10', 'Constitution Day']],
  VN: [['01-01', "New Year's Day"], ['04-30', 'Reunification Day'], ['05-01', 'Labour Day'], ['09-02', 'National Day']],
};

const PUBLIC_HOLIDAYS_2025_TO_2028 = [2025, 2026, 2027, 2028].flatMap((year) =>
  Object.entries(FIXED_HOLIDAYS).flatMap(([countryCode, holidays]) =>
    holidays.map(([monthDay, holidayName]) => [
      `${year}-${monthDay}`,
      countryCode,
      holidayName,
      `Static baseline public holiday for ${countryCode}.`,
    ])
  )
);

module.exports = { PUBLIC_HOLIDAYS_2025_TO_2028 };

const { success } = require('../utils/response');
const { appError } = require('../middleware/errorHandler');
const holidayService = require('../services/holidayService');
const { SUPPORTED_COUNTRY_CODES } = require('../config/company');

async function loadHolidays(req, res) {
  const countryCode = String(req.body?.country_code || '').trim().toUpperCase();
  const yearFrom = Number(req.body?.year_from);
  const yearTo = Number(req.body?.year_to);
  if (!SUPPORTED_COUNTRY_CODES.includes(countryCode)) {
    throw appError('VALIDATION_ERROR', 'country_code must be one of the supported office countries');
  }
  if (!Number.isInteger(yearFrom) || !Number.isInteger(yearTo) || yearFrom < 1 || yearTo < yearFrom) {
    throw appError('VALIDATION_ERROR', 'year_from and year_to must be a valid ascending range');
  }
  const data = await holidayService.loadRange(countryCode, yearFrom, yearTo);
  return success(res, data);
}

module.exports = { loadHolidays };

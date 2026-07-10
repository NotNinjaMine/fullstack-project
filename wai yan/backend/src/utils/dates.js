/**
 * Normalize date values from pg / PGlite (Date | string) to YYYY-MM-DD.
 */
function toDateOnly(value) {
  if (value == null) return null;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value);
  // ISO or YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return s.slice(0, 10);
}

function yearFromDate(value) {
  const iso = toDateOnly(value);
  const year = Number(iso && iso.slice(0, 4));
  if (!Number.isFinite(year)) {
    throw new Error(`Invalid date for year extraction: ${value}`);
  }
  return year;
}

module.exports = { toDateOnly, yearFromDate };

import dayjs from "dayjs";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const nextWeekday = (from, targetDow) => {
  let d = from.add(1, "day");
  while (d.day() !== targetDow) d = d.add(1, "day");
  return d;
};

// AI-1 fallback parser: no hosted LLM configured, so plain keyword/regex
// extraction pre-fills the form the same way the real AI service would.
export function parseNaturalLanguage(text) {
  const t = text.toLowerCase();
  const now = dayjs();

  let leaveType = "annual";
  if (t.includes("birthday")) {
    leaveType = "birthday";
  } else if (t.includes("maternity")) {
    leaveType = "maternity";
  } else if (t.includes("paternity")) {
    leaveType = "paternity";
  } else if (t.includes("childcare") || t.includes("child care")) {
    leaveType = "childcare";
  } else if (t.includes("shared parental") || t.includes("shared-parental")) {
    leaveType = "shared_parental";
  } else if (t.includes("compassionate") || t.includes("bereavement")) {
    leaveType = "compassionate";
  } else if (t.includes("hospital")) {
    leaveType = "hospitalisation";
  } else if (t.includes("national service") || t.includes("reservist") || t.includes(" ns ")) {
    leaveType = "national_service";
  } else if (t.includes("exam") || t.includes("study leave") || t.includes("studying")) {
    leaveType = "study_exam";
  } else if (t.includes("unpaid") || t.includes("no pay") || t.includes("without pay")) {
    leaveType = "unpaid";
  } else if (t.includes("sick") || t.includes("mc") || t.includes("unwell") || t.includes("fever")) {
    leaveType = t.includes("no mc") || t.includes("without mc") ? "sick_nomc" : "sick_mc";
  }

  const halfDay = /half[\s-]?day/.test(t);

  let startDate = null;
  let endDate = null;

  // "20 Jul to 24 Jul" / "20 Jul - 24 Jul"
  const rangeMatch = t.match(
    /(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(?:to|-|–|until)\s*(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/
  );
  if (rangeMatch) {
    const [, d1, m1, d2, m2] = rangeMatch;
    const mk = (day, mon) => {
      const monthIdx = MONTHS.indexOf(mon);
      let d = dayjs(new Date(now.year(), monthIdx, Number(day)));
      if (d.isBefore(now, "day")) d = d.add(1, "year");
      return d;
    };
    startDate = mk(d1, m1).format("YYYY-MM-DD");
    endDate = mk(d2, m2).format("YYYY-MM-DD");
  } else if (t.includes("tomorrow")) {
    startDate = endDate = now.add(1, "day").format("YYYY-MM-DD");
  } else if (t.includes("today")) {
    startDate = endDate = now.format("YYYY-MM-DD");
  } else {
    const nextDayMatch = WEEKDAYS.findIndex((w) => t.includes(w));
    if (nextDayMatch !== -1) {
      startDate = endDate = nextWeekday(now, nextDayMatch).format("YYYY-MM-DD");
    } else {
      // No recognisable date — default to tomorrow so the form isn't left empty
      startDate = endDate = now.add(1, "day").format("YYYY-MM-DD");
    }
  }

  return {
    startDate,
    endDate,
    leaveType,
    halfDay,
    reason: text.trim(),
  };
}

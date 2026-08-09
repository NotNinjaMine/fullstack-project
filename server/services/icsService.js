// M2 (UC-14, Enhanced): iCalendar (.ics) export of approved leave, so an employee
// can drop the dates into Google Calendar / Outlook.
//
// Hand-rolled RFC 5545 output — no new runtime dependency (the `ics` package in
// the HLD is not installed and the repo rule is "add no new runtime deps").
// Pure functions: easy to unit-test, no DB access.

const PRODID = "-//Innovare//Leave Management System//EN";

// RFC 5545 escaping for TEXT values: backslash, semicolon, comma, newline.
const escapeText = (s) =>
    String(s || "")
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")
        .replace(/\r?\n/g, "\\n");

const compact = (iso) => String(iso).replace(/-/g, "");

const stampUTC = (d = new Date()) =>
    `${d.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`;

const addOneDay = (iso) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
};

// Half-days become timed events. SGT (UTC+8) office hours expressed in UTC so no
// VTIMEZONE block is needed: AM 09:00–13:00 SGT = 01:00–05:00Z, PM 13:00–18:00
// SGT = 05:00–10:00Z.
const HALF_DAY_UTC = {
    AM: { start: "010000Z", end: "050000Z" },
    PM: { start: "050000Z", end: "100000Z" }
};

// Fold lines at 75 octets as required by RFC 5545 (continuation lines start with
// a single space).
const foldLine = (line) => {
    if (line.length <= 75) return line;
    const parts = [line.slice(0, 75)];
    let rest = line.slice(75);
    while (rest.length > 74) {
        parts.push(` ${rest.slice(0, 74)}`);
        rest = rest.slice(74);
    }
    if (rest.length) parts.push(` ${rest}`);
    return parts.join("\r\n");
};

/**
 * Build a single-event VCALENDAR for one approved leave request.
 * request: { id, startDate, endDate, halfDay, halfDayPeriod, reason, leaveType, days }
 * options: { employeeName, typeLabel, now }
 */
const buildIcs = (request, { employeeName = "", typeLabel = "", now = new Date() } = {}) => {
    const label = typeLabel || request.leaveType || "Leave";
    const summary = employeeName ? `${label} — ${employeeName}` : label;
    const description = [
        `Leave request REQ-${request.id}`,
        request.reason ? `Reason: ${request.reason}` : null,
        `Deducted: ${Number(request.days)} day(s)`,
        request.halfDay ? `Half-day (${request.halfDayPeriod || "AM"}), Singapore office hours` : null,
        "Approved in the Innovare Leave Management System."
    ].filter(Boolean).join("\n");

    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        `PRODID:${PRODID}`,
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        `UID:leave-${request.id}@innovare-lms`,
        `DTSTAMP:${stampUTC(now)}`,
        `SUMMARY:${escapeText(summary)}`,
        `DESCRIPTION:${escapeText(description)}`,
        "STATUS:CONFIRMED",
        "TRANSP:OPAQUE"
    ];

    if (request.halfDay) {
        const slot = HALF_DAY_UTC[request.halfDayPeriod === "PM" ? "PM" : "AM"];
        lines.push(`DTSTART:${compact(request.startDate)}T${slot.start}`);
        lines.push(`DTEND:${compact(request.startDate)}T${slot.end}`);
    } else {
        // All-day events use an EXCLUSIVE end date, so add one day.
        lines.push(`DTSTART;VALUE=DATE:${compact(request.startDate)}`);
        lines.push(`DTEND;VALUE=DATE:${compact(addOneDay(request.endDate))}`);
    }

    lines.push("END:VEVENT", "END:VCALENDAR");
    return lines.map(foldLine).join("\r\n") + "\r\n";
};

const icsFilename = (request) => `leave-REQ-${request.id}-${request.startDate}.ics`;

module.exports = { buildIcs, icsFilename, escapeText, addOneDay, HALF_DAY_UTC };

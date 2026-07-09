import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { fmt } from "../../lib/dates";
import { applyLeave, checkOverlap } from "../../services/leaveService";
import { parseLeaveText } from "../../services/aiService";
import { LEAVE_TYPES, nextBirthdayOn } from "../../lib/leaveTypes";
import useAuth from "../../hooks/useAuth";
import OverlapWarningBanner from "./OverlapWarningBanner";

const AI1_EXAMPLES = [
  "I need next Monday off for a family event",
  "Half day tomorrow afternoon, dental appointment",
  "Annual leave from 20 Jul to 24 Jul because of a trip home",
  "Feeling unwell, taking sick leave today, will get an MC",
];

// Date picker + leave type selector + AI-1 natural-language input (UC-01)
export default function LeaveApplicationForm({ leaveTypeOptions, onSubmitted }) {
  const { user } = useAuth();
  const [leaveType, setLeaveType] = useState(leaveTypeOptions[0]?.id ?? "annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [halfDay, setHalfDay] = useState(false);
  const [halfDayPeriod, setHalfDayPeriod] = useState("AM");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [nlText, setNlText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsedJSON, setParsedJSON] = useState(null);
  const [coverage, setCoverage] = useState(null);

  const typeDef = LEAVE_TYPES.find((t) => t.id === leaveType);

  // Birthday leave is fixed to the employee's actual birthday — pin the
  // date range to it instead of asking the user to guess the right day.
  useEffect(() => {
    if (typeDef?.fixedToBirthday && user?.dateOfBirth) {
      const bday = nextBirthdayOn(user.dateOfBirth);
      setStartDate(bday);
      setEndDate(bday);
      setHalfDay(false);
    }
  }, [typeDef, user]);

  // Half-day is single-day only, and unavailable for types that forbid it
  useEffect(() => {
    if (halfDay && ((startDate && endDate && startDate !== endDate) || typeDef?.noHalfDay)) {
      setHalfDay(false);
    }
  }, [startDate, endDate, halfDay, typeDef]);

  // AI-2: ask the server for a coverage check whenever the range changes
  useEffect(() => {
    if (!startDate || !endDate || startDate > endDate) {
      setCoverage(null);
      return;
    }
    checkOverlap(startDate, endDate)
      .then(setCoverage)
      .catch(() => setCoverage(null));
  }, [startDate, endDate]);

  const requestedDays = halfDay ? 0.5 : coverage?.days ?? 0;
  const conflicts = coverage?.conflicts ?? [];

  const handleParse = () => {
    if (!nlText.trim()) return;
    setParsing(true);
    setParsedJSON(null);
    parseLeaveText(nlText)
      .then((result) => {
        setParsedJSON(result);
        if (result.startDate) setStartDate(result.startDate);
        if (result.endDate) setEndDate(result.endDate);
        if (result.leaveType) setLeaveType(result.leaveType);
        setHalfDay(!!result.halfDay && result.startDate === result.endDate);
        if (result.reason) setReason(result.reason);
      })
      .catch((err) => toast.error(err.response?.data?.message || "AI parse failed."))
      .finally(() => setParsing(false));
  };

  const handleSubmit = () => {
    setSubmitting(true);
    setFormError("");
    applyLeave({
      leaveType,
      startDate,
      endDate,
      halfDay,
      halfDayPeriod: halfDay ? halfDayPeriod : null,
      reason: reason.trim(),
    })
      .then((res) => {
        toast.success(
          res.flagged
            ? "Submitted — flagged: coverage below threshold, Manager special approval required."
            : "Submitted. Routed to your Supervisor, then Manager (two-tier approval)."
        );
        setStartDate("");
        setEndDate("");
        setHalfDay(false);
        setReason("");
        setNlText("");
        setParsedJSON(null);
        setCoverage(null);
        onSubmitted?.();
      })
      .catch((err) => {
        setFormError(
          err.response?.data?.message ||
            (err.response?.data?.errors || []).join("; ") ||
            "Submission failed."
        );
      })
      .finally(() => setSubmitting(false));
  };

  const holidaysSkipped = coverage?.holidaysSkipped ?? [];

  const canSubmit =
    startDate &&
    endDate &&
    startDate <= endDate &&
    (halfDay || (coverage?.days ?? 0) > 0) &&
    reason.trim().length >= 3 &&
    !submitting;

  return (
    <div className="space-y-6">
      {/* AI-1 panel */}
      <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-teal-600">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Apply in plain English</h2>
          <span className="text-xs bg-teal-100 text-teal-800 rounded-full px-2 py-0.5">
            AI-1 · Natural-language input
          </span>
        </div>
        <textarea
          value={nlText}
          onChange={(e) => setNlText(e.target.value)}
          rows={2}
          placeholder='e.g. "I need next Monday off for a family event"'
          className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
        <div className="flex flex-wrap gap-2 mt-2">
          {AI1_EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setNlText(ex)}
              className="text-xs bg-slate-100 hover:bg-slate-200 rounded-full px-3 py-1 text-slate-600"
            >
              {ex}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={handleParse}
            disabled={parsing || !nlText.trim()}
            className="bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            {parsing ? "Parsing…" : "Parse & pre-fill form"}
          </button>
          {parsing && <span className="text-xs text-slate-500">Calling AI service…</span>}
        </div>
        {parsedJSON && (
          <pre className="mt-3 bg-slate-900 text-teal-300 text-xs rounded-lg p-3 overflow-x-auto">
{JSON.stringify(parsedJSON, null, 2)}
          </pre>
        )}
      </div>

      {/* application form */}
      <div className="bg-white rounded-xl shadow-sm p-5">
        <h2 className="font-semibold mb-4">Leave application</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block sm:col-span-2">
            <span className="text-sm text-slate-600">Leave type</span>
            <select
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {leaveTypeOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} — {t.uncapped ? "unpaid, no cap" : `${t.available} day(s) available`}
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-400">
              Leave type cannot be changed after submission — cancel and re-apply instead.
            </span>
          </label>

          <label className="block">
            <span className="text-sm text-slate-600">Start date</span>
            <input
              type="date"
              value={startDate}
              disabled={!!typeDef?.fixedToBirthday}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (!endDate || e.target.value > endDate) setEndDate(e.target.value);
              }}
              className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100 disabled:text-slate-500"
            />
          </label>

          <label className="block">
            <span className="text-sm text-slate-600">End date</span>
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              disabled={!!typeDef?.fixedToBirthday}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100 disabled:text-slate-500"
            />
          </label>

          {typeDef?.fixedToBirthday && (
            <p className="sm:col-span-2 text-xs text-slate-400 -mt-2">
              Birthday leave is fixed to your next birthday, {fmt(startDate)} — it can't be moved to
              another date.
            </p>
          )}

          <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
            <label
              className={`inline-flex items-center gap-2 text-sm ${
                (startDate && endDate && startDate !== endDate) || typeDef?.noHalfDay
                  ? "text-slate-300"
                  : "text-slate-700"
              }`}
            >
              <input
                type="checkbox"
                checked={halfDay}
                disabled={!!(startDate && endDate && startDate !== endDate) || !!typeDef?.noHalfDay}
                onChange={(e) => setHalfDay(e.target.checked)}
                className="w-4 h-4 accent-teal-700"
              />
              Half-day (single-day requests only — no hourly increments)
            </label>
            {halfDay && (
              <div className="inline-flex rounded-lg overflow-hidden border border-slate-300">
                {["AM", "PM"].map((p) => (
                  <button
                    key={p}
                    onClick={() => setHalfDayPeriod(p)}
                    className={`px-3 py-1 text-sm ${
                      halfDayPeriod === p ? "bg-teal-700 text-white" : "bg-white text-slate-600"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>

          <label className="block sm:col-span-2">
            <span className="text-sm text-slate-600">Reason</span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Short reason for your supervisor"
              className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </label>
        </div>

        {startDate && endDate && startDate <= endDate && coverage && (
          <div className="mt-4 bg-slate-50 rounded-lg p-3 text-sm text-slate-600">
            <p>
              <span className="font-medium text-slate-800">{requestedDays}</span> day(s) will be
              deducted ({fmt(startDate)} – {fmt(endDate)}
              {halfDay ? `, ${halfDayPeriod} half-day` : ""}). Weekends and public holidays are
              excluded automatically.
            </p>
            {holidaysSkipped.length > 0 && (
              <p className="mt-1 text-amber-700">
                Skipped public holiday{holidaysSkipped.length > 1 ? "s" : ""}:{" "}
                {holidaysSkipped.map((h) => `${h.name} (${fmt(h.date)})`).join(", ")} — not
                deducted from your balance.
              </p>
            )}
          </div>
        )}

        {formError && (
          <div className="mt-4 bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-700">
            ⚠ {formError}
          </div>
        )}

        <OverlapWarningBanner
          coverage={coverage}
          onUseAlternative={(alt) => {
            setStartDate(alt.start);
            setEndDate(alt.end);
          }}
        />

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="mt-5 w-full sm:w-auto bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 text-white font-medium rounded-lg px-6 py-2.5"
        >
          {submitting
            ? "Submitting…"
            : conflicts.length > 0
            ? "Submit anyway (flag for special approval)"
            : "Submit for approval"}
        </button>
        <p className="text-xs text-slate-400 mt-2">
          Routing: Supervisor → Manager. Two-tier approval, no auto-approval.
        </p>
      </div>
    </div>
  );
}

import { useState, useEffect, useMemo, useCallback } from "react";
import http from "../lib/http";
import { toISO, isWeekend, fmt, monthCells } from "../lib/dates";

const LEAVE_TYPES = [
  { id: "annual", label: "Annual Leave" },
  { id: "sick_mc", label: "Sick Leave (with MC)" },
  { id: "sick_nomc", label: "Sick Leave (without MC)" },
];
const typeLabel = (id) => LEAVE_TYPES.find((t) => t.id === id)?.label ?? id;

const AI1_EXAMPLES = [
  "I need next Monday off for a family event",
  "Half day tomorrow afternoon, dental appointment",
  "Annual leave from 20 Jul to 24 Jul because of a trip home",
  "Feeling unwell, taking sick leave today, will get an MC",
];

const statusLabel = (r) =>
  ({
    PENDING_SUPERVISOR: r.flagged ? "Pending Supervisor · flagged" : "Pending Supervisor",
    PENDING_MANAGER: r.flagged ? "Pending Manager · special approval" : "Pending Manager",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    CANCELLED: "Cancelled",
  }[r.status]);

const statusChipClass = (r) =>
  r.status === "APPROVED"
    ? "bg-emerald-100 text-emerald-800"
    : r.status === "REJECTED"
    ? "bg-rose-100 text-rose-700"
    : r.status === "CANCELLED"
    ? "bg-slate-100 text-slate-500"
    : r.flagged
    ? "bg-orange-100 text-orange-800"
    : "bg-amber-100 text-amber-800";

export default function Employee({ user, setToast }) {
  /* ---- server data ---- */
  const [balances, setBalances] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [team, setTeam] = useState([]);
  const [approvedLeaves, setApprovedLeaves] = useState([]);
  const [myRequests, setMyRequests] = useState([]);

  /* ---- form state ---- */
  const [leaveType, setLeaveType] = useState("annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [halfDay, setHalfDay] = useState(false);
  const [halfDayPeriod, setHalfDayPeriod] = useState("AM");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  /* ---- AI state ---- */
  const [nlText, setNlText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsedJSON, setParsedJSON] = useState(null);
  const [coverage, setCoverage] = useState(null); // AI-2 result from server

  const [calMonth, setCalMonth] = useState(new Date());

  const holidaySet = useMemo(() => new Set(holidays.map((h) => h.date)), [holidays]);
  const holidayName = (iso) => holidays.find((h) => h.date === iso)?.name;

  const loadAll = useCallback(() => {
    http.get("/leave/balances").then((res) => setBalances(res.data));
    http.get("/holiday").then((res) => setHolidays(res.data));
    http.get("/leave/team-calendar").then((res) => {
      setTeam(res.data.team);
      setApprovedLeaves(res.data.approved);
    });
    http.get("/leave/mine").then((res) => setMyRequests(res.data));
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Keep half-day valid only for single-day requests
  useEffect(() => {
    if (halfDay && startDate && endDate && startDate !== endDate) setHalfDay(false);
  }, [startDate, endDate, halfDay]);

  // AI-2: ask the SERVER for a coverage check whenever the range changes
  useEffect(() => {
    if (!startDate || !endDate || startDate > endDate) {
      setCoverage(null);
      return;
    }
    http
      .post("/leave/coverage-check", { startDate, endDate })
      .then((res) => setCoverage(res.data))
      .catch(() => setCoverage(null));
  }, [startDate, endDate]);

  /* ---- derived ---- */
  const balanceOf = (typeId) => balances.find((b) => b.leaveType === typeId);
  const remaining = (typeId) => {
    const b = balanceOf(typeId);
    if (!b) return 0;
    return Number(b.entitled) + Number(b.carried) - Number(b.used);
  };
  const pendingDays = (typeId) =>
    myRequests
      .filter(
        (r) =>
          ["PENDING_SUPERVISOR", "PENDING_MANAGER"].includes(r.status) && r.leaveType === typeId
      )
      .reduce((s, r) => s + Number(r.days), 0);

  const requestedDays = halfDay ? 0.5 : coverage?.days ?? 0;

  const memberById = (id) => team.find((t) => t.id === id);
  const offOn = (iso) =>
    approvedLeaves.filter((l) => iso >= l.startDate && iso <= l.endDate).map((l) => l.userId);

  /* ---- handlers ---- */
  const handleParse = () => {
    if (!nlText.trim()) return;
    setParsing(true);
    setParsedJSON(null);
    // AI-1 runs on the server (hosted LLM or heuristic fallback)
    http
      .post("/ai/parse", { text: nlText })
      .then((res) => {
        const result = res.data;
        setParsedJSON(result);
        if (result.startDate) setStartDate(result.startDate);
        if (result.endDate) setEndDate(result.endDate);
        if (result.leaveType) setLeaveType(result.leaveType);
        setHalfDay(!!result.halfDay && result.startDate === result.endDate);
        if (result.reason) setReason(result.reason);
      })
      .catch((err) => setToast(err.response?.data?.message || "AI parse failed."))
      .finally(() => setParsing(false));
  };

  const handleSubmit = () => {
    setSubmitting(true);
    setFormError("");
    http
      .post("/leave/apply", {
        leaveType,
        startDate,
        endDate,
        halfDay,
        halfDayPeriod: halfDay ? halfDayPeriod : null,
        reason: reason.trim(),
      })
      .then((res) => {
        setToast(
          res.data.flagged
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
        loadAll();
      })
      .catch((err) => {
        const msg =
          err.response?.data?.message ||
          (err.response?.data?.errors || []).join("; ") ||
          "Submission failed.";
        setFormError(msg);
      })
      .finally(() => setSubmitting(false));
  };

  const handleCancel = (id) => {
    http
      .put(`/leave/${id}/cancel`)
      .then((res) => {
        setToast(res.data.message);
        loadAll();
      })
      .catch((err) => setToast(err.response?.data?.message || "Cancel failed."));
  };

  const inSelectedRange = (iso) =>
    startDate && endDate && startDate <= endDate && iso >= startDate && iso <= endDate;

  const conflicts = coverage?.conflicts ?? [];
  const canSubmit =
    startDate &&
    endDate &&
    startDate <= endDate &&
    (halfDay || (coverage?.days ?? 0) > 0) &&
    reason.trim().length >= 3 &&
    !submitting;

  const monthLabel = calMonth.toLocaleDateString("en-SG", { month: "long", year: "numeric" });
  const holidaysSkipped = useMemo(() => {
    if (!startDate || !endDate || startDate > endDate) return [];
    return holidays.filter((h) => h.date >= startDate && h.date <= endDate);
  }, [startDate, endDate, holidays]);

  return (
    <main className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* ================= LEFT ================= */}
      <section className="lg:col-span-3 space-y-6">
        {/* balances */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {LEAVE_TYPES.map((t) => {
            const b = balanceOf(t.id);
            const rem = remaining(t.id);
            const pend = pendingDays(t.id);
            return (
              <div key={t.id} className="bg-white rounded-xl shadow-sm p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">{t.label}</p>
                <p className="text-3xl font-semibold text-teal-800 mt-1">
                  {rem - pend}
                  <span className="text-sm font-normal text-slate-400"> days left</span>
                </p>
                {b && (
                  <p className="text-xs text-slate-500 mt-1">
                    {Number(b.entitled)} entitled
                    {Number(b.carried) > 0 ? ` + ${Number(b.carried)} carried` : ""} ·{" "}
                    {Number(b.used)} used{pend > 0 ? ` · ${pend} pending` : ""}
                  </p>
                )}
              </div>
            );
          })}
        </div>

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
                {LEAVE_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label} — {remaining(t.id) - pendingDays(t.id)} day(s) available
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
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (!endDate || e.target.value > endDate) setEndDate(e.target.value);
                }}
                className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </label>

            <label className="block">
              <span className="text-sm text-slate-600">End date</span>
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </label>

            <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
              <label
                className={`inline-flex items-center gap-2 text-sm ${
                  startDate && endDate && startDate !== endDate ? "text-slate-300" : "text-slate-700"
                }`}
              >
                <input
                  type="checkbox"
                  checked={halfDay}
                  disabled={!!(startDate && endDate && startDate !== endDate)}
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

          {/* computed summary */}
          {startDate && endDate && startDate <= endDate && coverage && (
            <div className="mt-4 bg-slate-50 rounded-lg p-3 text-sm text-slate-600">
              <p>
                <span className="font-medium text-slate-800">{requestedDays}</span> day(s) will be
                deducted ({fmt(startDate)} → {fmt(endDate)}
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

          {/* AI-2 warning (server-computed) */}
          {conflicts.length > 0 && (
            <div className="mt-4 bg-amber-50 border border-amber-300 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-amber-900 text-sm">Team coverage warning</h3>
                <span className="text-xs bg-amber-200 text-amber-900 rounded-full px-2 py-0.5">
                  AI-2 · Smart Coverage Analyzer
                </span>
              </div>
              <p className="text-sm text-amber-900 mt-2">
                If this leave is approved, your team drops below the minimum of{" "}
                {coverage.minPresent} of {coverage.teamSize} members present on {conflicts.length}{" "}
                day(s):
              </p>
              <ul className="mt-2 space-y-1 text-sm text-amber-900">
                {conflicts.map((c) => (
                  <li key={c.date}>
                    • <span className="font-medium">{fmt(c.date)}</span> — {c.explanation}
                  </li>
                ))}
              </ul>
              {coverage.alternative && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <p className="text-sm text-amber-900">
                    Nearest range with full coverage:{" "}
                    <span className="font-medium">
                      {fmt(coverage.alternative.start)} → {fmt(coverage.alternative.end)}
                    </span>
                  </p>
                  <button
                    onClick={() => {
                      setStartDate(coverage.alternative.start);
                      setEndDate(coverage.alternative.end);
                    }}
                    className="text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-3 py-1.5"
                  >
                    Use suggested dates
                  </button>
                </div>
              )}
              <p className="text-xs text-amber-800 mt-3">
                You may still submit — the request will be flagged for Manager special approval per
                company policy.
              </p>
            </div>
          )}

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

        {/* my requests (UC-08) */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold mb-3">My requests (past 12 months)</h2>
          {myRequests.length === 0 && (
            <p className="text-sm text-slate-400">No requests yet — your history appears here.</p>
          )}
          <ul className="divide-y divide-slate-100">
            {myRequests.map((r) => (
              <li key={r.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">
                    {typeLabel(r.leaveType)} · {fmt(r.startDate)}
                    {r.endDate !== r.startDate ? ` → ${fmt(r.endDate)}` : ""}{" "}
                    {r.halfDay ? `(${r.halfDayPeriod} half-day)` : ""}
                    <span className="text-slate-400 font-normal"> · {Number(r.days)}d</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    REQ-{r.id} · {r.reason}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs rounded-full px-2.5 py-1 ${statusChipClass(r)}`}>
                    {statusLabel(r)}
                  </span>
                  {["PENDING_SUPERVISOR", "PENDING_MANAGER"].includes(r.status) && (
                    <button
                      onClick={() => handleCancel(r.id)}
                      className="text-xs text-rose-600 hover:text-rose-700 underline"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ================= RIGHT: team calendar ================= */}
      <section className="lg:col-span-2 space-y-6">
        <div className="bg-white rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold">Team availability</h2>
            <div className="flex gap-1">
              <button
                onClick={() =>
                  setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))
                }
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600"
              >
                ‹
              </button>
              <button
                onClick={() =>
                  setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))
                }
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600"
              >
                ›
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            {monthLabel} · dates only, per staff access rules (UC-08)
          </p>

          <div className="grid grid-cols-7 text-center text-xs text-slate-400 mb-1">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthCells(calMonth).map((d, i) => {
              if (!d) return <div key={`pad-${i}`} />;
              const iso = toISO(d);
              const ph = holidayName(iso);
              const off = offOn(iso);
              const selected = inSelectedRange(iso);
              const weekend = isWeekend(d);
              const isToday = iso === toISO(new Date());
              return (
                <div
                  key={iso}
                  title={[
                    ph ? `Public holiday: ${ph}` : null,
                    ...off.map((id) => `${memberById(id)?.name} away`),
                  ]
                    .filter(Boolean)
                    .join("\n")}
                  className={`min-h-12 rounded-lg p-1 text-left border ${
                    selected
                      ? "border-teal-600 bg-teal-50"
                      : ph
                      ? "border-amber-300 bg-amber-50"
                      : weekend
                      ? "border-transparent bg-slate-50"
                      : "border-transparent bg-white"
                  }`}
                >
                  <p
                    className={`text-xs ${
                      isToday
                        ? "w-5 h-5 flex items-center justify-center rounded-full bg-teal-700 text-white"
                        : weekend
                        ? "text-slate-300"
                        : "text-slate-600"
                    }`}
                  >
                    {d.getDate()}
                  </p>
                  <div className="flex flex-wrap gap-0.5 mt-0.5">
                    {ph && <span className="text-amber-600 text-xs leading-none">★</span>}
                    {off.map((id, k) => {
                      const m = memberById(id);
                      const isMe = id === user.id;
                      return (
                        <span
                          key={`${id}-${k}`}
                          className={`text-white rounded px-0.5 leading-tight ${
                            isMe ? "bg-teal-600" : "bg-slate-500"
                          }`}
                          style={{ fontSize: "9px" }}
                        >
                          {m?.initials}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>
              <span className="text-amber-600">★</span> Public holiday
            </span>
            <span>
              <span className="bg-slate-500 text-white rounded px-1" style={{ fontSize: "9px" }}>
                XX
              </span>{" "}
              Teammate away
            </span>
            <span>
              <span className="bg-teal-600 text-white rounded px-1" style={{ fontSize: "9px" }}>
                {user.initials}
              </span>{" "}
              Your approved leave
            </span>
            <span>
              <span className="inline-block w-3 h-3 rounded bg-teal-50 border border-teal-600 align-middle" />{" "}
              Your selected dates
            </span>
          </div>
        </div>

        {/* upcoming team leave */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold mb-3">Upcoming team leave</h2>
          <ul className="space-y-2">
            {approvedLeaves
              .filter((l) => l.endDate >= toISO(new Date()))
              .sort((a, b) => (a.startDate < b.startDate ? -1 : 1))
              .map((l, i) => {
                const m = memberById(l.userId);
                const isMe = l.userId === user.id;
                return (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                        isMe ? "bg-teal-600 text-white" : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {m?.initials}
                    </span>
                    <div>
                      <p className="font-medium text-slate-700">
                        {m?.name}
                        {isMe ? " (you)" : ""}
                      </p>
                      <p className="text-xs text-slate-500">
                        {fmt(l.startDate)}
                        {l.endDate !== l.startDate ? ` → ${fmt(l.endDate)}` : ""}
                        {l.halfDay ? " (half-day)" : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
          </ul>
        </div>

        {/* public holidays */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold mb-3">Public holidays — {user.country}</h2>
          <ul className="space-y-1.5 text-sm">
            {holidays.map((h) => (
              <li key={h.date} className="flex justify-between">
                <span className="text-slate-700">{h.name}</span>
                <span className="text-slate-400">{fmt(h.date)}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-400 mt-3">
            Imported annually per country (UC-06). Leave crossing a holiday never deducts balance.
          </p>
        </div>
      </section>
    </main>
  );
}

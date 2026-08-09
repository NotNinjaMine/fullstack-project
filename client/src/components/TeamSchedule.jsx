import { useEffect, useMemo, useState } from "react";
import http from "../lib/http";
import { monthCells, toISO } from "../lib/dates";

const monthLabel = (date) =>
  date.toLocaleDateString("en-SG", { month: "long", year: "numeric" });

const moveMonth = (date, delta) => new Date(date.getFullYear(), date.getMonth() + delta, 1);

export default function TeamSchedule({ refreshKey = 0 }) {
  const [calMonth, setCalMonth] = useState(() => new Date());
  const [selectedTeam, setSelectedTeam] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const config = selectedTeam ? { params: { team: selectedTeam } } : undefined;
    http
      .get("/leave/team-calendar", config)
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
        setSelectedTeam(res.data.teamName || selectedTeam);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.response?.status === 403 && selectedTeam) {
          setSelectedTeam("");
          return;
        }
        setError("Team schedule could not be loaded. Refresh or try again later.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTeam, refreshKey]);

  const cells = useMemo(() => monthCells(calMonth), [calMonth]);
  const memberById = useMemo(
    () => new Map((data?.team || []).map((member) => [member.id, member])),
    [data]
  );
  const approved = data?.approved || [];
  const monthPrefix = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2, "0")}`;
  const monthStart = `${monthPrefix}-01`;
  const monthEnd = toISO(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0));
  const hasLeaveThisMonth = approved.some(
    (leave) => leave.startDate <= monthEnd && leave.endDate >= monthStart
  );

  const awayOn = (iso) =>
    approved
      .filter((leave) => iso >= leave.startDate && iso <= leave.endDate)
      .map((leave) => ({ ...memberById.get(leave.userId), halfDay: leave.halfDay }))
      .filter((member) => member.id);

  const teams = data?.availableTeams || [];

  return (
    <section className="lf-card p-5" aria-labelledby="team-schedule-heading">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 id="team-schedule-heading" className="font-semibold text-lf-text">
            Approver team schedule
          </h3>
          <p className="text-sm text-lf-text-subtle">
            Approved absences only. Reasons, leave types, attachments and private notes are not shown.
          </p>
          {data?.actingFor && (
            <p className="mt-1 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full inline-flex px-2.5 py-1">
              Acting for {data.actingFor.name} · {data.teamName}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          {teams.length > 1 && (
            <label className="text-xs text-slate-600">
              Authorized team
              <select
                value={selectedTeam}
                onChange={(event) => setSelectedTeam(event.target.value)}
                className="lf-input mt-1 min-w-52"
                aria-label="Select authorized team schedule"
              >
                {teams.map((context) => (
                  <option key={context.team} value={context.team}>
                    {context.team}{context.actingFor ? ` — acting for ${context.actingFor.name}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex items-center gap-1" aria-label="Calendar month controls">
            <button
              type="button"
              className="lf-btn lf-btn-outline lf-btn-sm"
              onClick={() => setCalMonth((value) => moveMonth(value, -1))}
              aria-label="Previous month"
            >
              ‹
            </button>
            <span className="min-w-36 text-center text-sm font-medium text-lf-text">
              {monthLabel(calMonth)}
            </span>
            <button
              type="button"
              className="lf-btn lf-btn-outline lf-btn-sm"
              onClick={() => setCalMonth((value) => moveMonth(value, 1))}
              aria-label="Next month"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-lf-border bg-lf-muted p-6 text-sm text-slate-500">
          Loading authorized team schedule…
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          <div className="overflow-x-auto rounded-xl border border-lf-border">
            <div className="min-w-[700px] bg-white">
              <div className="grid grid-cols-7 bg-slate-50 border-b border-lf-border text-xs font-medium text-slate-500">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} className="px-2 py-2 text-center">{day}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {cells.map((date, index) => {
                  if (!date) {
                    return <div key={`blank-${index}`} className="min-h-24 border-b border-r border-slate-100 bg-slate-50/40" />;
                  }
                  const iso = toISO(date);
                  const away = awayOn(iso);
                  const weekend = date.getDay() === 0 || date.getDay() === 6;
                  return (
                    <div
                      key={iso}
                      className={`min-h-24 p-2 border-b border-r border-slate-100 ${weekend ? "bg-slate-50" : "bg-white"}`}
                    >
                      <p className="text-xs font-medium text-slate-500 mb-1">{date.getDate()}</p>
                      <div className="space-y-1">
                        {away.map((member) => (
                          <div
                            key={`${iso}-${member.id}`}
                            className="rounded-md bg-teal-50 border border-teal-100 px-1.5 py-1 text-[11px] text-teal-900 truncate"
                            title={`${member.name}${member.halfDay ? " (half-day)" : ""}`}
                          >
                            <span className="font-semibold">{member.initials}</span>
                            <span className="ml-1">{member.name}</span>
                            {member.halfDay && <span className="ml-1 text-teal-700">½ day</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {!hasLeaveThisMonth && (
            <p className="mt-3 text-sm text-lf-text-subtle text-center">
              No approved team leave is scheduled for {monthLabel(calMonth)}.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2" aria-label="Team members">
            {(data.team || []).map((member) => (
              <span key={member.id} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-teal-700 text-[10px] font-semibold text-white">
                  {member.initials}
                </span>
                {member.name}
              </span>
            ))}
            {(data.team || []).length === 0 && (
              <span className="text-sm text-lf-text-subtle">No active team members found.</span>
            )}
          </div>
        </>
      )}
    </section>
  );
}

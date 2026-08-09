import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import http from "../lib/http";
import StaffTable, { useStaff } from "../components/StaffTable";
import {
  LayoutDashboard, Users, FileText, CalendarClock, BarChart3,
  ScrollText, Sparkles, Megaphone, Mail, ShieldAlert, Send, ClipboardCheck,
  Clock, CheckCircle2, AlertTriangle, Download, Settings, Info,
} from "lucide-react";

const fmtDateTime = (v) =>
  v ? new Date(v).toLocaleString("en-SG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

// Export endpoints require the JWT (sent as an Authorization header, not a
// cookie), so a plain window.open()/<a href> request has no auth and 401s —
// which then trips the axios interceptor's auto-logout. Instead, fetch the
// CSV through the authenticated `http` client and save it as a Blob.
const downloadCsv = (url, filename) => {
  http
    .get(url, { responseType: "blob" })
    .then((res) => {
      const blobUrl = window.URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    })
    .catch((err) => toast.error(err.response?.data?.message || "Export failed."));
};

const remainingOf = (b) => (b ? Number(b.entitled) + Number(b.carried) - Number(b.used) : 0);

// Country and team option lists. Countries are the ones with a statutory leave
// policy (UC-04 / §5.3); teams are the teams that actually exist. Typing these
// by hand used to create staff whose country had no policy and whose team
// matched nobody, which broke balances and the approval routing.
function useOrgOptions() {
  const [countries, setCountries] = useState([]);
  const [teams, setTeams] = useState([]);
  useEffect(() => {
    http.get("/user/policies").then((res) => setCountries(res.data)).catch(() => {});
    http.get("/user/teams").then((res) => setTeams(res.data)).catch(() => {});
  }, []);
  return { countries, teams };
}

function CountrySelect({ value, onChange, countries, className = "lf-input" }) {
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)} title="Country of employment">
      {!countries.length && <option value={value}>{value}</option>}
      {countries.map((c) => (
        <option key={c.country} value={c.country}>
          {c.countryName} ({c.country}) — {c.annualMin}–{c.annualMax} days annual
        </option>
      ))}
    </select>
  );
}

function TeamSelect({ value, onChange, teams, className = "lf-input" }) {
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)} title="Team">
      {!teams.length && <option value={value}>{value}</option>}
      {teams.map((t) => (
        <option key={t} value={t}>{t}</option>
      ))}
    </select>
  );
}

// Tiny inline bar chart (no chart lib dependency; SVG) — matches offline-first ethos.
function MiniBar({ chart }) {
  if (!chart || !chart.x?.length) return <p className="text-sm text-lf-text-subtle">No data.</p>;
  const max = Math.max(1, ...chart.y);
  return (
    <div className="space-y-2">
      {chart.x.map((label, i) => (
        <div key={i} className="flex items-center gap-2 group">
          <span className="text-xs text-lf-text-muted w-28 truncate text-right shrink-0">{label}</span>
          <div
            className="flex-1 bg-lf-muted rounded-full h-4 overflow-hidden"
            title={`${label}: ${chart.y[i]}`}
          >
            <div
              className="h-4 bg-brand-500 rounded-full transition-colors group-hover:bg-brand-600"
              style={{ width: `${Math.max(2, (chart.y[i] / max) * 100)}%` }}
            />
          </div>
          <span className="text-xs text-lf-text font-medium w-10 tabular-nums shrink-0">{chart.y[i]}</span>
        </div>
      ))}
    </div>
  );
}

export default function Admin({ user, setToast }) {
  const [tab, setTab] = useState("dashboard");

  const tabs = [
    ["dashboard", "Dashboard", LayoutDashboard],
    ["employees", "Employees", Users],
    ["policies", "Policies & types", FileText],
    ["coverage", "Coverage config", CalendarClock],
    ["reports", "Reports", BarChart3],
    ["audit", "Audit trail", ScrollText],
    ["anomalies", "Risk flags", ShieldAlert],
    ["leave-admin", "Leave corrections", ClipboardCheck],
    ["announcements", "Announcements", Megaphone],
    ["invitations", "Invitations", Mail],
  ];

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center mb-4">
        <div className="flex flex-wrap gap-1.5">
          {tabs.map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border ${
                tab === id ? "bg-brand-600 text-white border-transparent" : "bg-white text-lf-text-muted border-lf-border hover:bg-lf-muted"
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "dashboard" && <DashboardTab />}
      {tab === "employees" && <EmployeesTab currentUserId={user?.id} />}
      {tab === "policies" && <PoliciesTab />}
      {tab === "coverage" && <CoverageTab user={user} />}
      {tab === "reports" && <ReportsTab />}
      {tab === "audit" && <AuditTab />}
      {tab === "anomalies" && <AnomaliesTab />}
      {tab === "leave-admin" && <LeaveAdminTab />}
      {tab === "announcements" && <AnnouncementsTab />}
      {tab === "invitations" && <InvitationsTab />}
    </main>
  );
}

/* ===================== Dashboard (UC-10) ===================== */
function DashboardTab() {
  const [d, setD] = useState(null);
  useEffect(() => {
    http.get("/admin/dashboard").then((res) => setD(res.data)).catch(() => {});
  }, []);
  if (!d) return <p className="text-sm text-lf-text-subtle">Loading…</p>;
  // The card class supplies the Innovare accent bar.
  const stat = (label, value, Icon, tone) => (
    <div className="lf-card-static p-4 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${tone}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-lf-text-subtle leading-tight">{label}</p>
        <p className="text-2xl font-semibold text-lf-text mt-0.5 tabular-nums">{value}</p>
      </div>
    </div>
  );

  const year = new Date().getFullYear();

  return (
    <div className="space-y-4">
      <InsightsTab />

      {/* Three approval tiers now: Supervisor, Manager, and the Boss (who
          decides Managers' own leave). All three are shown so these tiles still
          account for every open request. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {stat("Staff", d.staffCount, Users, "bg-teal-50 text-teal-700")}
        {stat("Awaiting supervisor", d.pendingSupervisor, Clock, "bg-amber-50 text-amber-700")}
        {stat("Awaiting manager", d.pendingManager, Clock, "bg-amber-50 text-amber-700")}
        {stat("Awaiting boss", d.pendingBoss ?? 0, Clock, "bg-amber-50 text-amber-700")}
        {stat("Flagged pending", d.flaggedPending ?? 0, AlertTriangle, "bg-rose-50 text-rose-700")}
        {stat("Approved (total)", d.approvedTotal, CheckCircle2, "bg-emerald-50 text-emerald-700")}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="lf-card p-4">
          <h3 className="font-semibold text-lf-text mb-3">Pending requests by country</h3>
          {d.pendingByCountry.length > 0 ? (
            <MiniBar chart={{ x: d.pendingByCountry.map((c) => c.country), y: d.pendingByCountry.map((c) => c.count) }} />
          ) : (
            <p className="text-sm text-lf-text-subtle">Nothing pending right now.</p>
          )}
        </div>
        <div className="lf-card p-4">
          <h3 className="font-semibold text-lf-text mb-3">Approved leave by type ({year})</h3>
          {d.approvedByType?.length > 0 ? (
            <MiniBar chart={{ x: d.approvedByType.map((t) => t.name), y: d.approvedByType.map((t) => Math.round(t.days * 10) / 10) }} />
          ) : (
            <p className="text-sm text-lf-text-subtle">No approved leave yet this year.</p>
          )}
        </div>
      </div>
    </div>
  );
}
/* ===================== Employees (UC-10 / UC-20 / UC-04) ===================== */
function EmployeesTab({ currentUserId }) {
  // Shared staff data + actions (the same hook the Manager's recovery panel
  // uses, so both views are always in sync).
  const {
    rows, loading, load, unlock, forceLogout, deactivate, reactivate, deleteForever,
    changeRole, assignableRoles
  } = useStaff();
  const [form, setForm] = useState({ name: "", email: "", tempPassword: "", role: "EMPLOYEE", country: "SG", gender: "", team: "Compliance Team A" });
  const { countries, teams } = useOrgOptions();
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);

  const add = () => {
    setBusy(true);
    http.post("/admin/employees", form)
      .then((res) => { toast.success(res.data.message); setForm({ ...form, name: "", email: "", tempPassword: "" }); load(); })
      .catch((err) => toast.error(err.response?.data?.message || (err.response?.data?.errors || []).join(", ") || "Failed."))
      .finally(() => setBusy(false));
  };
  // Read a real .csv OR .xlsx/.xls file straight into the same textarea the
  // paste flow uses, so all three routes share one code path and HR can
  // see/edit what will be imported before it's sent. Excel workbooks are
  // converted to CSV entirely in the browser (via SheetJS) — the server only
  // ever sees plain CSV text, so /admin/employees/import needed no changes.
  const isExcelFile = (file) =>
    /\.(xlsx|xls)$/i.test(file.name) ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.type === "application/vnd.ms-excel";

  const onPickCsv = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("That file is larger than 5MB."); return; }

    if (isExcelFile(file)) {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const XLSX = await import("xlsx");
          const workbook = XLSX.read(reader.result, { type: "array" });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const csvText = XLSX.utils.sheet_to_csv(firstSheet).trim();
          if (!csvText) { toast.error(`${file.name} doesn't have any rows on its first sheet.`); return; }
          setCsv(csvText);
          toast.success(`Loaded ${file.name} (sheet "${workbook.SheetNames[0]}") — review the rows below, then Import.`);
        } catch (err) {
          toast.error(`Could not read ${file.name} as an Excel file.`);
        }
      };
      reader.onerror = () => toast.error("Could not read that file.");
      reader.readAsArrayBuffer(file);
      e.target.value = ""; // allow re-picking the same file
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCsv(String(reader.result || "").trim());
      toast.success(`Loaded ${file.name} — review the rows below, then Import.`);
    };
    reader.onerror = () => toast.error("Could not read that file.");
    reader.readAsText(file);
    e.target.value = ""; // allow re-picking the same file
  };

  const importCsv = () => {
    setBusy(true);
    http.post("/admin/employees/import", { csv })
      .then((res) => { toast.success(`${res.data.created} created.`); setCsv(""); load(); })
      .catch((err) => toast.error(err.response?.data?.message || "Import failed."))
      .finally(() => setBusy(false));
  };
  // UC-04: year-end carry-forward — preview first, then confirm, mirroring the
  // bulk-entitlement flow. This action forfeits leave, so it should never apply
  // on a single unconfirmed click.
  const [cfPreview, setCfPreview] = useState(null);
  const [cfResult, setCfResult] = useState(null);
  const previewCarryForward = () => {
    setBusy(true);
    setCfResult(null);
    http.get("/admin/carry-forward/preview")
      .then((res) => setCfPreview(res.data))
      .catch((err) => toast.error(err.response?.data?.message || "Could not load preview."))
      .finally(() => setBusy(false));
  };
  const commitCarryForward = () => {
    setBusy(true);
    http.post("/admin/carry-forward/trigger", cfPreview ? { fromYear: cfPreview.fromYear } : {})
      .then((res) => {
        toast.success(res.data.message);
        setCfResult({ message: res.data.message });
        setCfPreview(null);
        load();
      })
      .catch((err) => toast.error(err.response?.data?.message || "Carry-forward failed."))
      .finally(() => setBusy(false));
  };
  // M1 (UC-20): bulk yearly entitlement. Preview first (shows current vs target
  // per employee), then commit — with a visible, persistent result so it's clear
  // the action ran even when nothing needed changing.
  const [entPreview, setEntPreview] = useState(null); // { year, rows } | null
  const [entResult, setEntResult] = useState(null);   // { message } | null
  const previewEntitlement = () => {
    setBusy(true);
    setEntResult(null);
    http.get("/admin/entitlement/preview")
      .then((res) => setEntPreview(res.data))
      .catch((err) => toast.error(err.response?.data?.message || "Could not load preview."))
      .finally(() => setBusy(false));
  };
  const commitEntitlement = () => {
    setBusy(true);
    http.post("/admin/entitlement/commit", entPreview ? { year: entPreview.year } : {})
      .then((res) => {
        toast.success(res.data.message);
        setEntResult({ message: res.data.message });
        setEntPreview(null);
        load();
      })
      .catch((err) => toast.error(err.response?.data?.message || "Update failed."))
      .finally(() => setBusy(false));
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={previewCarryForward} className="lf-btn lf-btn-outline lf-btn-sm">Run year-end carry-forward</button>
        <button type="button" disabled={busy} onClick={previewEntitlement} className="lf-btn lf-btn-outline lf-btn-sm">Apply bulk entitlement (this year)</button>
      </div>

      {/* UC-04: carry-forward preview + confirm */}
      {cfPreview && (
        <div className="lf-card p-4 border-amber-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-lf-text">
              Year-end carry-forward preview — {cfPreview.fromYear} → {cfPreview.toYear}
            </h3>
            <span className="text-xs text-lf-text-subtle">{cfPreview.rows.length} employee(s)</span>
          </div>
          <p className="text-sm text-slate-500 mb-3">
            Unused annual leave carries into {cfPreview.toYear} up to each country's cap; anything above the cap is
            forfeited, and each employee's entitlement rolls forward into the new year.
          </p>
          {cfPreview.forfeitCount > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-3">
              <p className="text-sm font-medium text-amber-900">
                {cfPreview.totalForfeited} day(s) will be forfeited across {cfPreview.forfeitCount} employee(s)
              </p>
              <p className="text-xs text-amber-800 mt-1">
                Forfeited leave cannot be recovered once applied. {cfPreview.totalCarried} day(s) will carry over in total.
              </p>
            </div>
          )}
          <div className="overflow-x-auto max-h-72 overflow-y-auto mb-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-lf-text-subtle border-b border-lf-border">
                  <th className="py-1.5">Name</th><th>Country</th><th>Unused</th><th>Cap</th><th>Carried</th><th>Forfeited</th><th>New entitlement</th>
                </tr>
              </thead>
              <tbody>
                {cfPreview.rows.map((r) => (
                  <tr key={r.userId} className="border-b border-lf-border/60">
                    <td className="py-1.5">{r.name}</td>
                    <td>{r.country}</td>
                    <td>{r.unused}</td>
                    <td>{r.cap}</td>
                    <td className="text-brand-700 font-medium">{r.carried}</td>
                    <td className={r.forfeited > 0 ? "text-rose-600 font-medium" : "text-slate-400"}>{r.forfeited}</td>
                    <td>{r.newEntitled}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => setCfPreview(null)} className="lf-btn lf-btn-ghost lf-btn-sm">Cancel</button>
            <button type="button" disabled={busy} onClick={commitCarryForward} className="lf-btn lf-btn-primary lf-btn-sm">
              {busy ? "Applying…" : "Confirm & apply"}
            </button>
          </div>
        </div>
      )}
      {cfResult && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          {cfResult.message}
        </div>
      )}

      {/* M1 (UC-20): bulk entitlement preview + confirm */}
      {entPreview && (
        <div className="lf-card p-4 border-brand-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-lf-text">Bulk entitlement preview — {entPreview.year}</h3>
            <span className="text-xs text-lf-text-subtle">{entPreview.rows.length} employee(s)</span>
          </div>
          <p className="text-sm text-slate-500 mb-3">
            This sets each employee's annual entitlement to their country's statutory figure for {entPreview.year}. Review the changes, then confirm.
          </p>
          {entPreview.proratedCount > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-3">
              <p className="text-sm font-medium text-amber-900">
                {entPreview.proratedCount} employee{entPreview.proratedCount === 1 ? "" : "s"} currently below the statutory figure
              </p>
              <p className="text-xs text-amber-800 mt-1">
                These are usually mid-year joiners whose allowance was pro-rated when they were onboarded. Applying this
                will raise them to the full year's entitlement — correct when starting a new leave year, but it undoes
                pro-ration if you run it mid-year. They're marked <span className="font-medium">pro-rated</span> below.
              </p>
            </div>
          )}
          <div className="overflow-x-auto max-h-72 overflow-y-auto mb-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-lf-text-subtle border-b border-lf-border">
                  <th className="py-1.5">Name</th><th>Country</th><th>Current</th><th>Target</th><th>Change</th>
                </tr>
              </thead>
              <tbody>
                {entPreview.rows.map((r) => {
                  const changes = r.currentEntitled !== null && r.currentEntitled !== r.targetEntitled;
                  return (
                    <tr key={r.userId} className="border-b border-lf-border/60">
                      <td className="py-1.5">{r.name}</td>
                      <td>{r.country}</td>
                      <td>{r.currentEntitled ?? "—"}</td>
                      <td>{r.targetEntitled}</td>
                      <td className={changes ? "text-brand-700 font-medium" : "text-slate-400"}>
                        {r.currentEntitled === null ? "new" : changes ? `${r.currentEntitled} → ${r.targetEntitled}` : "no change"}
                        {r.raisesProrated && (
                          <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-normal">
                            pro-rated
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => setEntPreview(null)} className="lf-btn lf-btn-ghost lf-btn-sm">Cancel</button>
            <button type="button" disabled={busy} onClick={commitEntitlement} className="lf-btn lf-btn-primary lf-btn-sm">
              {busy ? "Applying…" : "Confirm & apply"}
            </button>
          </div>
        </div>
      )}
      {entResult && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          {entResult.message}
        </div>
      )}

      <div className="lf-card p-4">
        <h3 className="font-semibold text-lf-text mb-3">Add employee</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input className="lf-input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="lf-input" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="lf-input" placeholder="Temp password" value={form.tempPassword} onChange={(e) => setForm({ ...form, tempPassword: e.target.value })} />
          <select className="lf-input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {["EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN"].map((r) => <option key={r}>{r}</option>)}
          </select>
          <CountrySelect countries={countries} value={form.country} onChange={(v) => setForm({ ...form, country: v })} />
          <select className="lf-input" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
            <option value="">Gender (optional)</option>
            <option value="FEMALE">Female</option>
            <option value="MALE">Male</option>
          </select>
          <TeamSelect teams={teams} value={form.team} onChange={(v) => setForm({ ...form, team: v })} />
        </div>
        <p className="text-xs text-lf-text-subtle mt-1">
          Gender is optional and only needed for gender-restricted leave types (e.g. Maternity,
          NS/Reservist Leave) under the "Policies &amp; types" tab.
        </p>
        <div className="flex justify-end mt-2">
          <button type="button" disabled={busy} onClick={add} className="lf-btn lf-btn-primary lf-btn-sm">Add</button>
        </div>
      </div>

      <div className="lf-card p-4">
        <h3 className="font-semibold text-lf-text mb-1">Bulk import (CSV or Excel)</h3>
        <p className="text-xs text-lf-text-subtle mb-2">
          Columns: name,email,role,country,team[,annual]. Header row optional. Default password: Welcome123.
          Excel files (.xlsx/.xls) use the first sheet — it's converted to the same format shown below.
        </p>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <label className="lf-btn lf-btn-sm lf-btn-outline cursor-pointer">
            Choose a .csv or .xlsx file
            <input
              type="file"
              accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={onPickCsv}
              className="hidden"
            />
          </label>
          <span className="text-xs text-lf-text-subtle">or paste the rows below</span>
        </div>
        <textarea className="lf-input font-mono text-xs" rows={4} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="Jane Tan,jane@innovare.com,EMPLOYEE,SG,Compliance Team A" />
        <div className="flex justify-end mt-2">
          <button type="button" disabled={busy || !csv.trim()} onClick={importCsv} className="lf-btn lf-btn-outline lf-btn-sm">Import</button>
        </div>
      </div>

      <div className="lf-card p-4">
        <StaffTable
          rows={rows}
          loading={loading}
          onUnlock={unlock}
          onForceLogout={forceLogout}
          onDeactivate={deactivate}
          onReactivate={reactivate}
          onDeleteForever={deleteForever}
          currentUserId={currentUserId}
          onChangeRole={changeRole}
          assignableRoles={assignableRoles}
          title="Staff"
        />
      </div>
    </div>
  );
}

/* ===================== Policies & Leave types (M5, UC-10) ===================== */

// Starting state for the "add a leave type" row, and what it resets to on save.
const BLANK_NEW_TYPE = {
  code: "", name: "", applicableCountries: [], genderRestriction: "ANY",
  affectsAnnualBalance: false, affectsSickBalance: false, requiresMc: false, active: true,
};

// Multi-select as toggle chips rather than a native <select multiple>, which
// needs ctrl/cmd-click and isn't discoverable. Empty selection = every country.
function CountryMultiSelect({ options, selected, onChange }) {
  const toggle = (c) => {
    onChange(selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c]);
  };
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((c) => {
        const on = selected.includes(c);
        return (
          <button
            key={c}
            type="button"
            onClick={() => toggle(c)}
            className={`text-[11px] font-medium px-2 py-0.5 rounded-full border transition-colors ${
              on ? "bg-teal-600 border-teal-600 text-white" : "bg-white border-lf-border text-lf-text-muted hover:bg-lf-muted"
            }`}
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}

const GENDER_OPTIONS = [
  ["ANY", "Everyone"],
  ["FEMALE", "Women only"],
  ["MALE", "Men only"],
];
function GenderSegmented({ value, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-lf-border overflow-hidden">
      {GENDER_OPTIONS.map(([val, label]) => (
        <button
          key={val}
          type="button"
          onClick={() => onChange(val)}
          className={`text-xs px-2.5 py-1 font-medium transition-colors ${
            value === val ? "bg-teal-600 text-white" : "bg-white text-lf-text-muted hover:bg-lf-muted"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// One card per leave type: name + status badge, a gender segmented control,
// country chips, balance/MC flags, and a save action.
function LeaveTypeCard({ t, countryOptions, busy, onChange, onSave }) {
  const set = (patch) => onChange({ ...t, ...patch });
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 bg-white ${t.active ? "border-lf-border" : "border-lf-border opacity-60"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <input className="lf-input font-semibold text-sm py-1 w-full" value={t.name} onChange={(e) => set({ name: e.target.value })} />
          <p className="text-[11px] text-lf-text-subtle font-mono mt-1">{t.code}</p>
        </div>
        <button
          type="button"
          onClick={() => set({ active: !t.active })}
          className={`shrink-0 text-xs px-2.5 py-1 rounded-full font-medium ${
            t.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
          }`}
        >
          {t.active ? "Active" : "Inactive"}
        </button>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-wide text-lf-text-subtle mb-1.5">Who can apply</p>
        <GenderSegmented value={t.genderRestriction} onChange={(v) => set({ genderRestriction: v })} />
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-wide text-lf-text-subtle mb-1.5">
          Countries <span className="normal-case text-slate-400">(none selected = all)</span>
        </p>
        <CountryMultiSelect options={countryOptions} selected={t.applicableCountries} onChange={(v) => set({ applicableCountries: v })} />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-lf-text-muted pt-1">
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={t.affectsAnnualBalance} onChange={(e) => set({ affectsAnnualBalance: e.target.checked })} />
          Annual balance
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={t.affectsSickBalance} onChange={(e) => set({ affectsSickBalance: e.target.checked })} />
          Sick balance
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={t.requiresMc} onChange={(e) => set({ requiresMc: e.target.checked })} />
          Requires MC
        </label>
      </div>

      <div className="flex justify-end pt-2 border-t border-lf-border/60">
        <button type="button" disabled={busy} onClick={() => onSave(t)} className="lf-btn lf-btn-sm lf-btn-primary">
          Save changes
        </button>
      </div>
    </div>
  );
}

// Categorical status per (leave type, country) cell. Color is never the only
// signal — every cell also carries a symbol, and the legend + underlying edit
// table below spell out the same states in text.
const ELIGIBILITY_STATUS = {
  all: { label: "Offered to everyone", symbol: "✓", cls: "bg-emerald-100 text-emerald-800" },
  women: { label: "Women only", symbol: "♀", cls: "bg-rose-100 text-rose-800" },
  men: { label: "Men only", symbol: "♂", cls: "bg-sky-100 text-sky-800" },
  off: { label: "Not offered", symbol: "—", cls: "bg-slate-50 text-slate-300" },
};
const statusFor = (t, country) => {
  if (!t.active) return "off";
  const countries = t.applicableCountries || [];
  if (countries.length > 0 && !countries.includes(country)) return "off";
  if (t.genderRestriction === "FEMALE") return "women";
  if (t.genderRestriction === "MALE") return "men";
  return "all";
};

function EligibilityMatrix({ types, countryOptions }) {
  if (types.length === 0 || countryOptions.length === 0) return null;
  return (
    <div className="lf-card p-4 overflow-x-auto">
      <h3 className="font-semibold text-lf-text mb-1">Eligibility overview</h3>
      <p className="text-xs text-lf-text-subtle mb-3">
        At a glance: where each leave type is offered, and to whom. Edit the details in the table below.
      </p>
      <table className="text-sm" style={{ borderSpacing: "0 4px", borderCollapse: "separate" }}>
        <thead>
          <tr>
            <th className="text-left text-xs text-lf-text-subtle pr-3 sticky left-0 bg-white">Leave type</th>
            {countryOptions.map((c) => (
              <th key={c} className="text-xs font-medium text-lf-text-subtle px-1">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {types.map((t) => (
            <tr key={t.code} className={t.active ? "" : "opacity-50"}>
              <td className="pr-3 text-sm text-lf-text whitespace-nowrap sticky left-0 bg-white">{t.name}</td>
              {countryOptions.map((c) => {
                const s = ELIGIBILITY_STATUS[statusFor(t, c)];
                return (
                  <td key={c} className="text-center px-0.5">
                    <span
                      className={`inline-flex items-center justify-center w-8 h-6 rounded text-xs font-semibold ${s.cls}`}
                      title={`${t.name} · ${c} · ${s.label}`}
                    >
                      {s.symbol}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-3 mt-3 text-xs text-lf-text-subtle">
        {Object.values(ELIGIBILITY_STATUS).map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-semibold ${s.cls}`}>
              {s.symbol}
            </span>
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function PoliciesTab() {
  const [policies, setPolicies] = useState([]);
  const [types, setTypes] = useState([]);
  const [newType, setNewType] = useState(BLANK_NEW_TYPE);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    http.get("/admin/policies").then((res) => setPolicies(res.data)).catch(() => {});
    http.get("/admin/leave-types").then((res) => setTypes(res.data.map(rowToForm))).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const savePolicy = (p) => {
    http.put(`/admin/policies/${p.country}`, {
      annualMin: p.annualMin, annualMax: p.annualMax, sickMc: p.sickMc, sickNoMc: p.sickNoMc, carryForwardMax: p.carryForwardMax,
    }).then(() => toast.success(`${p.countryName} policy saved.`))
      .catch((err) => toast.error(err.response?.data?.message || "Save failed."));
  };

  // API stores applicableCountries as an array (or null = every country).
  function rowToForm(t) {
    return { ...t, applicableCountries: t.applicableCountries || [] };
  }

  const saveType = (t) => {
    const code = t.code.trim().toLowerCase();
    if (!code || !t.name.trim()) { toast.error("Code and name are required."); return; }
    setBusy(true);
    http.put(`/admin/leave-types/${code}`, {
      name: t.name.trim(),
      affectsAnnualBalance: t.affectsAnnualBalance,
      affectsSickBalance: t.affectsSickBalance,
      requiresMc: t.requiresMc,
      active: t.active,
      applicableCountries: t.applicableCountries,
      genderRestriction: t.genderRestriction,
    }).then(() => { toast.success(`${t.name} saved.`); load(); })
      .catch((err) => toast.error(err.response?.data?.message || (err.response?.data?.errors || []).join(", ") || "Save failed."))
      .finally(() => setBusy(false));
  };
  const addType = () => {
    saveType(newType);
    setNewType(BLANK_NEW_TYPE);
  };

  const countryOptions = policies.map((p) => p.country);

  return (
    <div className="space-y-4">
      <div className="lf-card p-4 overflow-x-auto">
        <h3 className="font-semibold text-lf-text mb-3">Country leave policies</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-lf-text-subtle border-b border-lf-border">
              <th className="py-1.5">Country</th><th>Annual min</th><th>Annual max</th><th>Sick (MC)</th><th>Sick (no MC)</th><th>Carry cap</th><th></th>
            </tr>
          </thead>
          <tbody>
            {policies.map((p, i) => (
              <tr key={p.country} className="border-b border-lf-border/60">
                <td className="py-1.5">{p.countryName}</td>
                {["annualMin", "annualMax", "sickMc", "sickNoMc", "carryForwardMax"].map((k) => (
                  <td key={k}>
                    <input type="number" className="lf-input w-16 py-1" value={p[k]}
                      onChange={(e) => { const v = [...policies]; v[i] = { ...p, [k]: Number(e.target.value) }; setPolicies(v); }} />
                  </td>
                ))}
                <td><button type="button" onClick={() => savePolicy(policies[i])} className="lf-btn lf-btn-sm lf-btn-outline">Save</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <EligibilityMatrix types={types} countryOptions={countryOptions} />

      <div className="lf-card p-4">
        <h3 className="font-semibold text-lf-text mb-1">Leave types</h3>
        <p className="text-xs text-lf-text-subtle mb-4">
          Restrict any leave type to specific countries and/or a gender — e.g. Maternity Leave to women, NS/Reservist
          Leave to men in Singapore.
        </p>
        {types.length === 0 && <p className="text-sm text-lf-text-subtle">No configurable leave types yet (seed adds a default catalogue).</p>}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {types.map((t, i) => (
            <LeaveTypeCard
              key={t.code}
              t={t}
              countryOptions={countryOptions}
              busy={busy}
              onChange={(next) => { const v = [...types]; v[i] = next; setTypes(v); }}
              onSave={saveType}
            />
          ))}
        </div>

        <div className="mt-5 pt-4 border-t border-lf-border">
          <h4 className="text-sm font-semibold text-lf-text mb-3">Add a new leave type</h4>
          <div className="rounded-xl border border-dashed border-lf-border p-4 flex flex-col gap-3 bg-lf-muted/30">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input className="lf-input py-1.5" placeholder="Code (e.g. maternity)" value={newType.code}
                onChange={(e) => setNewType({ ...newType, code: e.target.value })} />
              <input className="lf-input py-1.5" placeholder="Display name" value={newType.name}
                onChange={(e) => setNewType({ ...newType, name: e.target.value })} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-lf-text-subtle mb-1.5">Who can apply</p>
              <GenderSegmented value={newType.genderRestriction} onChange={(v) => setNewType({ ...newType, genderRestriction: v })} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-lf-text-subtle mb-1.5">
                Countries <span className="normal-case text-slate-400">(none = all)</span>
              </p>
              <CountryMultiSelect options={countryOptions} selected={newType.applicableCountries}
                onChange={(next) => setNewType({ ...newType, applicableCountries: next })} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-lf-text-muted">
              <label className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={newType.affectsAnnualBalance}
                  onChange={(e) => setNewType({ ...newType, affectsAnnualBalance: e.target.checked })} />
                Annual balance
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={newType.affectsSickBalance}
                  onChange={(e) => setNewType({ ...newType, affectsSickBalance: e.target.checked })} />
                Sick balance
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={newType.requiresMc}
                  onChange={(e) => setNewType({ ...newType, requiresMc: e.target.checked })} />
                Requires MC
              </label>
            </div>
            <div className="flex justify-end">
              <button type="button" disabled={busy} onClick={addType} className="lf-btn lf-btn-primary lf-btn-sm">
                Add leave type
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===================== Coverage config (UC-18/29) ===================== */
function CoverageTab({ user }) {
  const [weekend, setWeekend] = useState([]);
  const [blackouts, setBlackouts] = useState([]);
  // Closed lists for the blackout scope picker — countries come from the
  // configured leave policies, teams from the server's team constant. HR picks
  // from these instead of typing, so a scope can never be a dead typo.
  const [options, setOptions] = useState({ countries: [], teams: [] });
  const [bform, setBform] = useState({ scope: "COUNTRY", scopeId: "SG", startDate: "", endDate: "", mode: "SPECIAL_APPROVAL", reason: "" });

  const load = useCallback(() => {
    http.get("/coverage/weekend-config").then((res) => setWeekend(res.data)).catch(() => {});
    http.get("/coverage/blackouts?all=1").then((res) => setBlackouts(res.data)).catch(() => {});
    http.get("/coverage/options").then((res) => setOptions(res.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  // Switching scope has to reset scopeId, or a country code would be submitted
  // as a team name (and vice versa).
  const changeScope = (scope) => {
    const firstCountry = options.countries[0]?.country || "SG";
    const firstTeam = options.teams[0] || "";
    setBform({ ...bform, scope, scopeId: scope === "COUNTRY" ? firstCountry : firstTeam });
  };
  const countryName = (code) => options.countries.find((c) => c.country === code)?.countryName || code;

  const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const toggleDay = (i, day) => {
    const v = [...weekend];
    v[i] = { ...v[i], workingDays: { ...v[i].workingDays, [day]: !v[i].workingDays[day] } };
    setWeekend(v);
  };
  const saveWeekend = (c) => {
    http.put("/coverage/weekend-config", { country: c.country, workingDays: c.workingDays })
      .then(() => toast.success(`${c.countryName} working days saved.`))
      .catch((err) => toast.error(err.response?.data?.message || "Save failed."));
  };
  const addBlackout = () => {
    if (!bform.scopeId) { toast.error("Pick a country or team for this blackout."); return; }
    if (!bform.startDate || !bform.endDate) { toast.error("Pick a start and end date."); return; }
    if (bform.endDate < bform.startDate) { toast.error("End date must be on or after the start date."); return; }
    http.post("/coverage/blackouts", bform)
      .then(() => { toast.success("Blackout added."); setBform({ ...bform, startDate: "", endDate: "", reason: "" }); load(); })
      .catch((err) => toast.error(err.response?.data?.message || "Failed."));
  };
  const deactivateBlackout = (id) => {
    http.put(`/coverage/blackouts/${id}/deactivate`).then(() => { toast.success("Deactivated."); load(); }).catch(() => {});
  };
  return (
    <div className="space-y-4">
      <div className="lf-card p-4 overflow-x-auto">
        <h3 className="font-semibold text-lf-text mb-3">Weekend / working days per country (UC-29)</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-lf-text-subtle border-b border-lf-border">
              <th className="py-1.5">Country</th>{DAYS.map((d) => <th key={d} className="capitalize text-center">{d}</th>)}<th></th>
            </tr>
          </thead>
          <tbody>
            {weekend.map((c, i) => (
              <tr key={c.country} className="border-b border-lf-border/60">
                <td className="py-1.5">{c.countryName}</td>
                {DAYS.map((d) => (
                  <td key={d} className="text-center">
                    <input type="checkbox" checked={!!c.workingDays[d]} onChange={() => toggleDay(i, d)} />
                  </td>
                ))}
                <td><button type="button" onClick={() => saveWeekend(weekend[i])} className="lf-btn lf-btn-sm lf-btn-outline">Save</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="lf-card p-4">
        <h3 className="font-semibold text-lf-text mb-3">Blackout periods (UC-18)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-2 mb-1">
          <label className="block">
            <span className="text-xs text-lf-text-subtle">Applies to</span>
            <select className="lf-input" value={bform.scope} onChange={(e) => changeScope(e.target.value)}>
              <option value="COUNTRY">Whole country</option><option value="TEAM">One team</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-lf-text-subtle">{bform.scope === "COUNTRY" ? "Country" : "Team"}</span>
            {bform.scope === "COUNTRY" ? (
              <select className="lf-input" value={bform.scopeId} onChange={(e) => setBform({ ...bform, scopeId: e.target.value })}>
                {options.countries.map((c) => (
                  <option key={c.country} value={c.country}>{c.countryName} ({c.country})</option>
                ))}
              </select>
            ) : (
              <select className="lf-input" value={bform.scopeId} onChange={(e) => setBform({ ...bform, scopeId: e.target.value })}>
                {options.teams.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
          </label>
          <label className="block">
            <span className="text-xs text-lf-text-subtle">From</span>
            <input type="date" className="lf-input" value={bform.startDate} onChange={(e) => setBform({ ...bform, startDate: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-xs text-lf-text-subtle">To</span>
            <input type="date" className="lf-input" min={bform.startDate || undefined} value={bform.endDate} onChange={(e) => setBform({ ...bform, endDate: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-xs text-lf-text-subtle">Restriction</span>
            <select className="lf-input" value={bform.mode} onChange={(e) => setBform({ ...bform, mode: e.target.value })}>
              <option value="SPECIAL_APPROVAL">Special approval only</option>
              <option value="BLOCK">Blocked — no leave</option>
            </select>
          </label>
          <div className="flex items-end">
            <button type="button" onClick={addBlackout} className="lf-btn lf-btn-primary lf-btn-sm w-full">Add</button>
          </div>
        </div>
        <p className="text-xs text-lf-text-subtle mb-3">
          Blackout dates show in red on every affected employee&apos;s calendar.{" "}
          <span className="font-medium">Blocked</span> dates cannot be requested at all;{" "}
          <span className="font-medium">special approval</span> dates can be requested but are
          flagged for the Manager.
        </p>
        <input className="lf-input mb-3" placeholder="Reason (optional)" value={bform.reason} onChange={(e) => setBform({ ...bform, reason: e.target.value })} />
        <div className="space-y-1">
          {blackouts.map((b) => (
            <div key={b.id} className="flex items-center justify-between border-b border-lf-border/60 py-1.5 text-sm">
              <span>
                <span className={`text-xs px-2 py-0.5 rounded-full mr-2 ${b.mode === "BLOCK" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{b.mode}</span>
                {b.scope === "COUNTRY" ? countryName(b.scopeId) : b.scopeId} · {b.startDate} → {b.endDate} {b.reason ? `· ${b.reason}` : ""}
              </span>
              <button type="button" onClick={() => deactivateBlackout(b.id)} className="lf-btn lf-btn-sm lf-btn-outline">Remove</button>
            </div>
          ))}
          {blackouts.length === 0 && <p className="text-sm text-lf-text-subtle">No active blackout periods.</p>}
        </div>
      </div>

    </div>
  );
}

/* ===================== Reports (UC-22 / UC-30) ===================== */
function ReportsTab() {
  const [report, setReport] = useState(null);
  const [type, setType] = useState("leave_utilisation");
  const [schedules, setSchedules] = useState([]);
  const [sform, setSform] = useState({ reportType: "leave_utilisation", frequency: "monthly", format: "CSV", recipients: "" });

  const TYPES = [
    ["leave_utilisation", "Leave utilisation by country"],
    ["sick_leave_trend", "Sick-leave trend"],
    ["carry_forward_summary", "Carry-forward summary"],
    ["pending_overview", "Pending overview"],
  ];

  const loadSchedules = useCallback(() => {
    http.get("/report/schedules").then((res) => setSchedules(res.data)).catch(() => {});
  }, []);
  useEffect(() => { loadSchedules(); }, [loadSchedules]);

  const run = (t) => {
    setType(t);
    http.get(`/report/run/${t}`).then((res) => setReport(res.data)).catch((err) => toast.error(err.response?.data?.message || "Report failed."));
  };
  const exportCsv = () => {
    downloadCsv(`/report/export/${type}`, `${type}.csv`);
  };
  const addSchedule = () => {
    const recipients = sform.recipients.split(",").map((s) => s.trim()).filter(Boolean);
    http.post("/report/schedules", { ...sform, recipients })
      .then(() => { toast.success("Schedule created."); setSform({ ...sform, recipients: "" }); loadSchedules(); })
      .catch((err) => toast.error(err.response?.data?.message || (err.response?.data?.errors || []).join(", ") || "Failed."));
  };
  const runNow = (id) => http.post(`/report/schedules/${id}/run-now`).then((res) => toast.success(res.data.message)).catch((err) => toast.error(err.response?.data?.message || "Failed."));
  const toggle = (id) => http.put(`/report/schedules/${id}/toggle`).then(() => loadSchedules()).catch(() => {});
  const del = (id) => http.delete(`/report/schedules/${id}`).then(() => loadSchedules()).catch(() => {});

  const reportTotal = report?.chart?.y?.reduce((a, b) => a + Number(b), 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="lf-card p-4">
        <h3 className="font-semibold text-lf-text mb-3">Run a report</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {TYPES.map(([id, label]) => (
            <button key={id} type="button" onClick={() => run(id)} className={`lf-btn lf-btn-sm ${type === id && report ? "lf-btn-primary" : "lf-btn-outline"}`}>{label}</button>
          ))}
        </div>
        {report && (
          <div>
            <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
              <h4 className="font-semibold text-lf-text">{report.title}</h4>
              <button type="button" onClick={exportCsv} className="lf-btn lf-btn-sm lf-btn-outline flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
            </div>
            {report.table?.length > 0 && (
              <p className="text-xs text-lf-text-subtle mb-3 tabular-nums">
                {report.table.length} row{report.table.length === 1 ? "" : "s"} · total {reportTotal.toLocaleString()}
              </p>
            )}
            <MiniBar chart={report.chart} />
            {report.table?.length > 0 && (
              <div className="mt-4 pt-3 border-t border-lf-border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-lf-text-subtle border-b border-lf-border">
                      {Object.keys(report.table[0]).map((k) => (
                        <th key={k} className="py-1.5 pr-3 capitalize whitespace-nowrap">{k.replace(/([A-Z])/g, " $1")}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.table.map((row, i) => (
                      <tr key={i} className="border-b border-lf-border/60">
                        {Object.values(row).map((v, j) => (
                          <td key={j} className="py-1 pr-3 tabular-nums">{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {!report && <p className="text-sm text-lf-text-subtle">Pick a report above to run it.</p>}
      </div>

      <div className="lf-card p-4">
        <h3 className="font-semibold text-lf-text mb-3">Scheduled reports (UC-30)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mb-4">
          <select className="lf-input" value={sform.reportType} onChange={(e) => setSform({ ...sform, reportType: e.target.value })}>
            {TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <select className="lf-input" value={sform.frequency} onChange={(e) => setSform({ ...sform, frequency: e.target.value })}>
            <option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option>
          </select>
          <select className="lf-input" value={sform.format} onChange={(e) => setSform({ ...sform, format: e.target.value })}>
            <option value="CSV">CSV</option><option value="PDF">PDF</option>
          </select>
          <input className="lf-input" placeholder="recipients (comma-sep)" value={sform.recipients} onChange={(e) => setSform({ ...sform, recipients: e.target.value })} />
          <button type="button" onClick={addSchedule} className="lf-btn lf-btn-primary lf-btn-sm">Add schedule</button>
        </div>
        <div className="space-y-2">
          {schedules.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-lf-border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-lf-text">
                  {TYPES.find(([id]) => id === s.reportType)?.[1] || s.reportType}
                  <span className={`text-xs px-2 py-0.5 rounded-full ml-2 ${s.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                    {s.active ? "Active" : "Paused"}
                  </span>
                </p>
                <p className="text-xs text-lf-text-subtle mt-0.5 truncate">
                  {s.frequency} · {s.format} → {(s.recipients || []).join(", ") || "no recipients"}
                </p>
              </div>
              <span className="flex gap-1 shrink-0">
                <button type="button" onClick={() => runNow(s.id)} className="lf-btn lf-btn-sm lf-btn-outline">Run now</button>
                <button type="button" onClick={() => toggle(s.id)} className="lf-btn lf-btn-sm lf-btn-outline">{s.active ? "Pause" : "Resume"}</button>
                <button type="button" onClick={() => del(s.id)} className="lf-btn lf-btn-sm lf-btn-danger">Delete</button>
              </span>
            </div>
          ))}
          {schedules.length === 0 && <p className="text-sm text-lf-text-subtle">No schedules yet.</p>}
        </div>
      </div>
    </div>
  );
}

/* ===================== Audit trail (UC-21) ===================== */
function AuditTab() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all"); // all | config | leave
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    http.get(`/report/audit${q ? `?q=${encodeURIComponent(q)}` : ""}`).then((res) => setRows(res.data)).catch(() => {});
  }, [q]);
  useEffect(() => { load(); }, [load]);

  // Warns employees (email + in-app) who are currently at risk of losing
  // annual leave at year-end. Lives here because every send is itself an
  // audit-logged action, visible in the list right below once it completes.
  const sendForfeitureReminders = () => {
    setBusy(true);
    http.post("/admin/forfeiture-reminders/trigger", {})
      .then((res) => { toast.success(res.data.message); load(); })
      .catch((err) => toast.error(err.response?.data?.message || "Could not send reminders."))
      .finally(() => setBusy(false));
  };

  const configCount = rows.filter((r) => r.source === "config").length;
  const leaveCount = rows.filter((r) => r.source === "leave").length;
  const filtered = rows.filter((r) => filter === "all" || r.source === filter);

  return (
    <div className="lf-card p-4">
      <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
        <h3 className="font-semibold text-lf-text">Audit trail (read-only)</h3>
        <div className="flex gap-2">
          <input className="lf-input py-1" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button
            type="button"
            onClick={() => downloadCsv(`/report/audit/export${q ? `?q=${encodeURIComponent(q)}` : ""}`, "audit-trail.csv")}
            className="lf-btn lf-btn-sm lf-btn-outline flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>
      </div>
      <p className="text-xs text-lf-text-subtle mb-3">Showing the {rows.length} most recent entries.</p>

      <div className="flex items-center gap-2 mb-3">
        <button type="button" disabled={busy} onClick={sendForfeitureReminders} className="lf-btn lf-btn-sm lf-btn-outline">
          Send forfeiture reminders
        </button>
        <span className="text-xs text-lf-text-subtle">Emails every employee at risk of losing annual leave — each send is logged below.</span>
      </div>

      <div className="flex gap-2 mb-3">
        {[
          ["all", `All (${rows.length})`],
          ["config", `Config (${configCount})`],
          ["leave", `Leave requests (${leaveCount})`],
        ].map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => setFilter(val)}
            className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
              filter === val ? "bg-brand-600 text-white" : "bg-lf-muted text-lf-text-muted hover:bg-lf-border/50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="max-h-[28rem] overflow-y-auto">
        {filtered.map((r) => (
          <div key={r.id} className="flex items-start gap-3 border-b border-lf-border/60 py-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                r.source === "config" ? "bg-indigo-100 text-indigo-700" : "bg-brand-100 text-brand-700"
              }`}
            >
              {r.source === "config" ? <Settings className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-lf-text">{r.action}</p>
              <p className="text-xs text-lf-text-subtle mt-0.5">by {r.actorName}</p>
            </div>
            <span className="text-xs text-lf-text-subtle whitespace-nowrap shrink-0">{fmtDateTime(r.createdAt)}</span>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-sm text-lf-text-subtle py-4 text-center">No audit entries.</p>}
      </div>
    </div>
  );
}

/* ===================== AI-4 insights chatbot (UC-11) ===================== */
function InsightsTab() {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);
  const suggestions = [
    "Which country has the highest leave usage?",
    "Who has unused leave at risk of forfeiture?",
    "How many requests are pending?",
    "Show the sick-leave trend",
  ];
  const ask = (question) => {
    const text = question || q;
    if (!text.trim()) return;
    setBusy(true);
    http.post("/ai/insights", { question: text })
      .then((res) => setAnswer(res.data))
      .catch((err) => toast.error(err.response?.data?.message || "Insights unavailable."))
      .finally(() => setBusy(false));
  };
  return (
    <div className="lf-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-brand-600" />
        <h3 className="font-semibold text-lf-text">Ask about leave data</h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">advisory only</span>
      </div>
      <div className="flex gap-2">
        <input className="lf-input" placeholder="e.g. which country has the highest leave usage?" value={q}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} />
        <button type="button" disabled={busy} onClick={() => ask()} className="lf-btn lf-btn-primary flex items-center gap-1"><Send className="w-4 h-4" /> Ask</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <button key={s} type="button" onClick={() => { setQ(s); ask(s); }} className="text-xs px-2 py-1 rounded-full bg-lf-muted text-lf-text-muted hover:bg-brand-50">{s}</button>
        ))}
      </div>
      {answer && (
        <div className="rounded-xl border border-lf-border p-3 bg-lf-muted/50">
          <p className="text-sm text-lf-text font-medium">{answer.answer}</p>
          {answer.chart && <div className="mt-3"><MiniBar chart={answer.chart} /></div>}
          {!answer.matchedTemplate && answer.suggestions && (
            <p className="text-xs text-lf-text-subtle mt-2">Try: {answer.suggestions.map((s) => s.description).join(" · ")}</p>
          )}
          <p className="text-[11px] text-lf-text-subtle mt-2">Source: {answer.source === "llm" ? "LLM-assisted" : "offline catalogue"} · figures come from pre-defined queries, not free-form SQL.</p>
        </div>
      )}
    </div>
  );
}

/* ===================== AI-5 anomaly flags ===================== */
const RISK_SEVERITY = {
  warning: { cls: "border-amber-200 bg-amber-50", Icon: AlertTriangle, iconCls: "text-amber-600" },
  info: { cls: "border-sky-200 bg-sky-50", Icon: Info, iconCls: "text-sky-600" },
};

function AnomaliesTab() {
  const [data, setData] = useState(null);
  useEffect(() => {
    http.get("/ai/anomalies").then((res) => setData(res.data)).catch(() => {});
  }, []);
  const flags = data?.flags
    ? [...data.flags].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "warning" ? -1 : 1))
    : [];
  const warningCount = flags.filter((f) => f.severity === "warning").length;
  const infoCount = flags.filter((f) => f.severity === "info").length;

  return (
    <div className="lf-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <ShieldAlert className="w-5 h-5 text-amber-600" />
        <h3 className="font-semibold text-lf-text">Risk & anomaly flags</h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">advisory only</span>
      </div>
      {data && (
        <p className="text-xs text-lf-text-subtle mb-3">
          {flags.length === 0 ? "All clear right now." : `${warningCount} warning${warningCount === 1 ? "" : "s"} · ${infoCount} info`}
        </p>
      )}
      {!data && <p className="text-sm text-lf-text-subtle">Loading…</p>}
      {data && flags.length === 0 && <p className="text-sm text-lf-text-subtle">No anomalies detected right now.</p>}
      <div className="space-y-2">
        {flags.map((f, i) => {
          const s = RISK_SEVERITY[f.severity] || RISK_SEVERITY.info;
          const Icon = s.Icon;
          return (
            <div key={i} className={`rounded-lg border px-3 py-2.5 flex items-start gap-2.5 ${s.cls}`}>
              <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${s.iconCls}`} />
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-lf-text-subtle">{f.category}</p>
                <p className="text-sm text-lf-text mt-0.5">{f.message}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ===================== Announcements (UC-26) ===================== */
function AnnouncementsTab() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ title: "", body: "", targetType: "ALL", targetValue: "", startDate: "", endDate: "", requiresAck: false });
  // AI drafting (UC-26): HR describes the announcement in one line and the
  // assistant fills the title/body below. Advisory only — the form stays
  // editable and nothing reaches staff until Publish is clicked.
  const [brief, setBrief] = useState("");
  const [tone, setTone] = useState("NEUTRAL");
  const [drafting, setDrafting] = useState(false);
  const [draftSource, setDraftSource] = useState(null); // "llm" | "heuristic" | null
  const load = useCallback(() => {
    http.get("/announcement").then((res) => setList(res.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  const draftWithAi = () => {
    if (brief.trim().length < 3) { toast.error("Describe the announcement in a few words first."); return; }
    setDrafting(true);
    http.post("/ai/draft-announcement", {
      brief: brief.trim(),
      targetType: form.targetType,
      targetValue: form.targetValue || undefined,
      tone,
    })
      .then((res) => {
        const d = res.data || {};
        setForm((f) => ({
          ...f,
          title: d.title || f.title,
          body: d.body || f.body,
          requiresAck: typeof d.requiresAck === "boolean" ? d.requiresAck : f.requiresAck,
        }));
        setDraftSource(d.source || null);
        toast.success(
          d.source === "llm"
            ? "Draft ready — review and edit before publishing."
            : "Drafted offline (no AI provider configured) — please review carefully."
        );
      })
      .catch((err) => toast.error(err.response?.data?.message || (err.response?.data?.errors || []).join(", ") || "Could not draft."))
      .finally(() => setDrafting(false));
  };
  const create = () => {
    http.post("/announcement", form)
      .then(() => {
        toast.success("Announcement published.");
        setForm({ ...form, title: "", body: "" });
        setBrief(""); setDraftSource(null);
        load();
      })
      .catch((err) => toast.error(err.response?.data?.message || (err.response?.data?.errors || []).join(", ") || "Failed."));
  };
  const deactivate = (id) => http.put(`/announcement/${id}/deactivate`).then(() => load()).catch(() => {});
  return (
    <div className="space-y-4">
      {/* ---- AI-6: draft an announcement from a one-line brief ---- */}
      <div className="lf-card p-4 border-brand-200 bg-brand-50/40">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-brand-700" />
          <h3 className="font-semibold text-lf-text">Draft with AI</h3>
        </div>
        <p className="text-xs text-lf-text-subtle mb-3">
          Describe the announcement in your own words — the assistant writes the title and message
          into the form below. It only uses what you type here, so include any dates or figures you
          want mentioned. Always review before publishing.
        </p>
        <textarea
          className="lf-input"
          rows={2}
          placeholder='e.g. Office closed 24–26 Dec for the year-end shutdown; leave applications for January close on 15 Dec'
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) draftWithAi(); }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
          <label className="flex items-center gap-2 text-xs text-lf-text-muted">
            Tone
            <select className="lf-input py-1 text-xs" value={tone} onChange={(e) => setTone(e.target.value)}>
              <option value="NEUTRAL">Neutral</option>
              <option value="FRIENDLY">Friendly</option>
              <option value="URGENT">Urgent</option>
            </select>
          </label>
          <button type="button" disabled={drafting} onClick={draftWithAi} className="lf-btn lf-btn-primary lf-btn-sm">
            {drafting ? "Drafting…" : "Suggest announcement"}
          </button>
        </div>
        {draftSource && (
          <p className="text-xs text-lf-text-subtle mt-2">
            {draftSource === "llm"
              ? "AI draft loaded below — edit anything before publishing."
              : "No AI provider is configured, so this is a plain rewrite of your brief. Edit it before publishing."}
          </p>
        )}
      </div>

      <div className="lf-card p-4">
        <h3 className="font-semibold text-lf-text mb-3">New announcement</h3>
        <div className="space-y-2">
          <input className="lf-input" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <textarea className="lf-input" rows={3} placeholder="Message" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <select className="lf-input" value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value })}>
              <option value="ALL">Everyone</option><option value="COUNTRY">By country</option><option value="ROLE">By role</option>
            </select>
            {form.targetType !== "ALL" && (
              <input className="lf-input" placeholder={form.targetType === "COUNTRY" ? "SG" : "EMPLOYEE"} value={form.targetValue} onChange={(e) => setForm({ ...form, targetValue: e.target.value })} />
            )}
            <input type="date" className="lf-input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            <input type="date" className="lf-input" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-lf-text-muted">
            <input type="checkbox" checked={form.requiresAck} onChange={(e) => setForm({ ...form, requiresAck: e.target.checked })} /> Require acknowledgement
          </label>
          <div className="flex justify-end">
            <button type="button" onClick={create} className="lf-btn lf-btn-primary lf-btn-sm">Publish</button>
          </div>
        </div>
      </div>
      <div className="lf-card p-4">
        <h3 className="font-semibold text-lf-text mb-3">Published</h3>
        <div className="space-y-2">
          {list.map((a) => (
            <div key={a.id} className="flex items-start justify-between border-b border-lf-border/60 py-2">
              <div>
                <p className="text-sm font-medium text-lf-text">{a.title} {a.requiresAck && <span className="text-xs text-amber-700">(ack)</span>}</p>
                <p className="text-xs text-lf-text-subtle">{a.targetType}{a.targetValue ? ` · ${a.targetValue}` : ""} · {a.startDate} → {a.endDate} · {a.ackCount} ack(s)</p>
              </div>
              {a.active && <button type="button" onClick={() => deactivate(a.id)} className="lf-btn lf-btn-sm lf-btn-outline">End</button>}
            </div>
          ))}
          {list.length === 0 && <p className="text-sm text-lf-text-subtle">Nothing published.</p>}
        </div>
      </div>
    </div>
  );
}

/* ===================== Invitations (UC-24) ===================== */
function InvitationsTab() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ name: "", email: "", country: "SG", team: "Compliance Team A", role: "EMPLOYEE", startDate: "" });
  // Same closed lists as the coverage config, so an invited hire is always
  // given a country that has a holiday calendar and policy configured — that
  // country is what their calendar and entitlement are built from on activation.
  const { countries, teams } = useOrgOptions();
  const [lastInvite, setLastInvite] = useState(null); // { email, link } | null
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    http.get("/invitation").then((res) => setList(res.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  const countryName = (code) => countries.find((c) => c.country === code)?.countryName || code;
  const invite = () => {
    if (!form.name.trim() || !form.email.trim()) { toast.error("Name and email are required."); return; }
    setBusy(true);
    http.post("/invitation", form)
      .then((res) => {
        toast.success(res.data.message);
        // The server tells us whether the email actually went out. If it didn't
        // (no SMTP configured, or the send failed), it returns the ready-to-use
        // link so HR can pass it to the new hire manually.
        setLastInvite({
          email: form.email,
          link: res.data.inviteLink || null,
          emailed: !!res.data.emailed,
          emailError: res.data.emailError || null,
        });
        setForm({ ...form, name: "", email: "", startDate: "" });
        load();
      })
      .catch((err) => toast.error(err.response?.data?.message || (err.response?.data?.errors || []).join(", ") || "Failed."))
      .finally(() => setBusy(false));
  };
  const resendInvite = (v) => {
    http.put(`/invitation/${v.id}/resend`)
      .then((res) => {
        toast.success(res.data.message);
        // If email isn't configured (or failed), surface the fresh link to share.
        if (res.data.inviteLink) {
          setLastInvite({ email: v.email, link: res.data.inviteLink, emailed: false, emailError: res.data.emailError || null });
        } else {
          setLastInvite({ email: v.email, link: null, emailed: true, emailError: null });
        }
        load();
      })
      .catch((err) => toast.error(err.response?.data?.message || "Could not resend."));
  };
  const cancelInvite = (v) => {
    http.put(`/invitation/${v.id}/cancel`)
      .then((res) => { toast.success(res.data.message); load(); })
      .catch((err) => toast.error(err.response?.data?.message || "Could not cancel."));
  };
  const copyLink = () => {
    if (!lastInvite?.link) return;
    navigator.clipboard?.writeText(lastInvite.link)
      .then(() => toast.success("Invite link copied to clipboard."))
      .catch(() => toast.error("Could not copy — select and copy the link manually."));
  };
  return (
    <div className="space-y-4">
      <div className="lf-card p-4">
        <h3 className="font-semibold text-lf-text mb-3">Invite a new employee</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input className="lf-input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="lf-input" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <select className="lf-input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {["EMPLOYEE", "SUPERVISOR", "MANAGER"].map((r) => <option key={r}>{r}</option>)}
          </select>
          <CountrySelect countries={countries} value={form.country} onChange={(v) => setForm({ ...form, country: v })} />
          <TeamSelect teams={teams} value={form.team} onChange={(v) => setForm({ ...form, team: v })} />
          <input type="date" className="lf-input" title="Start date (for pro-ration)" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
        </div>
        <p className="text-xs text-lf-text-subtle mt-2">
          The new hire sees the public-holiday calendar and statutory entitlement for{" "}
          <span className="font-medium">{countryName(form.country)}</span> as soon as they activate
          their account, and any blackout periods for that country or for {form.team}.
        </p>
        <div className="flex justify-end mt-2">
          <button type="button" disabled={busy} onClick={invite} className="lf-btn lf-btn-primary lf-btn-sm">
            {busy ? "Sending…" : "Send invitation"}
          </button>
        </div>

        {lastInvite && lastInvite.link && (
          <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50 p-3">
            <p className="text-sm text-brand-900 font-medium mb-1">Invitation created for {lastInvite.email}</p>
            <p className="text-xs text-brand-800 mb-2">
              {lastInvite.emailError
                ? `The email could not be sent (${lastInvite.emailError}). Share this one-time link with the new hire instead — it opens the account-activation screen and expires in 48 hours.`
                : "No email server is configured (demo mode), so share this one-time link with the new hire. It opens the account-activation screen and expires in 48 hours."}
            </p>
            <div className="flex gap-2 items-stretch">
              <input readOnly value={lastInvite.link} onFocus={(e) => e.target.select()} className="lf-input text-xs flex-1 font-mono" />
              <button type="button" onClick={copyLink} className="lf-btn lf-btn-sm lf-btn-primary whitespace-nowrap">Copy link</button>
              <a href={lastInvite.link} target="_blank" rel="noreferrer" className="lf-btn lf-btn-sm lf-btn-outline whitespace-nowrap">Open</a>
            </div>
          </div>
        )}
        {lastInvite && lastInvite.emailed && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-sm text-emerald-900">
              Invitation email sent to {lastInvite.email}. The activation link expires in 48 hours.
            </p>
          </div>
        )}
      </div>
      <div className="lf-card p-4">
        <h3 className="font-semibold text-lf-text mb-3">Invitations</h3>
        <div className="space-y-1">
          {list.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-2 border-b border-lf-border/60 py-1.5 text-sm">
              <span>{v.name} · {v.email} · {v.role} · {countryName(v.country)} · {v.team}</span>
              <span className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  v.status === "ACCEPTED" ? "bg-emerald-100 text-emerald-800"
                  : v.status === "PENDING" ? "bg-amber-100 text-amber-800"
                  : "bg-slate-100 text-slate-600"
                }`}>{v.status}</span>
                {(v.status === "PENDING" || v.status === "EXPIRED") && (
                  <button
                    type="button"
                    onClick={() => resendInvite(v)}
                    title="Send a fresh 48-hour invitation link to this address"
                    className="lf-btn lf-btn-sm lf-btn-outline"
                  >
                    Resend
                  </button>
                )}
                {v.status === "PENDING" && (
                  <button
                    type="button"
                    onClick={() => cancelInvite(v)}
                    title="Withdraw this invitation and remove the pending account"
                    className="lf-btn lf-btn-sm lf-btn-outline text-rose-600"
                  >
                    Cancel
                  </button>
                )}
              </span>
            </div>
          ))}
          {list.length === 0 && <p className="text-sm text-lf-text-subtle">No invitations yet.</p>}
        </div>
      </div>
    </div>
  );
}


/* ===================== Leave corrections (M2, UC-03 + UC-13) =====================
 * The HR end of two employee-side use cases.
 *
 * "Adjust leave" is the door PUT /leave/:id/cancel points at: once an absence has
 * started, the employee can no longer withdraw it themselves, so HR shortens or
 * voids it here and the right number of days goes back. Every change is audited
 * with the reason typed below.
 *
 * "Certificates outstanding" lists sick leave that ought to have an MC on file
 * and does not, so HR can chase it rather than discovering it at year-end.
 */
function LeaveAdminTab() {
  const [compliance, setCompliance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [requestId, setRequestId] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  const [cancelEntirely, setCancelEntirely] = useState(false);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    http
      .get("/leave/mc-compliance")
      .then((res) => setCompliance(res.data))
      .catch(() => setCompliance(null))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const adjust = () => {
    if (!requestId.trim()) { toast.error("Enter the request number to adjust."); return; }
    if (reason.trim().length < 5) { toast.error("Give a reason (at least 5 characters) — it goes on the audit trail."); return; }
    if (!cancelEntirely && !newEndDate) { toast.error("Pick the new last day of leave, or tick 'void the whole leave'."); return; }
    setBusy(true);
    setResult(null);
    http
      .put(`/leave/${requestId.trim()}/hr-adjust`,
        cancelEntirely
          ? { cancelEntirely: true, reason: reason.trim() }
          : { newEndDate, reason: reason.trim() })
      .then((res) => {
        toast.success(res.data.message);
        setResult(res.data);
        setRequestId(""); setNewEndDate(""); setCancelEntirely(false); setReason("");
        load();
      })
      .catch((err) => toast.error(err.response?.data?.message || (err.response?.data?.errors || []).join(", ") || "Adjustment failed."))
      .finally(() => setBusy(false));
  };

  return (
    <div className="space-y-4">
      <div className="lf-card p-4">
        <h3 className="font-semibold text-lf-text mb-1">Adjust leave</h3>
        <p className="text-sm text-lf-text-muted mb-3">
          For leave that has already started, an employee can no longer withdraw it themselves —
          they are told to ask HR. Shorten it to the day they actually returned, or void it
          entirely. The unused days go straight back to their balance and the change is audited.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            className="lf-input"
            placeholder="Request number (e.g. 128)"
            value={requestId}
            onChange={(e) => setRequestId(e.target.value.replace(/[^0-9]/g, ""))}
          />
          <input
            className="lf-input"
            type="date"
            title="New last day of leave"
            disabled={cancelEntirely}
            value={newEndDate}
            onChange={(e) => setNewEndDate(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-lf-text-muted">
            <input
              type="checkbox"
              className="w-4 h-4 accent-brand-700 rounded"
              checked={cancelEntirely}
              onChange={(e) => setCancelEntirely(e.target.checked)}
            />
            Void the whole leave
          </label>
        </div>
        <input
          className="lf-input mt-2"
          placeholder="Reason (recorded on the audit trail)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex justify-end mt-2">
          <button type="button" disabled={busy} onClick={adjust} className="lf-btn lf-btn-primary lf-btn-sm">
            {busy ? "Applying…" : "Apply adjustment"}
          </button>
        </div>
        {result && (
          <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mt-2">
            {result.message}
          </p>
        )}
      </div>

      <div className="lf-card p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-lf-text">Certificates outstanding</h3>
          {compliance && (
            <span className="text-xs text-lf-text-subtle">
              {compliance.count} to chase · self-declaration allowed up to {compliance.selfDeclarationLimit} day(s)
            </span>
          )}
        </div>
        <p className="text-sm text-lf-text-muted mb-3">
          Sick leave with no medical certificate on file that policy says should have one.
        </p>
        {loading && <p className="text-sm text-lf-text-subtle">Loading…</p>}
        {!loading && compliance && compliance.count === 0 && (
          <p className="text-sm text-emerald-700">Nothing outstanding — every sick leave that needs a certificate has one.</p>
        )}
        {!loading && compliance && compliance.count > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-lf-text-subtle border-b border-lf-border">
                  <th className="py-1.5 pr-3">Request</th>
                  <th className="py-1.5 pr-3">Employee</th>
                  <th className="py-1.5 pr-3">Dates</th>
                  <th className="py-1.5 pr-3">Days</th>
                  <th className="py-1.5 pr-3">Status</th>
                  <th className="py-1.5">Why</th>
                </tr>
              </thead>
              <tbody>
                {compliance.outstanding.map((o) => (
                  <tr key={o.id} className="border-b border-lf-border/60">
                    <td className="py-1.5 pr-3 tabular-nums">REQ-{o.id}</td>
                    <td className="py-1.5 pr-3">
                      {o.employee?.name || "—"}
                      <span className="text-xs text-lf-text-subtle"> · {o.employee?.team}</span>
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {o.startDate}{o.endDate !== o.startDate ? ` → ${o.endDate}` : ""}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums">{o.days}</td>
                    <td className="py-1.5 pr-3">
                      <span className="text-xs bg-lf-muted rounded-full px-2 py-0.5">{o.status.replace("_", " ")}</span>
                    </td>
                    <td className="py-1.5 text-xs text-lf-text-muted">{o.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

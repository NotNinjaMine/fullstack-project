import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import http from "../lib/http";
import NotificationBell from "../components/NotificationBell";
import StaffTable, { useStaff } from "../components/StaffTable";
import { Users, Megaphone, Mail, ClipboardCheck } from "lucide-react";

const remainingOf = (b) => (b ? Number(b.entitled) + Number(b.carried) - Number(b.used) : 0);

// Tiny inline bar chart (no chart lib dependency; SVG) — matches offline-first ethos.
export default function Admin({ user, setToast }) {
  const [tab, setTab] = useState("employees");

  // MEMBER 1 SCOPE — only the HR Admin tabs Member 1 owns are present. The
  // Dashboard, Policies & types, Coverage config, Reports, Audit trail, AI
  // insights and Risk flags tabs belong to Members 4 and 5 and are not part of
  // this deliverable.
  const tabs = [
    ["employees", "Employees", Users],
    ["leadership-approvals", "Leadership approvals", ClipboardCheck],
    ["announcements", "Announcements", Megaphone],
    ["invitations", "Invitations", Mail],
  ];

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-wrap gap-1.5">
          {tabs.map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border ${
                tab === id ? "bg-teal-600 text-white border-transparent" : "bg-white text-lf-text-muted border-lf-border hover:bg-lf-muted"
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
        <NotificationBell />
      </div>

      {tab === "employees" && <EmployeesTab currentUserId={user?.id} />}
      {tab === "leadership-approvals" && <LeadershipApprovalsTab currentUserId={user?.id} />}
      {tab === "announcements" && <AnnouncementsTab />}
      {tab === "invitations" && <InvitationsTab />}
    </main>
  );
}

/* ===================== Dashboard (UC-10b, Member 5) ===================== */
function LeadershipApprovalsTab({ currentUserId }) {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    http.get("/leave/pending")
      .then((res) => setQueue(res.data))
      .catch(() => setQueue([]))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const approve = (id) => {
    setBusyId(id);
    http.put(`/leave/${id}/decide`, { approve: true })
      .then((res) => { toast.success(`Approved. Balance deducted; employee notified.`); load(); })
      .catch((err) => toast.error(err.response?.data?.message || "Could not approve."))
      .finally(() => setBusyId(null));
  };

  const reject = (id) => {
    if (rejectReason.trim().length < 5) { toast.error("Rejection reason must be at least 5 characters."); return; }
    setBusyId(id);
    http.put(`/leave/${id}/decide`, { approve: false, rejectionReason: rejectReason.trim() })
      .then(() => { toast.success("Rejected. Employee notified."); setRejectingId(null); setRejectReason(""); load(); })
      .catch((err) => toast.error(err.response?.data?.message || "Could not reject."))
      .finally(() => setBusyId(null));
  };

  return (
    <div className="lf-card p-4">
      <h3 className="font-semibold text-lf-text mb-1">Leadership approvals</h3>
      <p className="text-xs text-lf-text-subtle mb-3">
        Leave requests from a Manager or HR Admin applying for their own leave — routed here rather than to a
        team Manager, since no one at that level can approve a peer without a conflict of interest.
      </p>
      {loading && <p className="text-sm text-lf-text-subtle">Loading…</p>}
      {!loading && queue.length === 0 && (
        <p className="text-sm text-lf-text-subtle">Nothing awaiting your review right now.</p>
      )}
      <div className="space-y-3">
        {queue.map((r) => (
          <div key={r.id} className="rounded-xl border border-lf-border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-lf-text">
                  {r.employee?.name} <span className="text-xs text-lf-text-subtle">({r.employee?.role})</span>
                </p>
                <p className="text-sm text-lf-text-muted">
                  {r.leaveType.replace("_", " ")} · {r.startDate} → {r.endDate} · {r.days} day(s)
                  {r.flagged && <span className="text-amber-700 font-medium"> · coverage flagged</span>}
                </p>
                <p className="text-sm text-lf-text-subtle mt-1">“{r.reason}”</p>
              </div>
              {rejectingId === r.id ? (
                <div className="flex flex-col gap-1.5 w-full sm:w-64">
                  <textarea
                    className="lf-input text-xs"
                    rows={2}
                    placeholder="Reason for rejection (min 5 characters)"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                  <div className="flex justify-end gap-1.5">
                    <button type="button" onClick={() => { setRejectingId(null); setRejectReason(""); }} className="lf-btn lf-btn-sm lf-btn-ghost">
                      Cancel
                    </button>
                    <button type="button" disabled={busyId === r.id} onClick={() => reject(r.id)} className="lf-btn lf-btn-sm lf-btn-danger">
                      Confirm reject
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <button type="button" disabled={busyId === r.id} onClick={() => approve(r.id)} className="lf-btn lf-btn-sm lf-btn-primary">
                    Approve
                  </button>
                  <button type="button" disabled={busyId === r.id} onClick={() => setRejectingId(r.id)} className="lf-btn lf-btn-sm lf-btn-outline text-rose-600">
                    Reject
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


function EmployeesTab({ currentUserId }) {
  // Shared staff data + actions (same hook the Manager's panel uses, so both
  // views are always in sync).
  const { rows, loading, load, unlock, forceLogout, deactivate, reactivate, deleteForever } = useStaff();
  const [form, setForm] = useState({ name: "", email: "", tempPassword: "", role: "EMPLOYEE", country: "SG", team: "Compliance Team A" });
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
  // M5 (UC-04): year-end carry-forward — preview first, then confirm, mirroring
  // the bulk-entitlement flow. This action forfeits leave, so it should never
  // apply on a single unconfirmed click.
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

      {/* M5 (UC-04): carry-forward preview + confirm */}
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
            forfeited, and the new year's entitlement is reset from policy.
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
                    <td className="text-teal-700 font-medium">{r.carried}</td>
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
        <div className="lf-card p-4 border-teal-200">
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
                      <td className={changes ? "text-teal-700 font-medium" : "text-slate-400"}>
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
          <input className="lf-input" placeholder="Country (SG)" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })} />
          <input className="lf-input" placeholder="Team" value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} />
        </div>
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
          title="Staff"
        />
      </div>
    </div>
  );
}

/* ===================== Policies & Leave types (UC-10b, Member 5) ===================== */
function AnnouncementsTab() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ title: "", body: "", targetType: "ALL", targetValue: "", startDate: "", endDate: "", requiresAck: false });
  const load = useCallback(() => {
    http.get("/announcement").then((res) => setList(res.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  const create = () => {
    http.post("/announcement", form)
      .then(() => { toast.success("Announcement published."); setForm({ ...form, title: "", body: "" }); load(); })
      .catch((err) => toast.error(err.response?.data?.message || (err.response?.data?.errors || []).join(", ") || "Failed."));
  };
  const deactivate = (id) => http.put(`/announcement/${id}/deactivate`).then(() => load()).catch(() => {});
  return (
    <div className="space-y-4">
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
  const [lastInvite, setLastInvite] = useState(null); // { email, link } | null
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    http.get("/invitation").then((res) => setList(res.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
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
          <input className="lf-input" placeholder="Country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })} />
          <input className="lf-input" placeholder="Team" value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} />
          <input type="date" className="lf-input" title="Start date (for pro-ration)" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
        </div>
        <div className="flex justify-end mt-2">
          <button type="button" disabled={busy} onClick={invite} className="lf-btn lf-btn-primary lf-btn-sm">
            {busy ? "Sending…" : "Send invitation"}
          </button>
        </div>

        {lastInvite && lastInvite.link && (
          <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50 p-3">
            <p className="text-sm text-teal-900 font-medium mb-1">Invitation created for {lastInvite.email}</p>
            <p className="text-xs text-teal-800 mb-2">
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
              <span>{v.name} · {v.email} · {v.role} · {v.country}</span>
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


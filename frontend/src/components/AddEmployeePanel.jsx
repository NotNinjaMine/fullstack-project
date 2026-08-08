import { useState } from "react";
import http from "../lib/http";

// M1 (UC-10): "Add employee" — available to Managers and HR Admins. Creates the
// account AND its leave balances in one call (the server provisions balances
// from the employee's country policy), then shows the temporary password once
// so the manager can pass it on.
//
// Extracted into its own component so both the Manager view and the HR Admin
// Employees tab can mount it without duplicating the form.

const genTempPassword = () => {
  // Meets the server rule: >= 8 chars, at least 1 letter and 1 number
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
  const nums = "23456789";
  let p = "";
  for (let i = 0; i < 7; i++) p += chars[Math.floor(Math.random() * chars.length)];
  for (let i = 0; i < 3; i++) p += nums[Math.floor(Math.random() * nums.length)];
  return p;
};

function AddEmployeePanel({ user, isManager, policies, setToast, onDone }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState(user.country || "SG");
  const [role, setRole] = useState("EMPLOYEE");
  const [team, setTeam] = useState(user.team);
  const [annualEntitlement, setAnnualEntitlement] = useState("");
  const [tempPassword, setTempPassword] = useState(genTempPassword());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);

  const policy = policies.find((p) => p.country === country);

  const submit = () => {
    setSaving(true);
    setError("");
    http
      .post("/user/employees", {
        name: name.trim(),
        email: email.trim(),
        tempPassword,
        country,
        role,
        team: team.trim(),
        annualEntitlement: annualEntitlement === "" ? null : Number(annualEntitlement),
      })
      .then((res) => {
        setCreated({ ...res.data, tempPassword });
        setToast(res.data.message);
        setName("");
        setEmail("");
        setAnnualEntitlement("");
        setTempPassword(genTempPassword());
      })
      .catch((err) =>
        setError(
          err.response?.data?.message ||
            (err.response?.data?.errors || []).join("; ") ||
            "Could not add employee."
        )
      )
      .finally(() => setSaving(false));
  };

  const fieldCls = "lf-input";

  return (
    <div className="lf-card-static p-5 border-l-4 border-lf-accent">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-lf-text">Add a new employee</h3>
        <span className="text-xs bg-lf-accent-soft text-lf-accent rounded-full px-2 py-0.5 font-medium">
          {isManager ? "Manager · any team" : `Supervisor · ${user.team} only`}
        </span>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        The account's public-holiday calendar and leave entitlement are set automatically from the
        country you pick, per that country's statutory policy.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm text-slate-600">Full name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={fieldCls} />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">Work email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldCls}
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-600">Country (drives calendar + entitlement)</span>
          <select value={country} onChange={(e) => setCountry(e.target.value)} className={fieldCls}>
            {policies.map((p) => (
              <option key={p.country} value={p.country}>
                {p.countryName} ({p.country}) — {p.annualMin}–{p.annualMax} days annual
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm text-slate-600">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={!isManager}
            className={`${fieldCls} ${!isManager ? "text-slate-400" : ""}`}
          >
            <option value="EMPLOYEE">Employee</option>
            {isManager && <option value="SUPERVISOR">Supervisor</option>}
          </select>
          {!isManager && (
            <span className="text-xs text-slate-400">
              Supervisors can add employees only — ask a Manager to add supervisors.
            </span>
          )}
        </label>

        <label className="block">
          <span className="text-sm text-slate-600">Team</span>
          <input
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            disabled={!isManager}
            className={`${fieldCls} ${!isManager ? "text-slate-400 bg-slate-50" : ""}`}
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-600">
            Annual entitlement{policy ? ` (${policy.annualMin}–${policy.annualMax} days)` : ""}
          </span>
          <input
            type="number"
            min={policy?.annualMin}
            max={policy?.annualMax}
            value={annualEntitlement}
            onChange={(e) => setAnnualEntitlement(e.target.value)}
            placeholder={policy ? `Default: ${policy.annualMin} (statutory minimum)` : ""}
            className={fieldCls}
          />
          {policy && (
            <span className="text-xs text-slate-400">
              Sick leave auto-set by policy: {policy.sickMc}d with MC, {policy.sickNoMc}d without.
              Values outside the range are clamped to it.
            </span>
          )}
        </label>

        <label className="block sm:col-span-2">
          <span className="text-sm text-slate-600">Temporary password (share securely with the new hire)</span>
          <div className="flex gap-2 mt-1">
            <input
              value={tempPassword}
              onChange={(e) => setTempPassword(e.target.value)}
              className="flex-1 border border-slate-300 rounded-lg p-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button
              onClick={() => setTempPassword(genTempPassword())}
              className="text-sm bg-slate-100 hover:bg-slate-200 rounded-lg px-3 text-slate-600"
            >
              Regenerate
            </button>
          </div>
          <span className="text-xs text-slate-400">
            They can change it later via "Forgot password?" on the sign-in page.
          </span>
        </label>
      </div>

      {error && (
        <div className="mt-4 bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-700">
          ⚠ {error}
        </div>
      )}

      {created && (
        <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">
          <p className="font-medium">✓ {created.user.name} added</p>
          <p className="mt-1">
            {created.user.email} · {created.user.role} · {created.user.team} ·{" "}
            {created.policyApplied.countryName} calendar
          </p>
          <p className="mt-1">
            Temporary password: <span className="font-mono">{created.tempPassword}</span> — copy it
            now, it is not shown again.
          </p>
        </div>
      )}

      <div className="mt-5 flex gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={saving || !name.trim() || !email.trim() || !tempPassword}
          className="lf-btn lf-btn-primary"
        >
          {saving ? "Adding…" : "Add employee"}
        </button>
        <button type="button" onClick={onDone} className="lf-btn lf-btn-ghost">
          Done
        </button>
      </div>
    </div>
  );
}
export default AddEmployeePanel;

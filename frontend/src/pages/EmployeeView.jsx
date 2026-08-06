import { useState, useEffect } from "react";
import http from "../lib/http";
import { Info } from "lucide-react";

const typeLabel = (id) =>
  ({ annual: "Annual leave", sick_mc: "Sick leave (with MC)", sick_nomc: "Sick leave (without MC)" }[id] ?? id);

// MEMBER 1 SCOPE — the employee-side page.
//
// In the full system this is Member 2's leave application experience (UC-01,
// UC-03, UC-05, UC-13, UC-14, UC-27 + AI-1) and it is NOT part of Member 1's
// deliverable. It is kept here deliberately, in reduced form, because two of
// Member 1's features can only be demonstrated against it:
//
//   1. The header view switcher — a Supervisor / Manager / HR Admin needs
//      somewhere to switch TO (App.jsx).
//   2. Entitlement provisioning, bulk entitlement update and year-end
//      carry-forward (UC-20, UC-04) all write the balances shown below, so this
//      is where their effect is visible from the employee's own side.
//
// So this page shows the balances Member 1's logic produces, and stops there.
export default function EmployeeView({ user }) {
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    http
      .get("/leave/balances")
      .then((res) => setBalances(res.data))
      .catch(() => setBalances([]))
      .finally(() => setLoading(false));
  }, []);

  const remaining = (b) => Number(b.entitled) + Number(b.carried) - Number(b.used);

  return (
    <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-lf-text">My leave balances</h2>
        <p className="text-sm text-lf-text-subtle">
          {user.name} · {user.team} · {user.country}
        </p>
      </div>

      {loading && <p className="text-sm text-lf-text-subtle">Loading…</p>}

      {!loading && balances.length === 0 && (
        <div className="lf-card p-4">
          <p className="text-sm text-lf-text-subtle">
            No balances found for the current leave year.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {balances.map((b) => (
          <div key={b.leaveType} className="lf-card p-4">
            <p className="text-sm text-lf-text-muted">{typeLabel(b.leaveType)}</p>
            <p className="text-2xl font-semibold text-lf-text mt-1">
              {remaining(b)}
              <span className="text-sm font-normal text-lf-text-subtle"> day(s) left</span>
            </p>
            <p className="text-xs text-lf-text-subtle mt-2">
              Entitled {b.entitled} · carried {b.carried} · used {b.used} · year {b.year}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 flex items-start gap-3">
        <Info className="w-5 h-5 text-teal-700 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-teal-900">
          <p className="font-medium">This is the Member 1 build.</p>
          <p className="text-teal-800 mt-1">
            The leave application form, personal calendar, drafts, sick-leave/MC upload, balance
            forecast and leave swap are Member 2's scope and are not included here. This page exists
            so the header's view switcher has a destination, and so the balances produced by
            entitlement provisioning, bulk entitlement update and year-end carry-forward can be seen
            from the employee's own side.
          </p>
        </div>
      </div>
    </main>
  );
}

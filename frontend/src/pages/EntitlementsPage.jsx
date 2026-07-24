import { useState } from "react";
import toast from "react-hot-toast";
import ConfirmDialog from "../components/common/ConfirmDialog";
import { previewBulkEntitlement, commitBulkEntitlement } from "../services/entitlementService";
import { LEAVE_POLICIES, prorateEntitlement, policyFor } from "../lib/entitlement";

const YEAR = new Date().getFullYear();

// UC-20: bulk yearly entitlement update + new-joiner pro-ration. HR previews
// the computed changes before committing; runs alongside (but is distinct
// from) the automatic year-end carry-forward job (UC-04, Member 5's scope).
export default function EntitlementsPage() {
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [committing, setCommitting] = useState(false);

  const [calcCountry, setCalcCountry] = useState("SG");
  const [calcStart, setCalcStart] = useState("");

  const runPreview = () => {
    setLoadingPreview(true);
    previewBulkEntitlement(YEAR)
      .then(setPreview)
      .catch((err) => toast.error(err.response?.data?.message || "Preview failed."))
      .finally(() => setLoadingPreview(false));
  };

  const commit = () => {
    setCommitting(true);
    commitBulkEntitlement(YEAR)
      .then((res) => {
        toast.success(res.message);
        setConfirmOpen(false);
        setPreview(null);
      })
      .catch((err) => toast.error(err.response?.data?.message || "Commit failed."))
      .finally(() => setCommitting(false));
  };

  const calcPolicy = policyFor(calcCountry);
  const calcResult = calcStart ? prorateEntitlement(calcPolicy.annualMin, calcStart, new Date(calcStart).getFullYear()) : null;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Bulk yearly entitlement</h1>
        <p className="text-sm text-slate-500">
          Assign the statutory minimum annual entitlement to every active employee for {YEAR}, per
          their country policy. Preview the computed changes before committing.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-5 overflow-x-auto">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Country policies</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-100">
              <th className="py-1.5 pr-3">Country</th>
              <th className="pr-3">Annual min–max</th>
              <th className="pr-3">Sick (MC)</th>
              <th className="pr-3">Sick (no MC)</th>
              <th>Carry cap</th>
            </tr>
          </thead>
          <tbody>
            {LEAVE_POLICIES.map((p) => (
              <tr key={p.country} className="border-b border-slate-50">
                <td className="py-1.5 pr-3">{p.countryName} ({p.country})</td>
                <td className="pr-3">{p.annualMin}–{p.annualMax}d</td>
                <td className="pr-3">{p.sickMc}d</td>
                <td className="pr-3">{p.sickNoMc}d</td>
                <td>{p.carryForwardMax}d</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">New-joiner pro-ration calculator</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-slate-600">Country</span>
            <select
              value={calcCountry}
              onChange={(e) => setCalcCountry(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {LEAVE_POLICIES.map((p) => (
                <option key={p.country} value={p.country}>{p.countryName} ({p.country})</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-slate-600">Start date</span>
            <input
              type="date"
              value={calcStart}
              onChange={(e) => setCalcStart(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </label>
        </div>
        {calcResult != null && (
          <p className="text-sm text-teal-800 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2">
            {calcResult} of {calcPolicy.annualMin} annual day(s) — same formula the Invitations screen uses on activation.
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Preview & commit — {YEAR}</h2>
          <button
            type="button"
            onClick={runPreview}
            disabled={loadingPreview}
            className="text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 px-3 py-1.5 disabled:opacity-60"
          >
            {loadingPreview ? "Loading…" : "Preview changes"}
          </button>
        </div>

        {preview && (
          <>
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left text-slate-400 border-b border-slate-100">
                    <th className="py-1.5 pr-3">Employee</th>
                    <th className="pr-3">Country</th>
                    <th className="pr-3">Current</th>
                    <th>Target</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.userId} className="border-b border-slate-50">
                      <td className="py-1.5 pr-3">{r.name}</td>
                      <td className="pr-3">{r.country}</td>
                      <td className="pr-3">{r.currentEntitled ?? "—"}</td>
                      <td className={r.currentEntitled !== r.targetEntitled ? "text-amber-700 font-medium" : ""}>
                        {r.targetEntitled}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="text-sm bg-teal-700 hover:bg-teal-800 text-white rounded-lg px-4 py-2"
              >
                Commit for {preview.rows.length} employee(s)
              </button>
            </div>
          </>
        )}
        {!preview && <p className="text-sm text-slate-400">Run a preview to see the computed changes.</p>}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => !committing && setConfirmOpen(false)}
        onConfirm={commit}
        loading={committing}
        title={`Commit entitlements for ${YEAR}?`}
        message="Every active employee's annual entitlement will be set to their country's statutory minimum. This is written to the audit log."
        confirmLabel="Yes, commit"
      />
    </div>
  );
}

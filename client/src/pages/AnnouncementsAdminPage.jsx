import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import ConfirmDialog from "../components/common/ConfirmDialog";
import {
  listAnnouncements,
  createAnnouncement,
  deactivateAnnouncement,
} from "../services/announcementService";

const EMPTY_FORM = {
  title: "",
  body: "",
  targetType: "ALL",
  targetValue: "",
  startDate: "",
  endDate: "",
  requiresAck: false,
};

const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" }) : "—");

// UC-26: HR composes, targets, and schedules a broadcast; the banner/modal
// itself (shown to every role) lives in components/common/AnnouncementBanner.
export default function AnnouncementsAdminPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [endTarget, setEndTarget] = useState(null);
  const [ending, setEnding] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    listAnnouncements()
      .then(setList)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const publish = () => {
    setSaving(true);
    createAnnouncement(form)
      .then(() => {
        toast.success("Announcement published.");
        setForm(EMPTY_FORM);
        load();
      })
      .catch((err) =>
        toast.error(err.response?.data?.message || (err.response?.data?.errors || []).join(", ") || "Failed.")
      )
      .finally(() => setSaving(false));
  };

  const confirmEnd = () => {
    if (!endTarget) return;
    setEnding(true);
    deactivateAnnouncement(endTarget.id)
      .then(() => {
        toast.success("Announcement ended.");
        setEndTarget(null);
        load();
      })
      .finally(() => setEnding(false));
  };

  const canPublish =
    form.title.trim() && form.body.trim() && form.startDate && form.endDate &&
    (form.targetType === "ALL" || form.targetValue.trim());

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Announcements</h1>
        <p className="text-sm text-slate-500">
          Broadcast a banner (or a mandatory-acknowledge modal) to a targeted audience.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">New announcement</h2>
        <label className="block">
          <span className="text-sm text-slate-600">Title</span>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            maxLength={120}
            className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">Message</span>
          <textarea
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            rows={3}
            maxLength={1000}
            className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <label className="block">
            <span className="text-sm text-slate-600">Audience</span>
            <select
              value={form.targetType}
              onChange={(e) => setForm({ ...form, targetType: e.target.value, targetValue: "" })}
              className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="ALL">Everyone</option>
              <option value="COUNTRY">By country</option>
              <option value="ROLE">By role</option>
            </select>
          </label>
          {form.targetType !== "ALL" && (
            <label className="block">
              <span className="text-sm text-slate-600">{form.targetType === "COUNTRY" ? "Country code" : "Role"}</span>
              {form.targetType === "ROLE" ? (
                <select
                  value={form.targetValue}
                  onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">Select…</option>
                  {["EMPLOYEE", "SUPERVISOR", "MANAGER", "HR_ADMIN"].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={form.targetValue}
                  onChange={(e) => setForm({ ...form, targetValue: e.target.value.toUpperCase() })}
                  placeholder="SG"
                  maxLength={2}
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              )}
            </label>
          )}
          <label className="block">
            <span className="text-sm text-slate-600">Start date</span>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </label>
          <label className="block">
            <span className="text-sm text-slate-600">End date</span>
            <input
              type="date"
              value={form.endDate}
              min={form.startDate || undefined}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={form.requiresAck}
            onChange={(e) => setForm({ ...form, requiresAck: e.target.checked })}
          />
          Require acknowledgement (blocks navigation until confirmed)
        </label>
        <div className="flex justify-end">
          <button
            type="button"
            disabled={saving || !canPublish}
            onClick={publish}
            className="text-sm bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white rounded-lg px-4 py-2"
          >
            {saving ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Published</h2>
        {loading && <p className="text-sm text-slate-400">Loading…</p>}
        {!loading && list.length === 0 && <p className="text-sm text-slate-400">Nothing published yet.</p>}
        <div className="divide-y divide-slate-100">
          {list.map((a) => (
            <div key={a.id} className="py-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-700">
                  {a.title} {a.requiresAck && <span className="text-xs text-amber-700 font-normal">(mandatory ack)</span>}
                  {!a.active && <span className="text-xs text-slate-400 font-normal"> · ended</span>}
                </p>
                <p className="text-xs text-slate-400">
                  {a.targetType}{a.targetValue ? ` · ${a.targetValue}` : ""} · {fmt(a.startDate)} – {fmt(a.endDate)} · {a.ackCount} ack(s)
                </p>
              </div>
              {a.active && (
                <button
                  type="button"
                  onClick={() => setEndTarget(a)}
                  className="text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 px-3 py-1.5 shrink-0"
                >
                  End now
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={!!endTarget}
        onClose={() => !ending && setEndTarget(null)}
        onConfirm={confirmEnd}
        loading={ending}
        title="End this announcement?"
        message="It will stop appearing for new logins immediately."
        confirmLabel="End announcement"
      />
    </div>
  );
}

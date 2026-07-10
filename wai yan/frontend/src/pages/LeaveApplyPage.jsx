import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { LEAVE_TYPES } from '../utils/constants';
import * as leaveService from '../services/leaveService';
import * as aiService from '../services/aiService';
import { useNotifications } from '../hooks/useNotifications';
import { useAuth } from '../hooks/useAuth';
import ApplicantDetailsForm from '../components/leave/ApplicantDetailsForm';
import { applicantFromUser } from '../utils/applicantProfile';

const emptyForm = {
  leave_type: 'annual',
  start_date: '',
  end_date: '',
  half_day_flag: false,
  half_day_period: 'AM',
  remarks: '',
};

export default function LeaveApplyPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { fetchNotifications } = useNotifications();
  const [form, setForm] = useState(emptyForm);
  const [applicant, setApplicant] = useState(() => applicantFromUser(user));
  const [overlap, setOverlap] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [nlInput, setNlInput] = useState('');
  const [nlBusy, setNlBusy] = useState(false);
  const [tips, setTips] = useState('');
  const [tipsBusy, setTipsBusy] = useState(false);

  // ENH-5: prefill from profile when user loads; fields stay fully editable
  useEffect(() => {
    if (user) setApplicant(applicantFromUser(user));
  }, [user]);

  const update = (field, value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'half_day_flag' && value) {
        next.end_date = next.start_date || next.end_date;
      }
      return next;
    });
  };

  useEffect(() => {
    if (!form.start_date || !form.end_date) {
      setOverlap(null);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const data = await leaveService.checkOverlap(form.start_date, form.end_date);
        if (!cancelled) setOverlap(data);
      } catch {
        if (!cancelled) setOverlap(null);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.start_date, form.end_date]);

  const handleParseNl = async () => {
    if (!nlInput.trim()) {
      toast.error('Describe your leave first');
      return;
    }
    setNlBusy(true);
    try {
      const parsed = await aiService.parseNaturalLanguageLeave(nlInput.trim());
      setForm((prev) => ({
        ...prev,
        leave_type: parsed.leave_type || prev.leave_type,
        start_date: parsed.start_date || prev.start_date,
        end_date: parsed.end_date || parsed.start_date || prev.end_date,
        half_day_flag: Boolean(parsed.half_day_flag),
        half_day_period: parsed.half_day_period || prev.half_day_period,
        remarks: parsed.remarks || prev.remarks,
      }));
      toast.success(
        parsed.confidence
          ? `Form filled (confidence ${Math.round(parsed.confidence * 100)}%)`
          : 'AI filled what it could — check the form'
      );
      if (parsed.parse_notes) toast(parsed.parse_notes, { icon: 'ℹ️' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'AI parse failed');
    } finally {
      setNlBusy(false);
    }
  };

  const handleTips = async () => {
    setTipsBusy(true);
    try {
      const data = await aiService.getLeaveTips({
        leave_type: form.leave_type,
        start_date: form.start_date,
        end_date: form.end_date,
        half_day_flag: form.half_day_flag,
        has_overlap: overlap?.has_overlap,
      });
      setTips(data.tips || '');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not get tips');
    } finally {
      setTipsBusy(false);
    }
  };

  const handleImproveRemarks = async () => {
    try {
      const data = await aiService.improveRemarks(form.remarks);
      update('remarks', data.remarks || form.remarks);
      toast.success('Remarks polished');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Improve failed');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!applicant.name?.trim()) {
      toast.error('Applicant name is required');
      return;
    }
    if (form.half_day_flag && form.start_date !== form.end_date) {
      toast.error('Half-day leave must be a single calendar day');
      return;
    }
    setSubmitting(true);
    try {
      // ENH-5: retain request-specific applicant overrides without changing HR records.
      const nameOverride = applicant.name?.trim() || null;
      const deptOverride = applicant.department?.trim() || null;
      const profileName = (user?.name || '').trim();
      const profileDept = (user?.department || '').trim();

      const payload = {
        leave_type: form.leave_type,
        start_date: form.start_date,
        end_date: form.half_day_flag ? form.start_date : form.end_date,
        half_day_flag: form.half_day_flag,
        half_day_period: form.half_day_flag ? form.half_day_period : null,
        remarks: form.remarks || null,
        // Only persist values that differ from the staff profile.
        applicant_name_override:
          nameOverride && nameOverride !== profileName ? nameOverride : null,
        applicant_department_override:
          deptOverride && deptOverride !== profileDept ? deptOverride : null,
      };

      const result = await leaveService.applyLeave(payload);
      toast.success(
        result.overlap_flag
          ? 'Leave submitted with overlap flag'
          : 'Leave request submitted'
      );
      fetchNotifications().catch(() => {});
      navigate(`/leave/${result.id}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit leave');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'min-h-[2.75rem] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-indigo-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 sm:space-y-6 xl:max-w-3xl 2xl:max-w-4xl">
      <div>
        <h1 className="page-title">Apply for leave</h1>
        <p className="page-subtitle mt-1">
          Submit for supervisor and manager approval. Applicant details are pre-filled
          from your profile but fully editable (ENH-5).
        </p>
      </div>

      <ApplicantDetailsForm
        value={applicant}
        onChange={setApplicant}
        systemRole={user?.role}
      />

      {/* AI-1 natural language assist */}
      <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-800 dark:bg-indigo-950/30">
        <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">
          AI leave assistant
        </p>
        <p className="mt-0.5 text-xs text-indigo-700 dark:text-indigo-300">
          Describe leave in plain English — we fill the form for you to review.
        </p>
        <textarea
          rows={2}
          value={nlInput}
          onChange={(e) => setNlInput(e.target.value)}
          placeholder='e.g. "I need annual leave next Monday to Wednesday for a family trip"'
          className="mt-2 w-full rounded-lg border border-indigo-100 bg-white px-3 py-2 text-sm outline-none ring-indigo-500 focus:ring-2 dark:border-indigo-800 dark:bg-slate-900 dark:text-slate-100"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={nlBusy}
            onClick={handleParseNl}
            className="touch-target rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {nlBusy ? 'Parsing…' : 'Fill form with AI'}
          </button>
          <button
            type="button"
            disabled={tipsBusy}
            onClick={handleTips}
            className="touch-target rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-sm font-medium text-indigo-800 hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-700 dark:bg-slate-900 dark:text-indigo-200 dark:hover:bg-slate-800"
          >
            {tipsBusy ? '…' : 'Get AI tips'}
          </button>
        </div>
        {tips && (
          <p className="mt-2 rounded-lg bg-white/80 px-3 py-2 text-xs text-indigo-950 dark:bg-slate-900/80 dark:text-indigo-100">
            {tips}
          </p>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6"
      >
        {/* ENH-6: single column mobile, two-column on lg+ */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Leave type
            </label>
            <select
              value={form.leave_type}
              onChange={(e) => update('leave_type', e.target.value)}
              className={inputClass}
            >
              {LEAVE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Start date
            </label>
            <input
              type="date"
              required
              value={form.start_date}
              onChange={(e) => update('start_date', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              End date
            </label>
            <input
              type="date"
              required
              disabled={form.half_day_flag}
              value={form.half_day_flag ? form.start_date : form.end_date}
              onChange={(e) => update('end_date', e.target.value)}
              className={`${inputClass} disabled:bg-slate-50 dark:disabled:bg-slate-800/50`}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex min-h-[2.75rem] items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={form.half_day_flag}
              onChange={(e) => update('half_day_flag', e.target.checked)}
              className="rounded border-slate-300 text-indigo-600"
            />
            Half day
          </label>
          {form.half_day_flag && (
            <select
              value={form.half_day_period}
              onChange={(e) => update('half_day_period', e.target.value)}
              className="min-h-[2.75rem] rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          )}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Remarks
            </label>
            <button
              type="button"
              onClick={handleImproveRemarks}
              className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Polish with AI
            </button>
          </div>
          <textarea
            rows={3}
            value={form.remarks}
            onChange={(e) => update('remarks', e.target.value)}
            placeholder="Optional reason"
            className={inputClass}
          />
        </div>

        {overlap?.has_overlap && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            <p className="font-medium">Team overlap detected</p>
            <ul className="mt-1 list-inside list-disc text-amber-800 dark:text-amber-200">
              {(overlap.overlapping_members || []).map((m) => (
                <li key={`${m.user_id}-${m.start_date}`}>
                  {m.name} ({m.leave_type}) {m.start_date} – {m.end_date}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => navigate('/leave')}
            className="touch-target rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="touch-target rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit request'}
          </button>
        </div>
      </form>
    </div>
  );
}

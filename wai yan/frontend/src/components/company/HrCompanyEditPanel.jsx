import { useState } from 'react';
import toast from 'react-hot-toast';
import * as dashboardService from '../../services/dashboardService';
import { OFFICE_COUNTRIES, FLAG } from '../../utils/company';

const emptyOffice = () => ({
  code: '',
  country: '',
  flag: '',
  branch: '',
  city: '',
  address: '',
  approx_staff: 0,
  is_hq: false,
  phone: '',
  email: '',
  notes: '',
});

/**
 * HR-only panel: edit company details + per-country office addresses.
 */
export default function HrCompanyEditPanel({ company, onSaved }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({
    name: company?.name || '',
    short_name: company?.short_name || '',
    reg_no: company?.reg_no || '',
    hq_country: company?.hq_country || '',
    hq_country_code: company?.hq_country_code || 'SG',
    hq_address: company?.hq_address || '',
    staff_count: company?.staff_count ?? 60,
    industry: company?.industry || '',
    timezone_primary: company?.timezone_primary || '',
    website: company?.website || '',
    description: company?.description || '',
  });
  const [offices, setOffices] = useState(
    () =>
      (company?.offices || []).map((o) => ({
        code: o.code,
        country: o.country,
        flag: o.flag || FLAG[o.code] || '',
        branch: o.branch,
        city: o.city || '',
        address: o.address || '',
        approx_staff: o.approx_staff || 0,
        is_hq: Boolean(o.is_hq),
        phone: o.phone || '',
        email: o.email || '',
        notes: o.notes || '',
      }))
  );

  const resetFromCompany = () => {
    setProfile({
      name: company?.name || '',
      short_name: company?.short_name || '',
      reg_no: company?.reg_no || '',
      hq_country: company?.hq_country || '',
      hq_country_code: company?.hq_country_code || 'SG',
      hq_address: company?.hq_address || '',
      staff_count: company?.staff_count ?? 60,
      industry: company?.industry || '',
      timezone_primary: company?.timezone_primary || '',
      website: company?.website || '',
      description: company?.description || '',
    });
    setOffices(
      (company?.offices || []).map((o) => ({
        code: o.code,
        country: o.country,
        flag: o.flag || FLAG[o.code] || '',
        branch: o.branch,
        city: o.city || '',
        address: o.address || '',
        approx_staff: o.approx_staff || 0,
        is_hq: Boolean(o.is_hq),
        phone: o.phone || '',
        email: o.email || '',
        notes: o.notes || '',
      }))
    );
  };

  const setOfficeField = (index, field, value) => {
    setOffices((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      if (field === 'code') {
        const code = String(value || '').toUpperCase().slice(0, 2);
        next[index].code = code;
        const meta = OFFICE_COUNTRIES.find((c) => c.code === code);
        if (meta) {
          if (!next[index].country) next[index].country = meta.label;
          if (!next[index].flag) next[index].flag = meta.flag;
        }
      }
      if (field === 'is_hq' && value) {
        next.forEach((o, i) => {
          if (i !== index) o.is_hq = false;
        });
      }
      return next;
    });
  };

  const addOffice = () => {
    setOffices((prev) => [...prev, emptyOffice()]);
  };

  const removeOffice = (index) => {
    setOffices((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!profile.name?.trim()) {
      toast.error('Company name is required');
      return;
    }
    if (offices.length === 0) {
      toast.error('At least one office is required');
      return;
    }
    for (const o of offices) {
      if (!o.code || String(o.code).length !== 2) {
        toast.error('Each office needs a 2-letter country code');
        return;
      }
      if (!o.branch?.trim()) {
        toast.error(`Branch name required for ${o.code || 'office'}`);
        return;
      }
    }

    setSaving(true);
    try {
      await dashboardService.updateCompany({
        name: profile.name.trim(),
        short_name: profile.short_name.trim(),
        reg_no: profile.reg_no.trim(),
        hq_country: profile.hq_country.trim(),
        hq_country_code: String(profile.hq_country_code || 'SG')
          .toUpperCase()
          .slice(0, 2),
        hq_address: profile.hq_address.trim(),
        staff_count: Number(profile.staff_count) || 0,
        industry: profile.industry.trim(),
        timezone_primary: profile.timezone_primary.trim(),
        website: profile.website.trim(),
        description: profile.description.trim(),
      });

      await dashboardService.replaceOffices(
        offices.map((o, i) => ({
          ...o,
          code: String(o.code).toUpperCase().slice(0, 2),
          approx_staff: Number(o.approx_staff) || 0,
          sort_order: i,
        }))
      );

      toast.success('Company details saved');
      setOpen(false);
      if (onSaved) await onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save company details');
    } finally {
      setSaving(false);
    }
  };

  const input =
    'min-h-[2.75rem] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-indigo-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm dark:border-amber-800 dark:bg-amber-950/30 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
            HR admin panel
          </p>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-50 sm:text-lg">
            Edit company & country offices
          </h2>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300 sm:text-sm">
            Update HQ details, headcount, and office addresses in each country. Changes are
            saved to the database for everyone.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!open) resetFromCompany();
            setOpen((v) => !v);
          }}
          className="touch-target rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
        >
          {open ? 'Close editor' : 'Open edit panel'}
        </button>
      </div>

      {open && (
        <div className="mt-5 space-y-6 border-t border-amber-200/80 pt-5 dark:border-amber-800/60">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Company details</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Legal name *" value={profile.name} onChange={(v) => setProfile((p) => ({ ...p, name: v }))} className={input} />
              <Field label="Short name" value={profile.short_name} onChange={(v) => setProfile((p) => ({ ...p, short_name: v }))} className={input} />
              <Field label="Reg. no / UEN" value={profile.reg_no} onChange={(v) => setProfile((p) => ({ ...p, reg_no: v }))} className={input} />
              <Field label="Approx. staff" type="number" value={profile.staff_count} onChange={(v) => setProfile((p) => ({ ...p, staff_count: v }))} className={input} />
              <Field label="HQ country" value={profile.hq_country} onChange={(v) => setProfile((p) => ({ ...p, hq_country: v }))} className={input} />
              <Field label="HQ country code" value={profile.hq_country_code} onChange={(v) => setProfile((p) => ({ ...p, hq_country_code: v }))} className={input} />
              <div className="sm:col-span-2">
                <Field label="HQ address" value={profile.hq_address} onChange={(v) => setProfile((p) => ({ ...p, hq_address: v }))} className={input} />
              </div>
              <Field label="Industry" value={profile.industry} onChange={(v) => setProfile((p) => ({ ...p, industry: v }))} className={input} />
              <Field label="Primary timezone" value={profile.timezone_primary} onChange={(v) => setProfile((p) => ({ ...p, timezone_primary: v }))} className={input} />
              <div className="sm:col-span-2">
                <Field label="Website" value={profile.website} onChange={(v) => setProfile((p) => ({ ...p, website: v }))} className={input} />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Description</label>
                <textarea
                  rows={3}
                  value={profile.description}
                  onChange={(e) => setProfile((p) => ({ ...p, description: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none ring-indigo-500 focus:ring-2"
                />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                Offices by country ({offices.length})
              </h3>
              <button
                type="button"
                onClick={addOffice}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                + Add office
              </button>
            </div>

            <div className="space-y-4">
              {offices.map((o, idx) => (
                <div
                  key={`${o.code}-${idx}`}
                  className={`rounded-xl border bg-white dark:bg-slate-900 p-3 sm:p-4 ${
                    o.is_hq ? 'border-indigo-200 ring-1 ring-indigo-100' : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {o.flag || '🏢'} Office #{idx + 1}
                      {o.code ? ` · ${o.code}` : ''}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={Boolean(o.is_hq)}
                          onChange={(e) => setOfficeField(idx, 'is_hq', e.target.checked)}
                        />
                        HQ
                      </label>
                      <button
                        type="button"
                        onClick={() => removeOffice(idx)}
                        className="text-xs font-medium text-red-600 hover:underline"
                        disabled={offices.length <= 1}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <Field
                      label="Country code *"
                      value={o.code}
                      onChange={(v) => setOfficeField(idx, 'code', v)}
                      className={input}
                      placeholder="SG"
                    />
                    <Field
                      label="Country name *"
                      value={o.country}
                      onChange={(v) => setOfficeField(idx, 'country', v)}
                      className={input}
                    />
                    <Field
                      label="Flag emoji"
                      value={o.flag}
                      onChange={(v) => setOfficeField(idx, 'flag', v)}
                      className={input}
                    />
                    <Field
                      label="Branch name *"
                      value={o.branch}
                      onChange={(v) => setOfficeField(idx, 'branch', v)}
                      className={input}
                      placeholder="Yangon Branch (Myanmar)"
                    />
                    <Field
                      label="City"
                      value={o.city}
                      onChange={(v) => setOfficeField(idx, 'city', v)}
                      className={input}
                    />
                    <Field
                      label="Approx. staff"
                      type="number"
                      value={o.approx_staff}
                      onChange={(v) => setOfficeField(idx, 'approx_staff', v)}
                      className={input}
                    />
                    <div className="sm:col-span-2 lg:col-span-3">
                      <Field
                        label="Office address"
                        value={o.address}
                        onChange={(v) => setOfficeField(idx, 'address', v)}
                        className={input}
                        placeholder="Full street address in this country"
                      />
                    </div>
                    <Field
                      label="Office phone"
                      value={o.phone}
                      onChange={(v) => setOfficeField(idx, 'phone', v)}
                      className={input}
                    />
                    <Field
                      label="Office email"
                      value={o.email}
                      onChange={(v) => setOfficeField(idx, 'email', v)}
                      className={input}
                    />
                    <Field
                      label="Notes"
                      value={o.notes}
                      onChange={(v) => setOfficeField(idx, 'notes', v)}
                      className={input}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                resetFromCompany();
                setOpen(false);
              }}
              className="touch-target rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="touch-target rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save company & offices'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, className, type = 'text', placeholder }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">{label}</label>
      <input
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={className}
      />
    </div>
  );
}

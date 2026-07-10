import { useEffect, useRef, useState } from 'react';
import * as authService from '../../services/authService';
import { OFFICE_COUNTRIES } from '../../utils/company';

const OFFICE_OPTIONS = OFFICE_COUNTRIES.filter((c) => c.code !== 'ALL');


/**
 * Editable applicant details for leave apply.
 * Prefills from login profile; all fields can be changed.
 * Typing name / employee ID / email suggests matches from the staff database.
 */
export default function ApplicantDetailsForm({ value, onChange, systemRole }) {
  const [suggestions, setSuggestions] = useState([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestField, setSuggestField] = useState(null);
  const [searching, setSearching] = useState(false);
  const boxRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) {
        setSuggestOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const setField = (field, v) => {
    onChange({ ...value, [field]: v });
  };

  const runSuggest = (field, text) => {
    setField(field, text);
    setSuggestField(field);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!text || String(text).trim().length < 1) {
      setSuggestions([]);
      setSuggestOpen(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const rows = await authService.searchStaff(text, 10);
        setSuggestions(rows);
        setSuggestOpen(rows.length > 0);
      } catch {
        setSuggestions([]);
        setSuggestOpen(false);
      } finally {
        setSearching(false);
      }
    }, 280);
  };

  const applySuggestion = (staff) => {
    onChange({
      ...value,
      employee_id: staff.employee_id || value.employee_id,
      name: staff.name || value.name,
      email: staff.email || value.email,
      phone: staff.phone || value.phone,
      job_title: staff.job_title || value.job_title,
      department: staff.department || value.department,
      office_branch: staff.office_branch || value.office_branch,
      office_city: staff.office_city || value.office_city,
      office_country: staff.office_country || value.office_country,
      country_code: staff.country_code || value.country_code,
      personal_address: staff.personal_address || value.personal_address,
      company_name: staff.company_name || value.company_name,
      company_address: staff.company_address || value.company_address,
    });
    setSuggestOpen(false);
    setSuggestions([]);
  };

  const fillOfficeFromCountry = (code) => {
    const office = OFFICE_OPTIONS.find((o) => o.code === code);
    onChange({
      ...value,
      country_code: code,
      office_country: office?.label || value.office_country,
      // Branch/city stay editable — only suggest country label
    });
  };

  const inputClass =
    'min-h-[2.75rem] w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-indigo-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';

  return (
    <section
      ref={boxRef}
      className="relative space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-700">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Applicant details
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Prefill from your profile or staff directory — all fields are editable. Suggestions
            are optional; nothing is locked.
          </p>
        </div>
        {systemRole && (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            System role: {String(systemRole).replace(/_/g, ' ')} (not editable here)
          </span>
        )}
      </div>

      {/* ENH-6: 1-col mobile → 2-col tablet → 3-col large desktop */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
        <SuggestField
          label="Employee ID"
          value={value.employee_id}
          onChange={(v) => runSuggest('employee_id', v)}
          onFocus={() => {
            setSuggestField('employee_id');
            if (suggestions.length) setSuggestOpen(true);
          }}
          placeholder="e.g. AGS-EMP-101"
          className={inputClass}
          showSuggest={suggestOpen && suggestField === 'employee_id'}
          suggestions={suggestions}
          searching={searching}
          onPick={applySuggestion}
        />
        <SuggestField
          label="Full name"
          value={value.name}
          onChange={(v) => runSuggest('name', v)}
          onFocus={() => {
            setSuggestField('name');
            if (suggestions.length) setSuggestOpen(true);
          }}
          placeholder="Type to search staff…"
          className={inputClass}
          required
          showSuggest={suggestOpen && suggestField === 'name'}
          suggestions={suggestions}
          searching={searching}
          onPick={applySuggestion}
        />
        <SuggestField
          label="Work email"
          value={value.email}
          onChange={(v) => runSuggest('email', v)}
          onFocus={() => {
            setSuggestField('email');
            if (suggestions.length) setSuggestOpen(true);
          }}
          placeholder="name@company.com"
          className={inputClass}
          type="email"
          showSuggest={suggestOpen && suggestField === 'email'}
          suggestions={suggestions}
          searching={searching}
          onPick={applySuggestion}
        />
        <Field
          label="Phone"
          value={value.phone}
          onChange={(v) => setField('phone', v)}
          placeholder="+65…"
          className={inputClass}
        />
        <Field
          label="Job title"
          value={value.job_title}
          onChange={(v) => setField('job_title', v)}
          placeholder="e.g. Finance Executive"
          className={inputClass}
        />
        <Field
          label="Department"
          value={value.department}
          onChange={(v) => setField('department', v)}
          placeholder="e.g. Finance"
          className={inputClass}
        />
        <Field
          label="Office branch"
          value={value.office_branch}
          onChange={(v) => setField('office_branch', v)}
          placeholder="e.g. Singapore HQ / Yangon Branch"
          className={inputClass}
        />
        <Field
          label="Office city"
          value={value.office_city}
          onChange={(v) => setField('office_city', v)}
          placeholder="City"
          className={inputClass}
        />
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
            Leave country (PH calendar)
          </label>
          <select
            value={value.country_code || 'SG'}
            onChange={(e) => fillOfficeFromCountry(e.target.value)}
            className={inputClass}
          >
            {OFFICE_OPTIONS.map((o) => (
              <option key={o.code} value={o.code}>
                {o.flag} {o.label} ({o.code})
              </option>
            ))}
          </select>
        </div>
        <Field
          label="Office country"
          value={value.office_country}
          onChange={(v) => setField('office_country', v)}
          placeholder="Country name"
          className={inputClass}
        />
        <div className="sm:col-span-2">
          <Field
            label="Personal address"
            value={value.personal_address}
            onChange={(v) => setField('personal_address', v)}
            placeholder="Home / mailing address"
            className={inputClass}
          />
        </div>
        <Field
          label="Company name"
          value={value.company_name}
          onChange={(v) => setField('company_name', v)}
          placeholder="Company legal name"
          className={inputClass}
        />
        <div className="sm:col-span-2">
          <Field
            label="Company / office address"
            value={value.company_address}
            onChange={(v) => setField('company_address', v)}
            placeholder="Workplace address"
            className={inputClass}
          />
        </div>
      </div>

      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        Tip: start typing a colleague’s name or employee ID to auto-fill from the staff database.
        Name and department changes are stored as request-specific overrides; your employee ID,
        job title, and office remain HR-managed profile data.
      </p>
    </section>
  );
}

function Field({ label, value, onChange, placeholder, className, type = 'text', required }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
        {label}
        {required ? ' *' : ''}
      </label>
      <input
        type={type}
        value={value || ''}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
    </div>
  );
}

function SuggestField({
  label,
  value,
  onChange,
  onFocus,
  placeholder,
  className,
  type = 'text',
  required,
  showSuggest,
  suggestions,
  searching,
  onPick,
}) {
  return (
    <div className="relative">
      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
        {label}
        {required ? ' *' : ''}
        {searching && showSuggest ? (
          <span className="ml-1 font-normal text-indigo-500">searching…</span>
        ) : null}
      </label>
      <input
        type={type}
        value={value || ''}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {showSuggest && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-800">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onPick(s)}
                className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-indigo-50 dark:hover:bg-indigo-950"
              >
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {s.name}
                  {s.employee_id ? (
                    <span className="ml-1 font-mono text-xs text-indigo-700 dark:text-indigo-300">
                      {s.employee_id}
                    </span>
                  ) : null}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {[s.job_title, s.department, s.office_branch, s.email]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

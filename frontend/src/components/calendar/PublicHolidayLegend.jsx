import { fmt } from "../../lib/dates";

// Colour legend for holiday/leave markers + the country's holiday list (UC-06)
export default function PublicHolidayLegend({ holidays, country }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <h2 className="font-semibold mb-3">Public holidays · {country}</h2>
      <ul className="space-y-1.5 text-sm mb-4">
        {holidays.map((h) => (
          <li key={h.date} className="flex justify-between">
            <span className="text-slate-700">{h.name}</span>
            <span className="text-slate-400">{fmt(h.date)}</span>
          </li>
        ))}
      </ul>
      <div className="border-t border-slate-100 pt-3 space-y-1.5 text-xs text-slate-500">
        <p>🎌 Public holiday</p>
        <p>
          <span className="inline-block w-3 h-3 rounded bg-slate-500 align-middle mr-1" /> Teammate away
        </p>
        <p>
          <span className="inline-block w-3 h-3 rounded bg-teal-600 align-middle mr-1" /> Your approved leave
        </p>
      </div>
      <p className="text-xs text-slate-400 mt-3">
        Imported annually per country (UC-06). Leave crossing a holiday never deducts balance.
      </p>
    </div>
  );
}

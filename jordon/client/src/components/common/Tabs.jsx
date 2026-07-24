// Shared tab strip — used by the Profile page (Profile / Password /
// Notifications / Sessions) and available to any other member's screens.
export default function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-5" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={`px-3 py-2 text-sm rounded-lg border ${
            active === t.id
              ? "bg-teal-700 text-white border-transparent"
              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

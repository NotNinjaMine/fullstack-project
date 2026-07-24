import { fmt } from "../../lib/dates";

// AI-2 Smart Coverage Analyzer — server-computed coverage explanation (UC-01, UC-07)
export default function OverlapWarningBanner({ coverage, onUseAlternative }) {
  const conflicts = coverage?.conflicts ?? [];
  if (conflicts.length === 0) return null;

  return (
    <div className="mt-4 bg-amber-50 border border-amber-300 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-amber-900 text-sm">Team coverage warning</h3>
        <span className="text-xs bg-amber-200 text-amber-900 rounded-full px-2 py-0.5">
          AI-2 · Smart Coverage Analyzer
        </span>
      </div>
      <p className="text-sm text-amber-900 mt-2">
        If this leave is approved, your team drops below the minimum of {coverage.minPresent} of{" "}
        {coverage.teamSize} members present on {conflicts.length} day(s):
      </p>
      <ul className="mt-2 space-y-1 text-sm text-amber-900">
        {conflicts.map((c) => (
          <li key={c.date}>
            • <span className="font-medium">{fmt(c.date)}</span> — {c.explanation}
          </li>
        ))}
      </ul>
      {coverage.alternative && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-sm text-amber-900">
            Nearest range with full coverage:{" "}
            <span className="font-medium">
              {fmt(coverage.alternative.start)} – {fmt(coverage.alternative.end)}
            </span>
          </p>
          <button
            onClick={() => onUseAlternative?.(coverage.alternative)}
            className="text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-3 py-1.5"
          >
            Use suggested dates
          </button>
        </div>
      )}
      <p className="text-xs text-amber-800 mt-3">
        You may still submit — the request will be flagged for Manager special approval per
        company policy.
      </p>
    </div>
  );
}

// Placeholder employee dashboard. Leave application / balances / calendar
// (UC-01..UC-19, owned by other members) aren't wired up yet — this keeps the
// EMPLOYEE role landing on a real page instead of a broken import, and gives
// it somewhere to sit under the shared header, announcement banner and
// profile panel (all centralized in App.jsx).
export default function Employee({ user }) {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="lf-card-static p-6">
        <h2 className="text-lg font-semibold text-lf-text mb-1">
          Welcome, {user.name.split(" ")[0]}.
        </h2>
        <p className="text-sm text-lf-text-muted">
          Your leave application, balances and calendar are being built by the rest of the
          team and will appear here. In the meantime, use <strong>My account</strong> above
          to update your profile, notification preferences, password and active sessions.
        </p>
      </div>
    </div>
  );
}

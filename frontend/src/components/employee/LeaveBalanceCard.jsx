export default function LeaveBalanceCard({ label, entitled, carried, used, pending = 0 }) {
  const remaining = Number(entitled) + Number(carried) - Number(used) - Number(pending);

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-3xl font-semibold text-teal-800 mt-1">
        {remaining}
        <span className="text-sm font-normal text-slate-400"> days left</span>
      </p>
      <p className="text-xs text-slate-500 mt-1">
        {Number(entitled)} entitled
        {Number(carried) > 0 ? ` + ${Number(carried)} carried` : ""} · {Number(used)} used
        {pending > 0 ? ` · ${pending} pending` : ""}
      </p>
    </div>
  );
}

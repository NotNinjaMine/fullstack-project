const LABELS = {
  PENDING_SUPERVISOR: "Pending Supervisor",
  PENDING_MANAGER: "Pending Manager",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

const CLASSES = {
  PENDING_SUPERVISOR: "bg-amber-100 text-amber-800",
  PENDING_MANAGER: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-700",
  CANCELLED: "bg-slate-100 text-slate-500",
};

// Colour-coded leave status chip, shared across the History table and Dashboard
export default function StatusBadge({ status, flagged }) {
  const isPending = status === "PENDING_SUPERVISOR" || status === "PENDING_MANAGER";
  const label = isPending && flagged ? `${LABELS[status]} · flagged` : LABELS[status] ?? status;
  const className = isPending && flagged ? "bg-orange-100 text-orange-800" : CLASSES[status] ?? "bg-slate-100 text-slate-500";

  return <span className={`text-xs rounded-full px-2.5 py-1 whitespace-nowrap ${className}`}>{label}</span>;
}

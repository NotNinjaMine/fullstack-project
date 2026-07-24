import useAuth from "../hooks/useAuth";
import useLeave from "../hooks/useLeave";
import LoadingSpinner from "../components/common/LoadingSpinner";
import LeaveApplicationForm from "../components/employee/LeaveApplicationForm";
import { eligibleLeaveTypes } from "../lib/leaveTypes";

// UC-01: employee applies for leave, manually or via AI-1 natural-language input
export default function LeaveApplyPage() {
  const { user } = useAuth();
  const { loading, pendingByType, remainingByType, reload } = useLeave();

  if (loading) return <LoadingSpinner />;

  const leaveTypeOptions = eligibleLeaveTypes(user).map((t) => ({
    ...t,
    available: t.uncapped ? Infinity : (remainingByType[t.id] || 0) - (pendingByType[t.id] || 0),
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Apply for leave</h1>
        <p className="text-sm text-slate-500">
          Routing: Supervisor → Manager. Two-tier approval, no auto-approval.
        </p>
      </div>
      <LeaveApplicationForm leaveTypeOptions={leaveTypeOptions} onSubmitted={reload} />
    </div>
  );
}

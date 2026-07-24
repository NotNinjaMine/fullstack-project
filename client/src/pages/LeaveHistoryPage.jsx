import toast from "react-hot-toast";
import useLeave from "../hooks/useLeave";
import LoadingSpinner from "../components/common/LoadingSpinner";
import LeaveHistoryTable from "../components/employee/LeaveHistoryTable";

// UC-08: paginated history of past requests. Cancellation per UC-03.
export default function LeaveHistoryPage() {
  const { requests, loading, cancel } = useLeave();

  const handleCancel = (id) => {
    cancel(id)
      .then((res) => toast.success(res.message || "Cancelled."))
      .catch((err) => toast.error(err.response?.data?.message || "Cancel failed."));
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">My leave requests</h1>
        <p className="text-sm text-slate-500">
          Last 12 months · pending requests can be cancelled here; approved requests enter the
          cancellation approval workflow.
        </p>
      </div>
      <LeaveHistoryTable requests={requests} onCancel={handleCancel} />
    </div>
  );
}

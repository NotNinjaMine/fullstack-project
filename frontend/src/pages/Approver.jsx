import { useState, useEffect } from "react";
import http from "../lib/http";
import NotificationBell from "../components/NotificationBell";
import StaffTable, { useStaff } from "../components/StaffTable";
import AddEmployeePanel from "../components/AddEmployeePanel";
import { UserPlus } from "lucide-react";

// MEMBER 1 SCOPE — Supervisor / Manager page.
//
// This build contains only Member 1's slice of the Supervisor/Manager view:
// adding employees and administering staff accounts (UC-10, UC-25). The
// approval queue, delegation panel and AI-3 assistant cards that also live on
// this page in the full system belong to Member 3 (UC-02, UC-12, UC-15, UC-16,
// UC-28) and are intentionally not part of this deliverable.
//
// Account actions (unlock, force-logout, deactivate, delete) require MANAGER or
// HR_ADMIN, mirroring the requireRole guards on those endpoints — a Supervisor
// sees the same table read-only.
export default function Approver({ user, setToast }) {
  const isManager = user.role === "MANAGER";
  const [showAdd, setShowAdd] = useState(false);
  const [policies, setPolicies] = useState([]);

  // Country list for the add-employee form — a new hire's entitlement is
  // provisioned from their country's policy, so the form needs that list.
  useEffect(() => {
    http.get("/user/policies").then((res) => setPolicies(res.data)).catch(() => setPolicies([]));
  }, []);

  const { rows, loading, load, unlock, forceLogout, deactivate, reactivate, deleteForever, lockedCount } = useStaff();

  return (
    <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-lf-text">
            {isManager ? "Manager" : "Supervisor"} — team administration
          </h2>
          <p className="text-sm text-lf-text-subtle">
            {user.team} · {user.country}
            {lockedCount > 0 && (
              <span className="ml-2 text-amber-700">
                · {lockedCount} locked account{lockedCount === 1 ? "" : "s"}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          {isManager && (
            <button
              type="button"
              onClick={() => setShowAdd((v) => !v)}
              className="lf-btn lf-btn-primary lf-btn-sm flex items-center gap-1"
            >
              <UserPlus className="w-4 h-4" />
              {showAdd ? "Close" : "Add employee"}
            </button>
          )}
        </div>
      </div>

      {showAdd && isManager && (
        <AddEmployeePanel
          user={user}
          isManager={isManager}
          policies={policies}
          setToast={setToast}
          onDone={() => { setShowAdd(false); load(); }}
        />
      )}

      <StaffTable
        rows={rows}
        loading={loading}
        currentUserId={user?.id}
        title="Staff accounts"
        onUnlock={unlock}
        onForceLogout={isManager ? forceLogout : null}
        onDeactivate={isManager ? deactivate : null}
        onReactivate={isManager ? reactivate : null}
        onDeleteForever={isManager ? deleteForever : null}
      />
    </main>
  );
}

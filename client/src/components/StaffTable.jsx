import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import http from "../lib/http";

// Shared staff directory.
//
// Rendered in BOTH the HR console (Employees tab) and the Manager's
// "Unlock accounts" panel. Both read the same endpoint (GET /admin/employees)
// through this one component, so the two screens are synced by construction —
// a column, a status badge or a balance rule only ever has to change here.
//
// The only difference between the two callers is which actions are offered:
// Unlock appears on locked accounts (Managers and HR both hold that right), and
// Force logout is shown wherever the caller enables it.
const isLocked = (u) => !!(u.lockedUntil && new Date(u.lockedUntil) > new Date());
const isAdminLock = (u) => isLocked(u) && u.lockReason === "ADMIN";

const statusBadge = (u) => {
  if (u.status === "DEACTIVATED") {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">Removed</span>;
  }
  if (isAdminLock(u)) {
    // No auto-expiry: an admin ended their sessions and locked them out.
    return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800">Locked by admin</span>;
  }
  if (isLocked(u)) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800">
        Locked until{" "}
        {new Date(u.lockedUntil).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" })}
      </span>
    );
  }
  if (u.status === "INVITED") {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Invited (pending)</span>;
  }
  return <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Active</span>;
};

// Custom hook so both pages fetch and refresh the list identically.
export function useStaff() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  // Which roles the SIGNED-IN caller may assign, straight from the server
  // (GET /admin/assignable-roles). Rendering the menu from this means it can
  // never offer something PUT /admin/employees/:id/role would refuse:
  //   Boss     -> any role, including BOSS and HR_ADMIN
  //   HR Admin -> EMPLOYEE / SUPERVISOR / MANAGER
  //   Manager  -> EMPLOYEE / SUPERVISOR / MANAGER
  // An empty list simply renders the role as plain text.
  const [assignableRoles, setAssignableRoles] = useState([]);

  useEffect(() => {
    http
      .get("/admin/assignable-roles")
      .then((res) => setAssignableRoles(res.data.roles || []))
      .catch(() => setAssignableRoles([]));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    http
      .get("/admin/employees")
      .then((res) => setRows(res.data))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unlock = (id) =>
    http
      .put(`/user/${id}/unlock`)
      .then((res) => {
        toast.success(res.data.message);
        load();
      })
      .catch((err) => toast.error(err.response?.data?.message || "Unlock failed."));

  const forceLogout = (id) =>
    http
      .put(`/user/${id}/force-logout`)
      .then((res) => {
        toast.success(res.data.message);
        load();
      })
      .catch((err) => toast.error(err.response?.data?.message || "Force logout failed."));

  const deactivate = (id) =>
    http
      .put(`/user/${id}/deactivate`)
      .then((res) => {
        toast.success(res.data.message);
        load();
      })
      .catch((err) => toast.error(err.response?.data?.message || "Could not remove that account."));

  const reactivate = (id) =>
    http
      .put(`/user/${id}/reactivate`)
      .then((res) => {
        toast.success(res.data.message);
        load();
      })
      .catch((err) => toast.error(err.response?.data?.message || "Could not restore that account."));

  const deleteForever = (id) =>
    http
      .delete(`/user/${id}`)
      .then((res) => {
        toast.success(res.data.message);
        load();
      })
      .catch((err) => toast.error(err.response?.data?.message || "Could not delete that account."));

  // Changing someone's role changes which page they land on and which approval
  // chain their leave runs through, so the server ends their sessions — they
  // sign in again straight onto the right view. The toast repeats that.
  const changeRole = (id, role) =>
    http
      .put(`/admin/employees/${id}/role`, { role })
      .then((res) => {
        toast.success(res.data.message);
        load();
      })
      .catch((err) =>
        toast.error(
          err.response?.data?.message ||
            (err.response?.data?.errors || []).join(", ") ||
            "Could not change that role."
        )
      );

  return {
    rows, loading, load, unlock, forceLogout, deactivate, reactivate, deleteForever,
    changeRole, assignableRoles,
    lockedCount: rows.filter(isLocked).length
  };
}

export default function StaffTable({
  rows,
  loading = false,
  onUnlock,
  onForceLogout = null,
  onDeactivate = null,
  onReactivate = null,
  onDeleteForever = null,
  currentUserId = null,
  onChangeRole = null,
  assignableRoles = [],
  title = "Staff",
  emptyText = "No staff found.",
}) {
  // Two-step confirm: removing someone's access shouldn't be one stray click.
  const [confirmId, setConfirmId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [query, setQuery] = useState("");

  // Plain-language status text so searching "locked" or "removed" works the same
  // way as searching a name — matching what the badge actually says on screen.
  const statusText = (u) => {
    if (u.status === "DEACTIVATED") return "removed deactivated";
    if (isAdminLock(u)) return "locked by admin";
    if (isLocked(u)) return "locked";
    if (u.status === "INVITED") return "invited pending";
    return "active";
  };

  // The role is editable in place when the caller passed an onChangeRole
  // handler AND the server said they may assign this person's current role.
  // Editing your own row is never offered — the server refuses it too, so you
  // cannot accidentally lock yourself out of your own console.
  const canEditRole = (u) =>
    !!onChangeRole &&
    assignableRoles.length > 0 &&
    u.id !== currentUserId &&
    u.status !== "DEACTIVATED" &&
    assignableRoles.includes(u.role);

  const roleCell = (u) => {
    if (!canEditRole(u)) {
      return (
        <span title={
          u.id === currentUserId ? "You cannot change your own role."
            : !onChangeRole || assignableRoles.length === 0 ? undefined
              : `Your role cannot change a ${u.role}'s role.`
        }>
          {u.role}
        </span>
      );
    }
    return (
      <select
        className="lf-input py-0.5 text-xs"
        value={u.role}
        onChange={(e) => {
          const next = e.target.value;
          if (next !== u.role) onChangeRole(u.id, next);
        }}
        title="Changing a role changes the page this person sees and who approves their leave. They will be signed out and must sign in again."
      >
        {assignableRoles.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
    );
  };

  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter((u) =>
        [u.name, u.email, u.role, u.country, u.team, statusText(u)]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(q))
      )
    : rows;

  return (
    <div className="overflow-x-auto">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="font-semibold text-lf-text">
          {title} ({q ? `${filtered.length} of ${rows.length}` : rows.length})
        </h3>
        <div className="flex items-center gap-2">
          <input
            className="lf-input py-1 text-sm"
            placeholder="Search name, role, country, team, status…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {q && (
            <button type="button" onClick={() => setQuery("")} className="lf-btn lf-btn-sm lf-btn-ghost">
              Clear
            </button>
          )}
        </div>
      </div>
      {loading && rows.length === 0 && <p className="text-sm text-lf-text-subtle">Loading…</p>}
      {!loading && rows.length === 0 && <p className="text-sm text-lf-text-subtle">{emptyText}</p>}
      {rows.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-lf-text-subtle">No staff match “{query}”.</p>
      )}
      {filtered.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-lf-text-subtle border-b border-lf-border">
              <th className="py-1.5">Name</th>
              <th>Role</th>
              <th>Country</th>
              <th>Team</th>
              <th>Annual left</th>
              <th>Sick left</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const balances = u.balances || [];
              const annual = balances.find((b) => b.leaveType === "annual");
              const sick = balances.find((b) => b.leaveType === "sick_mc");
              const locked = isLocked(u);
              return (
                <tr key={u.id} className="border-b border-lf-border/60">
                  <td className="py-1.5">{u.name}</td>
                  <td>{roleCell(u)}</td>
                  <td>{u.country}</td>
                  <td>{u.team}</td>
                  <td>{annual ? annual.remaining : "—"}</td>
                  <td>{sick ? sick.remaining : "—"}</td>
                  <td>{statusBadge(u)}</td>
                  <td>
                    <div className="flex gap-1.5 justify-end">
                      {/* You can't act on your own row — use Log out instead. */}
                      {currentUserId === u.id ? (
                        <span className="text-xs text-lf-text-subtle italic">you</span>
                      ) : confirmId === u.id ? (
                        <>
                          <span className="text-xs text-lf-text-muted self-center mr-1">Remove access?</span>
                          <button
                            type="button"
                            onClick={() => { onDeactivate?.(u.id); setConfirmId(null); }}
                            className="lf-btn lf-btn-sm lf-btn-danger"
                          >
                            Yes, remove
                          </button>
                          <button type="button" onClick={() => setConfirmId(null)} className="lf-btn lf-btn-sm lf-btn-ghost">
                            Cancel
                          </button>
                        </>
                      ) : deleteId === u.id ? (
                        <>
                          <span className="text-xs text-rose-700 self-center mr-1">Erase all records? Cannot be undone.</span>
                          <button
                            type="button"
                            onClick={() => { onDeleteForever?.(u.id); setDeleteId(null); }}
                            className="lf-btn lf-btn-sm lf-btn-danger"
                          >
                            Delete forever
                          </button>
                          <button type="button" onClick={() => setDeleteId(null)} className="lf-btn lf-btn-sm lf-btn-ghost">
                            Cancel
                          </button>
                        </>
                      ) : u.status === "DEACTIVATED" ? (
                        <>
                          {onReactivate && (
                            <button type="button" onClick={() => onReactivate(u.id)} className="lf-btn lf-btn-sm lf-btn-outline">
                              Restore
                            </button>
                          )}
                          {onDeleteForever && (
                            <button
                              type="button"
                              onClick={() => setDeleteId(u.id)}
                              title="Permanently erase this account and all of its records. This cannot be undone."
                              className="lf-btn lf-btn-sm lf-btn-outline text-rose-600"
                            >
                              Delete permanently
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          {locked && onUnlock && (
                            <button type="button" onClick={() => onUnlock(u.id)} className="lf-btn lf-btn-sm lf-btn-primary">
                              Unlock
                            </button>
                          )}
                          {onForceLogout && !locked && (
                            <button
                              type="button"
                              onClick={() => onForceLogout(u.id)}
                              title="End all their sessions and lock the account until you unlock it"
                              className="lf-btn lf-btn-sm lf-btn-outline"
                            >
                              Sign out
                            </button>
                          )}
                          {onDeactivate && (
                            <button
                              type="button"
                              onClick={() => setConfirmId(u.id)}
                              title="Remove access. Leave history is kept."
                              className="lf-btn lf-btn-sm lf-btn-outline text-rose-600"
                            >
                              Remove
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export { isLocked };

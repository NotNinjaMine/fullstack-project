import { useState, useEffect, useCallback, useMemo } from "react";
import { getMyBalance } from "../services/balanceService";
import { getMyLeave, cancelLeave as cancelLeaveRequest } from "../services/leaveService";

const PENDING_STATUSES = ["PENDING_SUPERVISOR", "PENDING_MANAGER"];

// Shared leave balance + request-history state for the Dashboard, Apply, and History pages
export default function useLeave() {
  const [balances, setBalances] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    return Promise.all([getMyBalance(), getMyLeave()])
      .then(([b, r]) => {
        setBalances(b);
        setRequests(r);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const pendingByType = useMemo(() => {
    const map = {};
    requests
      .filter((r) => PENDING_STATUSES.includes(r.status))
      .forEach((r) => {
        map[r.leaveType] = (map[r.leaveType] || 0) + Number(r.days);
      });
    return map;
  }, [requests]);

  const remainingByType = useMemo(() => {
    const map = {};
    balances.forEach((b) => {
      map[b.leaveType] = Number(b.entitled) + Number(b.carried) - Number(b.used);
    });
    return map;
  }, [balances]);

  const cancel = useCallback(
    (id) => cancelLeaveRequest(id).then((res) => reload().then(() => res)),
    [reload]
  );

  return { balances, requests, loading, reload, cancel, pendingByType, remainingByType };
}

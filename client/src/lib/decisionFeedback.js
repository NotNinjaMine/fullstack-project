export const decisionToastId = (requestId, status = "") =>
  status === "APPROVED"
    ? `leave-final-approval-${requestId}`
    : `leave-decision-${requestId}`;

export const decisionMessage = (requestId, status) => {
  if (status === "PENDING_MANAGER") {
    return `REQ-${requestId} routed to the Manager for final approval.`;
  }
  // A Manager's own leave waits for the Boss (server/services/approvalChain.js).
  if (status === "PENDING_BOSS") {
    return `REQ-${requestId} routed to the Boss for final approval.`;
  }
  if (status === "APPROVED") {
    return `REQ-${requestId} fully approved. Employee notified; balance deducted; calendar updated.`;
  }
  return `REQ-${requestId} rejected. Employee notified.`;
};

export const publishDecisionToast = (toastApi, requestId, status) => {
  const message = decisionMessage(requestId, status);
  const id = decisionToastId(requestId, status);
  toastApi.success(message, { id });
  return { id, message };
};

/**
 * Executes exactly one leave-decision HTTP call and publishes the committed
 * result through exactly one toast renderer. Keeping this orchestration pure
 * makes the duplicate-toast regression test exercise the same production path.
 */
export async function submitLeaveDecision({
  httpClient,
  toastApi,
  requestId,
  approve,
  acknowledgeException = false,
  rejectionReason = null,
}) {
  const body = { approve, acknowledgeException };
  if (!approve && rejectionReason) body.rejectionReason = rejectionReason;

  const response = await httpClient.put(`/leave/${requestId}/decide`, body);
  const status = response.data.request.status;
  publishDecisionToast(toastApi, requestId, status);
  return response.data;
}

/**
 * Runs one async action at a time for a supplied mutable ref-like lock.
 * The lock is set synchronously, so two clicks in the same render frame cannot
 * submit duplicate approval requests before React updates button state.
 */
export async function runSingleFlight(lock, task) {
  if (lock.current) return { skipped: true, value: undefined };
  lock.current = true;
  try {
    return { skipped: false, value: await task() };
  } finally {
    lock.current = false;
  }
}

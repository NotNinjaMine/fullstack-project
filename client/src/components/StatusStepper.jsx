// M2 (UC-14): request status tracker — shows progress through the stages this
// particular applicant's request actually passes, with the timestamp of each,
// taken from the audit trail the API already returns with GET /leave/mine.
//
// The stages are NOT fixed: they depend on who applied (see
// server/services/approvalChain.js, which this mirrors).
//
//   Employee / HR Admin : Submitted → Supervisor → Manager (final)
//   Supervisor          : Submitted → Manager (final)
//   Manager             : Submitted → Boss (final)
//   Boss                : Submitted → Manager (final)
//
// Rendering a Supervisor step for a Manager's request would be a lie — nobody
// at that tier ever sees it — so the chain is derived rather than hard-coded.
//
// The same component renders a cancellation cycle (UC-03): when
// `cancellationRequested` is set the stages describe the withdrawal, not
// the original application.

const fmtStamp = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleString("en-SG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const findAudit = (logs, ...needles) =>
  logs.find((l) =>
    needles.every((n) => String(l.action || "").toLowerCase().includes(n.toLowerCase()))
  );

/**
 * Derive the three stages from status + audit rows.
 * state: "done" | "current" | "pending" | "rejected"
 */
// Which approval stages does this applicant's request pass through?
// `applicantRole` is authoritative when supplied; otherwise we infer what we
// can from the current status so an older caller still renders sensibly.
const stagesFor = (applicantRole, status) => {
  if (applicantRole === "MANAGER") return ["BOSS"];
  if (applicantRole === "SUPERVISOR" || applicantRole === "BOSS") return ["MANAGER"];
  if (applicantRole === "EMPLOYEE" || applicantRole === "HR_ADMIN") return ["SUPERVISOR", "MANAGER"];
  if (status === "PENDING_BOSS") return ["BOSS"];
  return ["SUPERVISOR", "MANAGER"];
};

const STAGE_META = {
  SUPERVISOR: { pending: "PENDING_SUPERVISOR", label: "Supervisor", cancelLabel: "Supervisor review", audit: "supervisor" },
  MANAGER: { pending: "PENDING_MANAGER", label: "Manager", cancelLabel: "Manager decision", audit: "manager" },
  BOSS: { pending: "PENDING_BOSS", label: "Boss", cancelLabel: "Boss decision", audit: "boss" }
};

/**
 * Derive the stages from status + audit rows.
 * state: "done" | "current" | "pending" | "rejected"
 */
export const buildSteps = (request, applicantRole = null) => {
  const logs = [...(request.AuditLogs || [])].sort((a, b) =>
    String(a.createdAt) < String(b.createdAt) ? -1 : 1
  );
  const cancelling = !!request.cancellationRequested;
  const status = request.status;
  const stages = stagesFor(applicantRole || request.employee?.role || null, status);

  const submitted = findAudit(logs, "submitted");
  const cancelAsk = findAudit(logs, "cancellation requested");

  const step1 = {
    label: cancelling ? "Cancellation requested" : "Submitted",
    by: (cancelling ? cancelAsk : submitted)?.actorName || request.employeeName,
    at: (cancelling ? cancelAsk : submitted)?.createdAt || request.createdAt,
    state: "done",
  };

  // A stage is "done" once the request has moved past it. Because the stages
  // are ordered, anything before the current pending stage has been cleared.
  const currentIdx = stages.findIndex((stage) => STAGE_META[stage].pending === status);
  const terminal = ["APPROVED", "REJECTED", "CANCELLED"].includes(status);

  let anyDecision = false;
  const steps = stages.map((stage, idx) => {
    const meta = STAGE_META[stage];
    const isLast = idx === stages.length - 1;
    const rejected = findAudit(logs, `rejected by ${meta.audit}`) || findAudit(logs, `refused by ${meta.audit}`);
    const acted = findAudit(logs, meta.audit);
    if (rejected || acted) anyDecision = true;

    let state;
    if (status === meta.pending) {
      state = "current";
    } else if (rejected && status === "REJECTED") {
      state = "rejected";
    } else if (currentIdx > -1) {
      // Still in flight: earlier stages are cleared, later ones are waiting.
      state = idx < currentIdx ? "done" : "pending";
    } else if (status === "APPROVED" || status === "CANCELLED") {
      state = "done";
    } else if (status === "REJECTED") {
      // Rejected at some other stage — this one never got a turn.
      state = "pending";
    } else {
      state = "pending";
    }

    return {
      label: cancelling ? meta.cancelLabel : isLast ? `${meta.label} (final)` : meta.label,
      at: rejected?.createdAt || (acted && acted !== rejected ? acted.createdAt : null),
      by: (rejected || acted)?.actorName,
      state,
    };
  });

  // A request cancelled while still pending never reached an approver.
  if (status === "CANCELLED" && !cancelling && !anyDecision) {
    for (const step of steps) step.state = "pending";
  }

  return [step1, ...steps];
};

const DOT = {
  done: "bg-emerald-500 border-emerald-500 text-white",
  current: "bg-amber-400 border-amber-400 text-white animate-pulse",
  rejected: "bg-rose-500 border-rose-500 text-white",
  pending: "bg-white border-slate-300 text-slate-400",
};

const MARK = { done: "✓", current: "•", rejected: "✕", pending: "" };

export default function StatusStepper({ request, applicantRole = null }) {
  const steps = buildSteps(request, applicantRole);
  return (
    <div className="mt-3">
      <ol className="flex items-start gap-2">
        {steps.map((s, i) => (
          <li key={s.label} className="flex-1 min-w-0">
            <div className="flex items-center">
              <span
                className={`w-5 h-5 shrink-0 rounded-full border flex items-center justify-center text-[10px] leading-none ${DOT[s.state]}`}
                aria-hidden="true"
              >
                {MARK[s.state]}
              </span>
              {i < steps.length - 1 && (
                <span
                  className={`h-0.5 flex-1 ml-1 ${
                    steps[i + 1].state === "pending" ? "bg-slate-200" : "bg-emerald-300"
                  }`}
                />
              )}
            </div>
            <p
              className={`mt-1 text-[11px] leading-tight truncate ${
                s.state === "pending" ? "text-slate-400" : "text-slate-600"
              }`}
              title={s.label}
            >
              {s.label}
            </p>
            <p className="text-[10px] text-slate-400 leading-tight truncate">
              {s.state === "current"
                ? "waiting…"
                : s.at
                ? `${fmtStamp(s.at)}${s.by ? ` · ${s.by}` : ""}`
                : "—"}
            </p>
          </li>
        ))}
      </ol>
      {request.supervisorNote && (
        <p className="mt-2 text-xs text-rose-700">Supervisor note: {request.supervisorNote}</p>
      )}
      {request.managerNote && (
        <p className="mt-1 text-xs text-rose-700">
          {applicantRole === "MANAGER" ? "Boss note" : "Manager note"}: {request.managerNote}
        </p>
      )}
    </div>
  );
}

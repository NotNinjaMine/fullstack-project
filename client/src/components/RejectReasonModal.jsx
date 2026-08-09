/**
 * RejectReasonModal (F3) — mandatory rejection-reason gate before Reject.
 *
 * Shows:
 *  - Leave request summary (employee, type, dates, original reason)
 *  - Required "Reason for rejection" textarea (min 5, max 300)
 *  - Character counter 0/300
 *  - Note: “This reason will be visible to the employee”
 *  - Confirm disabled until valid; loading shows “Rejecting…”
 *
 * Colors: lf-* tokens; danger only for reject primary action / validation.
 * ESC / overlay / X / Cancel close (blocked while loading).
 */
import { useEffect, useRef, useState } from "react";
import { X, AlertTriangle, Loader2, Info } from "lucide-react";
import { fmt } from "../lib/dates";

const MIN_REASON = 5;
const MAX_REASON = 300;

const typeLabel = (id) =>
  ({ annual: "Annual Leave", sick_mc: "Sick Leave (with MC)", sick_nomc: "Sick Leave (without MC)" }[id] ??
  id);

/**
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {(reason: string) => void | Promise<void>} onConfirm
 * @param {boolean} [loading]
 * @param {object|null} request  — full leave request row from the queue
 * @param {string} [confirmLabel="Reject request"]
 * @param {string} [loadingLabel="Rejecting…"]
 */
export default function RejectReasonModal({
  open,
  onClose,
  onConfirm,
  loading = false,
  request,
  bulkCount = 0,
  confirmLabel = "Reject request",
  loadingLabel = "Rejecting…",
}) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setTouched(false);
      // Focus textarea after open animation
      const t = setTimeout(() => textareaRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open, request?.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !loading) onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !request) return null;

  const trimmed = reason.trim();
  const valid = trimmed.length >= MIN_REASON && trimmed.length <= MAX_REASON;
  const showError = touched && !valid;

  const handleConfirm = () => {
    setTouched(true);
    if (!valid || loading) return;
    onConfirm?.(trimmed);
  };

  const dates =
    request.endDate && request.endDate !== request.startDate
      ? `${fmt(request.startDate)} → ${fmt(request.endDate)}`
      : fmt(request.startDate);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reject-reason-title"
      aria-busy={loading || undefined}
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="lf-modal-overlay absolute inset-0 bg-[var(--lf-overlay)] backdrop-blur-[1px]"
        onClick={() => !loading && onClose?.()}
        disabled={loading}
      />

      <div className="lf-modal-panel relative w-full max-w-lg bg-lf-surface rounded-2xl border border-lf-border overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-lf-border">
          <div className="flex items-start gap-3 min-w-0">
            <span className="mt-0.5 w-10 h-10 rounded-xl bg-lf-danger-soft text-lf-danger flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" strokeWidth={2} aria-hidden />
            </span>
            <div className="min-w-0">
              <h3 id="reject-reason-title" className="text-base font-semibold text-lf-text">
                {bulkCount > 1 ? `Reject ${bulkCount} leave requests` : "Reject leave request"}
              </h3>
              <p className="mt-0.5 text-sm text-lf-text-muted">
                A written reason is required before you can reject.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !loading && onClose?.()}
            disabled={loading}
            className="lf-btn lf-btn-ghost p-1.5 !px-1.5 disabled:opacity-40"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4">
          {/* Request summary — pass the full `request` object from the queue card */}
          <div className="rounded-xl border border-lf-border bg-lf-muted p-4 space-y-2.5">
            {bulkCount > 1 && (
              <p className="text-sm font-medium text-lf-text">
                One mandatory reason will be recorded against all {bulkCount} selected requests.
              </p>
            )}
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-lf-accent text-white flex items-center justify-center text-sm font-semibold shrink-0">
                {request.employee?.initials || "?"}
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-lf-text truncate">
                  {bulkCount > 1 ? "Selected requests" : request.employee?.name || "Employee"}
                  <span className="font-normal text-lf-text-subtle text-sm">
                    {" "}
                    · {bulkCount > 1 ? `${bulkCount} items` : `REQ-${request.id}`}
                  </span>
                </p>
                <p className="text-sm text-lf-text-muted">
                  {bulkCount > 1 ? "The first selected request is shown below" : `${typeLabel(request.leaveType)} · ${dates}`}
                  {request.days != null ? ` · ${Number(request.days)} day(s)` : ""}
                  {request.halfDay ? " (half-day)" : ""}
                </p>
              </div>
            </div>
            <div className="pt-2 border-t border-lf-border/80">
              <p className="text-xs uppercase tracking-wide text-lf-text-subtle mb-1">
                Employee&apos;s reason
              </p>
              <p className="text-sm text-lf-text leading-relaxed">
                {request.reason ? `"${request.reason}"` : "—"}
              </p>
            </div>
          </div>

          {/* Rejection reason */}
          <label className="block mt-4" htmlFor="reject-reason-input">
            <span className="text-sm font-medium text-lf-text">
              Reason for rejection <span className="text-lf-danger">*</span>
            </span>
            <textarea
              id="reject-reason-input"
              ref={textareaRef}
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, MAX_REASON))}
              onBlur={() => setTouched(true)}
              rows={3}
              maxLength={MAX_REASON}
              disabled={loading}
              placeholder="Explain why this request is being rejected (min. 5 characters)…"
              aria-invalid={showError || undefined}
              aria-describedby="reject-reason-hint reject-reason-counter"
              className={`lf-input resize-y min-h-[88px] rounded-xl ${
                showError
                  ? "!border-lf-danger focus:!border-lf-danger"
                  : ""
              }`}
            />
          </label>

          <div className="mt-1.5 flex items-start justify-between gap-3 text-xs">
            <span
              id="reject-reason-hint"
              className={showError ? "text-lf-danger" : "text-lf-text-subtle"}
            >
              {showError
                ? `Please enter at least ${MIN_REASON} characters.`
                : null}
            </span>
            <span
              id="reject-reason-counter"
              className="text-lf-text-subtle tabular-nums shrink-0"
              aria-live="polite"
            >
              {reason.length}/{MAX_REASON}
            </span>
          </div>

          {/* Visibility note */}
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-lf-border bg-lf-muted px-3 py-2.5 text-xs text-lf-text-muted">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-lf-accent" aria-hidden />
            <p>
              This reason will be visible to the employee and is included in their rejection
              notification.
            </p>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-5 py-4 border-t border-lf-border bg-lf-muted/90">
          <button
            type="button"
            onClick={() => !loading && onClose?.()}
            disabled={loading}
            className="lf-btn lf-btn-ghost"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading || !valid}
            className="lf-btn lf-btn-danger-solid"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                {loadingLabel}
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

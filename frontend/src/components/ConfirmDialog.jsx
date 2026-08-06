/**
 * ConfirmDialog (F4) — reusable yes/no confirmation for destructive actions.
 *
 * Use for: deactivating or permanently deleting an account, and other
 * destructive HR actions. (In the full system this is also used by the
 * approval flows, which are Member 3's and not part of this build.)
 *
 * Conventions:
 *  - Colors via CSS tokens (lf-*) — accent for primary, danger only for danger
 *  - loading: shows spinner + loadingLabel (e.g. "Approving…")
 *  - ESC / overlay / X / Cancel close (blocked while loading)
 *  - Subtle entrance animation (opacity + scale + translateY)
 */
import { useEffect } from "react";
import { X, AlertTriangle, Loader2, Check } from "lucide-react";

/**
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {() => void | Promise<void>} onConfirm
 * @param {boolean} [loading]
 * @param {string} title
 * @param {string} [message]
 * @param {React.ReactNode} [children]
 * @param {string} [confirmLabel="Confirm"]
 * @param {string} [loadingLabel]  — defaults to "Approving…" (primary) or "Working…" (danger)
 * @param {string} [cancelLabel="Cancel"]
 * @param {"primary"|"danger"} [variant="primary"]
 * @param {"check"|"alert"} [icon]
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  loading = false,
  title,
  message,
  children,
  confirmLabel = "Confirm",
  loadingLabel,
  cancelLabel = "Cancel",
  variant = "primary",
  icon,
}) {
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

  if (!open) return null;

  const isDanger = variant === "danger";
  const showAlert = icon === "alert" || (icon == null && isDanger);
  const showCheck = icon === "check" || (icon == null && !isDanger);
  const busyLabel =
    loadingLabel || (isDanger ? "Working…" : "Approving…");

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-busy={loading || undefined}
    >
      {/* Overlay */}
      <button
        type="button"
        aria-label="Close dialog"
        className="lf-modal-overlay absolute inset-0 bg-[var(--lf-overlay)] backdrop-blur-[1px]"
        onClick={() => !loading && onClose?.()}
        disabled={loading}
      />

      {/* Panel — same surface language as lf-card / dashboard cards */}
      <div className="lf-modal-panel relative w-full max-w-md bg-lf-surface rounded-2xl border border-lf-border overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-2">
          <div className="flex items-start gap-3 min-w-0">
            <span
              className={`mt-0.5 w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isDanger
                  ? "bg-lf-danger-soft text-lf-danger"
                  : "bg-lf-accent-soft text-lf-accent"
              }`}
            >
              {showAlert && <AlertTriangle className="w-5 h-5" strokeWidth={2} aria-hidden />}
              {showCheck && !showAlert && (
                <Check className="w-5 h-5" strokeWidth={2.5} aria-hidden />
              )}
            </span>
            <div className="min-w-0">
              <h3
                id="confirm-dialog-title"
                className="text-base font-semibold text-lf-text leading-snug"
              >
                {title}
              </h3>
              {message && (
                <p className="mt-1 text-sm text-lf-text-muted leading-relaxed">{message}</p>
              )}
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

        {children && (
          <div className="px-5 py-2 text-sm text-lf-text-muted">{children}</div>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-5 py-4 mt-1 border-t border-lf-border bg-lf-muted/90">
          <button
            type="button"
            onClick={() => !loading && onClose?.()}
            disabled={loading}
            className="lf-btn lf-btn-ghost"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!loading) onConfirm?.();
            }}
            disabled={loading}
            className={`lf-btn ${isDanger ? "lf-btn-danger-solid" : "lf-btn-primary"}`}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                {busyLabel}
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

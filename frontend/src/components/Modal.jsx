import { useEffect } from "react";
import { X } from "lucide-react";

// Shared modal shell for the whole app.
//
// The `lf-modal-overlay` / `lf-modal-panel` classes in index.css only carry the
// animation + shadow — they deliberately contain NO positioning. Any modal that
// used them on their own therefore rendered as a full-width block at the top of
// the page instead of a centred dialog. This component owns the positioning
// (fixed, flex-centred, dimmed backdrop, surface styling) in ONE place so every
// dialog looks and behaves identically.
//
// Also handles: Escape to close, click-outside to close, background scroll lock,
// and a max-height with internal scrolling so tall panels never overflow.
const SIZES = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

export default function Modal({
  title,
  onClose,
  children,
  size = "md",
  footer = null,
  dismissable = true,
}) {
  // Escape to close
  useEffect(() => {
    if (!dismissable || !onClose) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismissable, onClose]);

  // Lock background scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* Dimmed backdrop */}
      <button
        type="button"
        aria-label="Close dialog"
        onClick={() => dismissable && onClose?.()}
        className="lf-modal-overlay absolute inset-0 bg-[var(--lf-overlay)] backdrop-blur-[1px]"
      />

      {/* Centred panel — same surface language as lf-card */}
      <div
        className={`lf-modal-panel relative w-full ${SIZES[size] || SIZES.md} bg-lf-surface rounded-2xl border border-lf-border overflow-hidden flex flex-col max-h-[85vh]`}
      >
        {(title || (dismissable && onClose)) && (
          <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3 flex-shrink-0">
            <h3 className="text-lg font-semibold text-lf-text truncate">{title}</h3>
            {dismissable && onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-lf-text-subtle hover:text-lf-text flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Scrollable body so tall content never runs off-screen */}
        <div className="px-5 pb-5 overflow-y-auto">{children}</div>

        {footer && (
          <div className="px-5 py-3 border-t border-lf-border bg-lf-muted/40 flex justify-end gap-2 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

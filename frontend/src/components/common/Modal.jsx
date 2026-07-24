import { useEffect } from "react";

// Shared modal shell (UC-09: responsive — full-width on mobile, capped on desktop).
// Used by the announcement mandatory-ack overlay, confirm dialogs, and any
// other member's future dialogs.
export default function Modal({ open, onClose, title, children, maxWidthClass = "max-w-lg", dismissible = true }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape" && dismissible) onClose?.();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, dismissible, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={() => dismissible && onClose?.()}
        className="absolute inset-0 bg-slate-900/50"
      />
      <div className={`relative w-full ${maxWidthClass} bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto`}>
        {title && (
          <div className="flex items-start justify-between gap-3 mb-4">
            <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
            {dismissible && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-slate-400 hover:text-slate-600 text-xl leading-none"
              >
                ×
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

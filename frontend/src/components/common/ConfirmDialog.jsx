import Modal from "./Modal";

// Shared yes/no confirmation — used for revoke session, deactivate
// announcement, and any other member's destructive actions.
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  loading = false,
  title,
  message,
  confirmLabel = "Confirm",
  variant = "primary",
}) {
  return (
    <Modal open={open} onClose={() => !loading && onClose?.()} title={title} maxWidthClass="max-w-sm">
      {message && <p className="text-sm text-slate-600 mb-5">{message}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => !loading && onClose?.()}
          disabled={loading}
          className="text-sm rounded-lg px-4 py-2 text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => !loading && onConfirm?.()}
          disabled={loading}
          className={`text-sm rounded-lg px-4 py-2 text-white disabled:opacity-60 ${
            variant === "danger" ? "bg-rose-600 hover:bg-rose-700" : "bg-teal-700 hover:bg-teal-800"
          }`}
        >
          {loading ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

import { useCallback, useEffect, useState } from "react";
import { getActiveAnnouncements, ackAnnouncement } from "../../services/announcementService";
import Modal from "./Modal";

// UC-26: banners/modals shown to every role. A mandatory-acknowledge
// announcement blocks the app (dismissible=false Modal) until ticked; a
// dismissible one renders as an inline banner the user can close locally.
export default function AnnouncementBanner() {
  const [items, setItems] = useState([]);
  const [dismissed, setDismissed] = useState(() => new Set());
  const [acking, setAcking] = useState(false);

  const load = useCallback(() => {
    getActiveAnnouncements()
      .then(setItems)
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const ack = (id) => {
    setAcking(true);
    ackAnnouncement(id)
      .then(() => setItems((prev) => prev.filter((a) => a.id !== id)))
      .finally(() => setAcking(false));
  };

  const dismiss = (id) => setDismissed((prev) => new Set(prev).add(id));

  const mandatory = items.find((a) => a.requiresAck);
  const optional = items.filter((a) => !a.requiresAck && !dismissed.has(a.id));

  return (
    <>
      <Modal open={!!mandatory} onClose={() => {}} dismissible={false} title={mandatory?.title}>
        {mandatory && (
          <>
            <p className="text-xs text-slate-400 mb-3">From {mandatory.createdByName}</p>
            <p className="text-sm text-slate-600 whitespace-pre-line mb-5">{mandatory.body}</p>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={acking}
                onClick={() => ack(mandatory.id)}
                className="text-sm bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white rounded-lg px-4 py-2"
              >
                {acking ? "Saving…" : "I acknowledge"}
              </button>
            </div>
          </>
        )}
      </Modal>

      {optional.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 pt-4 space-y-2">
          {optional.map((a) => (
            <div
              key={a.id}
              className="flex items-start gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3"
            >
              <span className="text-teal-700 mt-0.5">📣</span>
              <div className="flex-1">
                <p className="font-medium text-teal-900">{a.title}</p>
                <p className="text-sm text-teal-800 whitespace-pre-line">{a.body}</p>
                <p className="text-xs text-teal-600 mt-1">From {a.createdByName}</p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(a.id)}
                aria-label="Dismiss"
                className="text-teal-600 hover:text-teal-900 text-lg leading-none"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

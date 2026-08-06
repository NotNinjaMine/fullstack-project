import { useState, useEffect, useCallback } from "react";
import http from "../lib/http";
import Modal from "./Modal";
import { Megaphone, X } from "lucide-react";

// M1 (UC-26): polls /announcement/active and shows banners. A requiresAck
// announcement renders as a blocking modal until the user acknowledges it.
export default function AnnouncementBanner() {
  const [items, setItems] = useState([]);
  const [dismissed, setDismissed] = useState(() => new Set());

  const load = useCallback(() => {
    http
      .get("/announcement/active")
      .then((res) => setItems(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    // Re-check periodically so a freshly published announcement appears without
    // requiring the user to reload the page.
    const id = setInterval(load, 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  const ack = (id) => {
    http
      .post(`/announcement/${id}/ack`)
      .then(() => setItems((prev) => prev.filter((a) => a.id !== id)))
      .catch(() => {});
  };

  const dismiss = (id) => setDismissed((prev) => new Set(prev).add(id));

  const mandatory = items.find((a) => a.requiresAck);
  const optional = items.filter((a) => !a.requiresAck && !dismissed.has(a.id));

  return (
    <>
      {/* Mandatory: blocking, centred modal — cannot be dismissed without acknowledging */}
      {mandatory && (
        <Modal
          title={mandatory.title}
          size="md"
          dismissable={false}
          footer={
            <button type="button" onClick={() => ack(mandatory.id)} className="lf-btn lf-btn-primary">
              I acknowledge
            </button>
          }
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center flex-shrink-0">
              <Megaphone className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-lf-text-subtle mb-2">
                From {mandatory.createdByName} · {mandatory.startDate} → {mandatory.endDate}
              </p>
              <p className="text-sm text-lf-text-muted whitespace-pre-line">{mandatory.body}</p>
            </div>
          </div>
        </Modal>
      )}

      {/* Optional: dismissible banners */}
      {optional.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 pt-4 space-y-2">
          {optional.map((a) => (
            <div
              key={a.id}
              className="flex items-start gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 shadow-lf-sm"
            >
              <Megaphone className="w-5 h-5 text-teal-700 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-teal-900">{a.title}</p>
                <p className="text-sm text-teal-800 whitespace-pre-line">{a.body}</p>
                <p className="text-xs text-teal-600 mt-1">From {a.createdByName}</p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(a.id)}
                className="text-teal-600 hover:text-teal-900"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

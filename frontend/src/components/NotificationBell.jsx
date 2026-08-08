import { useState, useEffect, useCallback, useRef } from "react";
import http from "../lib/http";

export default function NotificationBell({ setToast }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [list, setList] = useState([]);
  const panelRef = useRef(null);

  const load = useCallback(() => {
    http.get("/notification/unread-count").then((res) => setCount(res.data.count)).catch(() => {});
    http.get("/notification").then((res) => setList(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const markRead = (id) => {
    http.put(`/notification/${id}/read`).then(() => load()).catch(() => {});
  };

  const markAll = () => {
    http
      .put("/notification/read-all")
      .then((res) => {
        setToast?.(res.data.message);
        load();
      })
      .catch(() => {});
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          load();
        }}
        className="lf-btn lf-btn-sm relative bg-lf-surface border border-lf-border text-lf-text shadow-lf-sm hover:bg-lf-muted"
        aria-label="Notifications"
      >
        <span className="text-slate-700">🔔</span>
        {count > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[1.1rem] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 max-h-96 overflow-auto bg-lf-surface rounded-xl shadow-lf-lg border border-lf-border z-40">
          <div className="flex items-center justify-between px-3 py-2 border-b border-lf-border sticky top-0 bg-lf-surface">
            <p className="text-sm font-semibold text-lf-text">Notifications</p>
            <button
              type="button"
              onClick={markAll}
              className="text-xs text-lf-accent hover:text-lf-accent-active font-medium"
            >
              Mark all read
            </button>
          </div>
          {list.length === 0 ? (
            <p className="text-sm text-slate-400 p-4 text-center">No notifications yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {list.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => !n.readAt && markRead(n.id)}
                    className={`w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 ${
                      n.readAt ? "text-slate-500" : "text-slate-800 bg-teal-50/40"
                    }`}
                  >
                    <p className="leading-snug">{n.message}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {n.type ? `${n.type} · ` : ""}
                      {new Date(n.createdAt).toLocaleString("en-SG", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {!n.readAt ? " · unread" : ""}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

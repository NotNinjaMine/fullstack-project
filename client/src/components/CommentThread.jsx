import { useState, useEffect, useCallback, useRef } from "react";
import http from "../lib/http";
import { runSingleFlight } from "../lib/decisionFeedback";

export default function CommentThread({ requestId, locked, setToast }) {
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);
  const postLock = useRef(false);

  const load = useCallback(() => {
    setLoading(true);
    http
      .get(`/leave/${requestId}/comments`)
      .then((res) => setComments(res.data))
      .catch((err) => {
        if (err.response?.status === 403) {
          setComments([]);
        }
      })
      .finally(() => setLoading(false));
  }, [requestId]);

  useEffect(() => {
    load();
  }, [load]);

  const post = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    runSingleFlight(postLock, async () => {
      setPosting(true);
      try {
        const res = await http.post(`/leave/${requestId}/comments`, { body: trimmed });
        setComments((prev) => [...prev, res.data]);
        setBody("");
      } catch (err) {
        setToast?.(err.response?.data?.message || (err.response?.data?.errors || []).join("; ") || "Could not post comment.");
      } finally {
        setPosting(false);
      }
    });
  };

  return (
    <div className="mx-5 mb-4 rounded-xl border border-lf-border bg-lf-muted p-4">
      <h4 className="font-semibold text-lf-text text-sm mb-2">Discussion</h4>

      {loading && <p className="text-xs text-slate-400">Loading comments…</p>}

      {!loading && comments.length === 0 && (
        <p className="text-xs text-slate-400 mb-2">No comments yet.</p>
      )}

      <ul className="space-y-2 mb-3">
        {comments.map((c) => (
          <li key={c.id} className="bg-white rounded-lg p-2.5 text-sm border border-slate-100">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <span className="font-medium text-slate-700">
                {c.authorName}{" "}
                <span className="font-normal text-xs text-slate-400">· {c.authorRole}</span>
              </span>
              <span className="text-xs text-slate-400 shrink-0">
                {new Date(c.createdAt).toLocaleString("en-SG", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <p className="text-slate-600 whitespace-pre-wrap">{c.body}</p>
          </li>
        ))}
      </ul>

      {locked ? (
        <p className="text-xs text-slate-500 italic">
          Comments are locked — this request has been decided.
        </p>
      ) : (
        <div className="flex flex-col sm:flex-row gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Add a comment…"
            className="lf-input flex-1 mt-0"
          />
          <button
            type="button"
            onClick={post}
            disabled={posting || !body.trim()}
            className="lf-btn lf-btn-primary lf-btn-sm self-end sm:self-stretch"
          >
            {posting ? "Posting…" : "Post"}
          </button>
        </div>
      )}
    </div>
  );
}

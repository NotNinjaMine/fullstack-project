import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import http from "../lib/http";
import { toISO, isWeekend, fmt, monthCells } from "../lib/dates";
import ConfirmDialog from "../components/ConfirmDialog";
import Modal from "../components/Modal";
import StatusStepper from "../components/StatusStepper";
import CommentThread from "../components/CommentThread";
import LongWeekendFinder from "../components/LongWeekendFinder";
import ForfeitureRiskForecast from "../components/ForfeitureRiskForecast";
import { runSingleFlight } from "../lib/decisionFeedback";

// Fallback shown only if /leave/types hasn't loaded yet (e.g. first paint).
const FALLBACK_LEAVE_TYPES = [
  { id: "annual", label: "Annual Leave" },
  { id: "sick_mc", label: "Sick Leave (with MC)" },
  { id: "sick_nomc", label: "Sick Leave (without MC)" },
];

const AI1_EXAMPLES = [
  "I need next Monday off for a family event",
  "Half day tomorrow afternoon for dental appointment",
  "Annual leave from 20 Jul to 24 Jul for family trip",
  "Feeling unwell, taking sick leave today, will get an MC",
];

// Stages a request can sit at, mirroring server/services/approvalChain.js.
// PENDING_BOSS is where a Manager's own leave waits for the Boss.
const PENDING_STATUSES = ["PENDING_SUPERVISOR", "PENDING_MANAGER", "PENDING_BOSS"];

const stageName = (status) =>
  status === "PENDING_SUPERVISOR" ? "Supervisor"
    : status === "PENDING_MANAGER" ? "Manager"
      : status === "PENDING_BOSS" ? "Boss"
        : null;

const statusLabel = (r) => {
  // UC-03: a pending cycle on an approved leave is a WITHDRAWAL, not an application.
  if (r.cancellationRequested) {
    return `Cancellation · pending ${stageName(r.status) || "review"}`;
  }
  if (PENDING_STATUSES.includes(r.status)) {
    const who = stageName(r.status);
    if (!r.flagged) return `Pending ${who}`;
    return r.status === "PENDING_SUPERVISOR"
      ? "Pending Supervisor · flagged"
      : `Pending ${who} · special approval`;
  }
  return {
    APPROVED: "Approved",
    REJECTED: "Rejected",
    CANCELLED: "Cancelled",
  }[r.status];
};

// Surface something actionable even when the server sends no JSON body — an
// Express 413 on an oversize upload used to show a bare "Submission failed."
const apiError = (err, fallback) => {
  const data = err.response?.data;
  const listed = Array.isArray(data?.errors) ? data.errors.join("; ") : "";
  if (data?.message) return data.message;
  if (listed) return listed;
  if (err.response?.status) return `${fallback} (server said HTTP ${err.response.status})`;
  if (err.request) return `${fallback} The server did not respond — is the API running?`;
  return fallback;
};

const statusChipClass = (r) =>
  r.cancellationRequested
    ? "bg-indigo-100 text-indigo-800"
    : r.status === "APPROVED"
    ? "bg-emerald-100 text-emerald-800"
    : r.status === "REJECTED"
    ? "bg-rose-100 text-rose-700"
    : r.status === "CANCELLED"
    ? "bg-slate-100 text-slate-500"
    : r.flagged
    ? "bg-orange-100 text-orange-800"
    : "bg-amber-100 text-amber-800";

export default function Employee({ user, setToast }) {
  /* ---- server data ---- */
  const [balances, setBalances] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [team, setTeam] = useState([]);
  const [approvedLeaves, setApprovedLeaves] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [policy, setPolicy] = useState(null); // statutory policy for user.country
  // UC-10: leave types eligible for this employee (country + gender filtered
  // server-side). { id, label, requiresMc, affectsAnnualBalance, affectsSickBalance }[]
  const [leaveTypes, setLeaveTypes] = useState(FALLBACK_LEAVE_TYPES);
  // UC-18: restricted windows that apply to me (my country + my team). Shown in
  // red on the calendar; BLOCK dates cannot be requested at all.
  const [blackouts, setBlackouts] = useState([]);

  /* ---- form state ---- */
  const [leaveType, setLeaveType] = useState("annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [halfDay, setHalfDay] = useState(false);
  const [halfDayPeriod, setHalfDayPeriod] = useState("AM");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const formActionLock = useRef(false);
  const submissionKeyRef = useRef(null);
  // M2 (UC-13): medical-certificate attachment (base64 data URL) for sick_mc.
  const [attachment, setAttachment] = useState(null); // { name, type, data } | null
  // M2 (UC-14): drafts + the id of the draft currently being edited (if any).
  const [drafts, setDrafts] = useState([]);
  // The draft being edited in its own dialog (null = dialog closed).
  const [draftEdit, setDraftEdit] = useState(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftEditError, setDraftEditError] = useState("");
  const [draftForecast, setDraftForecast] = useState(null);
  // M2 (UC-27): leave-date swaps.
  const [swaps, setSwaps] = useState({ proposed: [], incoming: [] });
  const [swapFor, setSwapFor] = useState(null); // my APPROVED request I'm proposing to swap
  const [swapTargetId, setSwapTargetId] = useState("");

  /* ---- AI state (on-demand only — never call LLM on page load) ---- */
  const [nlText, setNlText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [parseSuccess, setParseSuccess] = useState("");
  const [parsedJSON, setParsedJSON] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [aiStatus, setAiStatus] = useState(null); // { llmConfigured, provider, message }
  const [improving, setImproving] = useState(false);
  const [coverage, setCoverage] = useState(null); // AI-2 result from server (deterministic)
  // M2 (UC-14): balance what-if from POST /leave/forecast (server-computed, nothing saved)
  const [forecast, setForecast] = useState(null);
  // M2 (UC-14): which request row has its status stepper expanded
  const [openStepper, setOpenStepper] = useState(null);
  // M2 (UC-13): attach an MC to a sick request that is already submitted
  const [lateMcFor, setLateMcFor] = useState(null);
  // M2 (UC-13, E): opt-in AI check of an uploaded certificate, keyed by request id
  const [mcChecking, setMcChecking] = useState(null);
  const [mcResult, setMcResult] = useState({});

  const [calMonth, setCalMonth] = useState(new Date());

  const holidaySet = useMemo(() => new Set(holidays.map((h) => h.date)), [holidays]);
  const holidayName = (iso) => holidays.find((h) => h.date === iso)?.name;

  /* ---- UC-18 blackout helpers ---- */
  // Active periods covering one date. A date can sit in more than one window
  // (e.g. a country-wide close plus a team audit); BLOCK always wins.
  const blackoutsOn = useCallback(
    (iso) => blackouts.filter((b) => iso >= b.startDate && iso <= b.endDate),
    [blackouts]
  );
  const blackoutLevel = useCallback(
    (iso) => {
      const hits = blackoutsOn(iso);
      if (hits.length === 0) return null;
      return hits.some((b) => b.mode === "BLOCK") ? "BLOCK" : "SPECIAL_APPROVAL";
    },
    [blackoutsOn]
  );

  const loadAll = useCallback(() => {
    http.get("/leave/balances").then((res) => setBalances(res.data));
    http
      .get("/leave/types")
      .then((res) =>
        setLeaveTypes(
          res.data.map((t) => ({
            id: t.code,
            label: t.name,
            requiresMc: t.requiresMc,
            affectsAnnualBalance: t.affectsAnnualBalance,
            affectsSickBalance: t.affectsSickBalance,
          }))
        )
      )
      .catch(() => {});
    http.get("/holiday").then((res) => setHolidays(res.data));
    http.get("/leave/team-calendar").then((res) => {
      setTeam(res.data.team);
      setApprovedLeaves(res.data.approved);
    });
    http.get("/leave/mine").then((res) => setMyRequests(res.data));
    http.get("/leave/drafts").then((res) => setDrafts(res.data)).catch(() => {});
    http.get("/coverage/blackouts").then((res) => setBlackouts(res.data)).catch(() => setBlackouts([]));
    http.get("/swap/mine").then((res) => setSwaps(res.data)).catch(() => {});
    http
      .get("/user/policies")
      .then((res) => setPolicy(res.data.find((p) => p.country === user.country) || null));
  }, [user.country]);

  useEffect(() => {
    loadAll();
    // Status only (no LLM call) — so we can label the button / show graceful messaging
    http
      .get("/ai/status")
      .then((res) => setAiStatus(res.data))
      .catch(() =>
        setAiStatus({
          llmConfigured: false,
          parseAlwaysAvailable: true,
          message: "Could not reach AI status — parse still uses server fallback.",
        })
      );
  }, [loadAll]);

  // Keep half-day valid only for single-day requests
  useEffect(() => {
    if (halfDay && startDate && endDate && startDate !== endDate) setHalfDay(false);
  }, [startDate, endDate, halfDay]);

  // AI-2: server coverage math when the range changes (not an LLM call)
  useEffect(() => {
    if (!startDate || !endDate || startDate > endDate) {
      setCoverage(null);
      return;
    }
    http
      .post("/leave/coverage-check", { startDate, endDate })
      .then((res) => setCoverage(res.data))
      .catch(() => setCoverage(null));
  }, [startDate, endDate]);

  // M2 (UC-14): balance what-if — server tells us the exact cost and what would
  // be left, including holidays/weekends skipped. Nothing is persisted.
  useEffect(() => {
    if (!startDate || !endDate || startDate > endDate) {
      setForecast(null);
      return;
    }
    http
      .post("/leave/forecast", { leaveType, startDate, endDate, halfDay })
      .then((res) => setForecast(res.data))
      .catch(() => setForecast(null));
  }, [leaveType, startDate, endDate, halfDay]);

  // Live cost of the draft being edited, so a date change shows its effect
  // before saving (same endpoint as the apply form's forecast).
  useEffect(() => {
    if (!draftEdit?.startDate || !draftEdit?.endDate || draftEdit.startDate > draftEdit.endDate) {
      setDraftForecast(null);
      return;
    }
    http
      .post("/leave/forecast", {
        leaveType: draftEdit.leaveType,
        startDate: draftEdit.startDate,
        endDate: draftEdit.endDate,
        halfDay: draftEdit.halfDay,
      })
      .then((res) => setDraftForecast(res.data))
      .catch(() => setDraftForecast(null));
  }, [draftEdit?.id, draftEdit?.leaveType, draftEdit?.startDate, draftEdit?.endDate, draftEdit?.halfDay]);

  /* ---- derived ---- */
  const typeLabel = (id) => leaveTypes.find((t) => t.id === id)?.label ?? id;
  const balanceOf = (typeId) => balances.find((b) => b.leaveType === typeId);
  const remaining = (typeId) => {
    const b = balanceOf(typeId);
    if (!b) return 0;
    return Number(b.entitled) + Number(b.carried) - Number(b.used);
  };
  // A cancellation cycle is excluded: those days are already counted in `used`,
  // so counting them here too would reserve the same days twice (UC-03).
  const pendingDays = (typeId) =>
    myRequests
      .filter(
        (r) =>
          PENDING_STATUSES.includes(r.status) &&
          !r.cancellationRequested &&
          r.leaveType === typeId
      )
      .reduce((s, r) => s + Number(r.days), 0);

  const requestedDays = halfDay ? 0.5 : coverage?.days ?? 0;

  const memberById = (id) => team.find((t) => t.id === id);
  const offOn = (iso) =>
    approvedLeaves.filter((l) => iso >= l.startDate && iso <= l.endDate).map((l) => l.userId);

  /* ---- handlers ---- */
  const scrollToApplyForm = () => {
    setTimeout(() => {
      document.getElementById("leave-application-form")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
  };

  const applyLongWeekend = (startIso, endIso) => {
    setLeaveType("annual");
    setStartDate(startIso);
    setEndDate(endIso);
    setHalfDay(false);
    setTimeout(() => {
      document.getElementById("leave-application-form")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
  };

  const applyParsedToForm = (result) => {
    if (result.startDate) setStartDate(result.startDate);
    if (result.endDate) setEndDate(result.endDate);
    if (result.leaveType) setLeaveType(result.leaveType);
    const isHalf =
      !!result.halfDay &&
      result.startDate &&
      result.endDate &&
      result.startDate === result.endDate;
    setHalfDay(isHalf);
    if (isHalf && (result.halfDayPeriod === "AM" || result.halfDayPeriod === "PM")) {
      setHalfDayPeriod(result.halfDayPeriod);
    }
    if (result.reason) setReason(result.reason);
  };

  // AI-1 v2: one sentence can describe several periods of leave. Clicking a
  // segment loads just that one into the form — nothing is ever auto-submitted.
  const useSegment = (seg) => {
    applyParsedToForm(seg);
    setToast?.("Loaded into the form — review the fields, then submit.");
    document.getElementById("leave-application-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Save every parsed segment as a private draft so a compound request is not lost.
  const saveSegmentsAsDrafts = () => {
    const segs = parsedJSON?.requests?.filter((r) => r.startDate) || [];
    if (!segs.length) return;
    Promise.all(
      segs.map((r) =>
        http.post("/leave/apply", {
          leaveType: r.leaveType,
          startDate: r.startDate,
          endDate: r.endDate,
          halfDay: !!r.halfDay,
          halfDayPeriod: r.halfDay ? r.halfDayPeriod || "AM" : null,
          reason: (r.reason || "From natural-language input").slice(0, 200),
          isDraft: true,
        })
      )
    )
      .then(() => {
        toast.success(`${segs.length} draft(s) saved — open each to review and submit.`);
        loadAll();
      })
      .catch((err) => toast.error(apiError(err, "Could not save the drafts.")));
  };

  // UC-13 (E): ask the AI to read the attached certificate and compare its dates.
  const runMcCheck = (r) => {
    if (mcChecking) return;
    setMcChecking(r.id);
    http
      .post("/ai/check-mc", { requestId: r.id })
      .then((res) => setMcResult((m) => ({ ...m, [r.id]: res.data })))
      .catch((err) =>
        setMcResult((m) => ({
          ...m,
          [r.id]: { verdict: "ERROR", message: apiError(err, "Could not check the certificate.") },
        }))
      )
      .finally(() => setMcChecking(null));
  };

  const handleParse = () => {
    if (!nlText.trim() || parsing) return;
    if (nlText.trim().length < 3) {
      const msg = "Please enter at least a few words describing your leave.";
      setParseError(msg);
      toast.error(msg);
      return;
    }
    setParsing(true);
    setParseError("");
    setParseSuccess("");
    setParsedJSON(null);
    setPreviewOpen(true);
    // AI-1 on-demand only — OpenRouter (if configured) or offline heuristic
    // Prefer /ai/parse-leave (spec); /ai/parse is the same handler.
    http
      .post("/ai/parse-leave", { text: nlText.trim() })
      .then((res) => {
        const result = res.data;
        setParsedJSON(result);
        applyParsedToForm(result);
        const via =
          result.source === "llm"
            ? "AI (OpenRouter)"
            : "offline parser";
        const msg = result.startDate
          ? `Form pre-filled via ${via}. Review and edit the application form below before submitting.`
          : `Parsed via ${via}, but dates were unclear — set them manually in the form.`;
        toast.success(msg);
        // Scroll form into view so user can edit
        setTimeout(() => {
          document.getElementById("leave-application-form")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }, 100);
      })
      .catch((err) => {
        const msg =
          err.response?.data?.message ||
          (err.response?.data?.errors || []).join("; ") ||
          "AI parsing is currently unavailable. Please fill the form manually.";
        setParseError(msg);
        toast.error(msg);
        setToast?.(msg);
      })
      .finally(() => setParsing(false));
  };

  const handleImproveRemarks = () => {
    if (!reason.trim() || improving) return;
    setImproving(true);
    http
      .post("/ai/improve-remarks", { text: reason.trim() })
      .then((res) => {
        if (res.data?.improved) {
          setReason(res.data.improved);
        }
      })
      .catch((err) => {
        const msg = err.response?.data?.message || "Could not improve remarks.";
        toast.error(msg);
        setToast?.(msg);
      })
      .finally(() => setImproving(false));
  };

  // M2 (UC-13): read a chosen MC file into a base64 data URL for upload.
  const onPickAttachment = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setFormError("Attachment is too large (max 5MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAttachment({ name: file.name, type: file.type, data: reader.result });
    reader.readAsDataURL(file);
  };

  const clearForm = () => {
    setStartDate("");
    setEndDate("");
    setHalfDay(false);
    setReason("");
    setNlText("");
    setParsedJSON(null);
    setCoverage(null);
    setAttachment(null);
  };

  const buildPayload = (isDraft) => ({
    leaveType,
    startDate,
    endDate,
    halfDay,
    halfDayPeriod: halfDay ? halfDayPeriod : null,
    reason: reason.trim(),
    isDraft,
    attachmentName: attachment?.name || null,
    attachmentType: attachment?.type || null,
    attachmentData: attachment?.data || null,
  });

  const handleSubmit = () => {
    runSingleFlight(formActionLock, async () => {
      setSubmitting(true);
      setFormError("");
      // Reuse the key after an unknown network failure so a retry returns the
      // already-committed row instead of creating a second leave request.
      const key = submissionKeyRef.current ||
        globalThis.crypto?.randomUUID?.() ||
        `leave-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      submissionKeyRef.current = key;
      try {
        const res = await http.post("/leave/apply", buildPayload(false), {
          headers: { "Idempotency-Key": key },
        });
        submissionKeyRef.current = null;
        setToast(
          res.data.deduplicated
            ? "Your earlier submission was already recorded; no duplicate request was created."
            : res.data.flagged
            ? "Submitted — flagged: coverage below threshold or restricted period, Manager special approval required."
            : "Submitted. Routed to your Supervisor, then Manager (two-tier approval)."
        );
        clearForm();
        loadAll();
      } catch (err) {
        // A server response proves no ambiguous response loss. A deliberate
        // correction should therefore use a fresh key on the next attempt.
        if (err.response) submissionKeyRef.current = null;
        const msg =
          err.response?.data?.message ||
          (err.response?.data?.errors || []).join("; ") ||
          "Submission failed.";
        setFormError(msg);
      } finally {
        setSubmitting(false);
      }
    });
  };

  // M2 (UC-14): save the current form as a private draft.
  const handleSaveDraft = () => {
    runSingleFlight(formActionLock, async () => {
      setSubmitting(true);
      setFormError("");
      try {
        // The apply form always creates a NEW draft. Editing an existing one
        // happens in its own dialog (see draftEdit / saveDraftEdit below), so
        // there is no "am I editing?" branch to take here.
        await http.post("/leave/apply", buildPayload(true));
        setToast("Draft saved. It stays private until you submit it.");
        clearForm();
        loadAll();
      } catch (err) {
        const msg = err.response?.data?.message || (err.response?.data?.errors || []).join("; ") || "Could not save draft.";
        setFormError(msg);
      } finally {
        setSubmitting(false);
      }
    });
  };

  // M2 (UC-14): edit a draft in its own dialog, so the apply form and the AI-1
  // box are left untouched.
  const editDraft = (d) => {
    setDraftEdit({
      id: d.id,
      leaveType: d.leaveType,
      startDate: d.startDate,
      endDate: d.endDate,
      halfDay: !!d.halfDay,
      halfDayPeriod: d.halfDayPeriod || "AM",
      reason: d.reason || "",
      attachmentName: d.attachmentName || null,
      attachmentType: d.attachmentType || null,
      attachmentData: d.attachmentData || null,
    });
    setDraftEditError("");
  };

  const patchDraftEdit = (patch) =>
    setDraftEdit((d) => {
      const next = { ...d, ...patch };
      // Mirror the server rules while typing: half-day is single-day only, and
      // the end date can never precede the start date.
      if (next.endDate < next.startDate) next.endDate = next.startDate;
      if (next.startDate !== next.endDate) next.halfDay = false;
      return next;
    });

  const onPickDraftMc = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setDraftEditError("Attachment is too large (max 5MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      patchDraftEdit({
        attachmentName: file.name,
        attachmentType: file.type,
        attachmentData: reader.result,
      });
    reader.readAsDataURL(file);
  };

  const saveDraftEdit = () => {
    if (!draftEdit || draftSaving) return;
    setDraftSaving(true);
    setDraftEditError("");
    http
      .put(`/leave/drafts/${draftEdit.id}`, {
        leaveType: draftEdit.leaveType,
        startDate: draftEdit.startDate,
        endDate: draftEdit.endDate,
        halfDay: draftEdit.halfDay,
        halfDayPeriod: draftEdit.halfDay ? draftEdit.halfDayPeriod : null,
        reason: draftEdit.reason.trim(),
        attachmentName: draftEdit.attachmentName,
        attachmentType: draftEdit.attachmentType,
        attachmentData: draftEdit.attachmentData,
      })
      .then(() => {
        toast.success("Draft updated.");
        setDraftEdit(null);
        loadAll();
      })
      .catch((err) => setDraftEditError(apiError(err, "Could not update the draft.")))
      .finally(() => setDraftSaving(false));
  };

  // Save the open changes, then route the draft for approval in one go.
  const saveAndSubmitDraft = () => {
    if (!draftEdit || draftSaving) return;
    setDraftSaving(true);
    setDraftEditError("");
    http
      .put(`/leave/drafts/${draftEdit.id}`, {
        leaveType: draftEdit.leaveType,
        startDate: draftEdit.startDate,
        endDate: draftEdit.endDate,
        halfDay: draftEdit.halfDay,
        halfDayPeriod: draftEdit.halfDay ? draftEdit.halfDayPeriod : null,
        reason: draftEdit.reason.trim(),
        attachmentName: draftEdit.attachmentName,
        attachmentType: draftEdit.attachmentType,
        attachmentData: draftEdit.attachmentData,
      })
      .then(() => http.post(`/leave/drafts/${draftEdit.id}/submit`))
      .then((res) => {
        setToast(
          res.data.flagged
            ? "Draft submitted — flagged for Manager special approval."
            : "Draft submitted. Routed to your Supervisor, then Manager."
        );
        setDraftEdit(null);
        loadAll();
      })
      .catch((err) => setDraftEditError(apiError(err, "Could not submit the draft.")))
      .finally(() => setDraftSaving(false));
  };

  const submitDraft = (id) => {
    http
      .post(`/leave/drafts/${id}/submit`)
      .then((res) => {
        setToast(res.data.flagged ? "Draft submitted — flagged for special approval." : "Draft submitted for approval.");
        loadAll();
      })
      .catch((err) => toast.error(err.response?.data?.message || "Could not submit draft."));
  };

  const deleteDraft = (id) => {
    http
      .delete(`/leave/drafts/${id}`)
      .then(() => {
        toast.success("Draft discarded.");
        if (draftEdit?.id === id) setDraftEdit(null);
        loadAll();
      })
      .catch(() => {});
  };

  // M2 (UC-27): propose swapping my approved leave dates with a teammate's.
  const proposeSwap = () => {
    if (!swapFor || !swapTargetId) return;
    http
      .post("/swap", { myRequestId: swapFor.id, counterpartRequestId: Number(swapTargetId) })
      .then(() => {
        toast.success("Swap proposed — awaiting your teammate's response.");
        setSwapFor(null);
        setSwapTargetId("");
        loadAll();
      })
      .catch((err) => toast.error(err.response?.data?.message || "Could not propose swap."));
  };

  const respondSwap = (id, accept) => {
    http
      .put(`/swap/${id}/${accept ? "accept" : "decline"}`)
      .then((res) => {
        toast.success(res.data.message || (accept ? "Swap accepted." : "Swap declined."));
        loadAll();
      })
      .catch((err) => toast.error(err.response?.data?.message || "Could not respond."));
  };

  // Teammates' approved leave I could swap with (id + dates only).
  const [swapTargets, setSwapTargets] = useState([]);
  const openSwap = (myReq) => {
    setSwapFor(myReq);
    setSwapTargetId("");
    // Only equal-cost entries can swap — a swap must not move either balance (UC-27).
    http
      .get("/swap/eligible")
      .then((res) =>
        setSwapTargets(res.data.filter((t) => Number(t.days) === Number(myReq.days)))
      )
      .catch(() => setSwapTargets([]));
  };

  // M2 (UC-14): download approved leave as a calendar file (.ics).
  const downloadIcs = (r) => {
    http
      .get(`/leave/${r.id}/ics`, { responseType: "blob" })
      .then((res) => {
        const url = URL.createObjectURL(new Blob([res.data], { type: "text/calendar" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `leave-REQ-${r.id}-${r.startDate}.ics`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast.success("Calendar file downloaded — open it to add the leave to your calendar.");
      })
      .catch(() => toast.error("Could not export this leave to a calendar file."));
  };

  // M2 (UC-13): attach the MC after submitting (sick leave is often filed first).
  const uploadLateMc = (e) => {
    const file = e.target.files?.[0];
    if (!file || !lateMcFor) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Attachment is too large (max 5MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      http
        .post(`/leave/${lateMcFor.id}/attachment`, {
          attachmentName: file.name,
          attachmentType: file.type,
          attachmentData: reader.result,
        })
        .then(() => {
          toast.success("Medical certificate attached — your approver can now see it.");
          setLateMcFor(null);
          loadAll();
        })
        .catch((err) => toast.error(err.response?.data?.message || "Upload failed."));
    };
    reader.readAsDataURL(file);
  };

  // F4: cancel requires ConfirmDialog (no accidental cancel)
  const [cancelTarget, setCancelTarget] = useState(null); // request row or null
  // UC-03 (extended): "I'm coming back early." Keeps the leave, pulls the end
  // date back, and only the days no longer taken return to the balance.
  const [shortenTarget, setShortenTarget] = useState(null); // request row or null
  const [shortenEnd, setShortenEnd] = useState("");
  const [shortenBusy, setShortenBusy] = useState(false);
  const [shortenError, setShortenError] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [detailRequest, setDetailRequest] = useState(null);


  const openShorten = (r) => {
    setShortenTarget(r);
    setShortenError("");
    // Default to one day earlier than the current end — the commonest case.
    const d = new Date(`${r.endDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    const suggested = d.toISOString().slice(0, 10);
    setShortenEnd(suggested >= r.startDate ? suggested : r.startDate);
  };

  const submitShorten = () => {
    if (!shortenTarget || shortenBusy) return;
    setShortenBusy(true);
    setShortenError("");
    http
      .put(`/leave/${shortenTarget.id}/shorten`, { newEndDate: shortenEnd })
      .then((res) => {
        setToast(res.data.message);
        setShortenTarget(null);
        loadAll();
      })
      .catch((err) => setShortenError(apiError(err, "Could not request an early return.")))
      .finally(() => setShortenBusy(false));
  };

  const handleCancelConfirm = () => {
    if (!cancelTarget || cancelLoading) return;
    setCancelLoading(true);
    http
      .put(`/leave/${cancelTarget.id}/cancel`)
      .then((res) => {
        // UC-03: pending → gone immediately; approved → routed for two-tier approval.
        if (res.data.pendingApproval) {
          toast.success("Cancellation sent for approval.");
        } else {
          toast.success(res.data.message || "Request cancelled.");
        }
        setToast?.(res.data.message);
        setCancelTarget(null);
        loadAll();
      })
      .catch((err) => {
        const msg = err.response?.data?.message || "Cancel failed.";
        toast.error(msg);
        setToast?.(msg);
      })
      .finally(() => setCancelLoading(false));
  };

  const inSelectedRange = (iso) =>
    startDate && endDate && startDate <= endDate && iso >= startDate && iso <= endDate;

  const conflicts = coverage?.conflicts ?? [];

  // UC-18: which of the selected dates are restricted, split by mode. The
  // server is still the authority (it re-checks on submit) — this exists so the
  // employee is told before they fill in a reason, not after.
  const selectedBlackout = useMemo(() => {
    if (!startDate || !endDate || startDate > endDate) {
      return { blocked: [], special: [], periods: [] };
    }
    const blocked = [];
    const special = [];
    const periods = new Map();
    const d = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    while (d <= end) {
      const iso = toISO(d);
      const hits = blackouts.filter((b) => iso >= b.startDate && iso <= b.endDate);
      hits.forEach((b) => periods.set(b.id, b));
      if (hits.some((b) => b.mode === "BLOCK")) blocked.push(iso);
      else if (hits.length > 0) special.push(iso);
      d.setDate(d.getDate() + 1);
    }
    return { blocked, special, periods: [...periods.values()] };
  }, [startDate, endDate, blackouts]);

  const hasBlockedDates = selectedBlackout.blocked.length > 0;

  const canSubmit =
    startDate &&
    endDate &&
    startDate <= endDate &&
    (halfDay || (coverage?.days ?? 0) > 0) &&
    reason.trim().length >= 3 &&
    !hasBlockedDates &&
    !submitting;

  const monthLabel = calMonth.toLocaleDateString("en-SG", { month: "long", year: "numeric" });
  const holidaysSkipped = useMemo(() => {
    if (!startDate || !endDate || startDate > endDate) return [];
    return holidays.filter((h) => h.date >= startDate && h.date <= endDate);
  }, [startDate, endDate, holidays]);

  return (
    <main className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Header row spanning the full grid. The notification bell lives once, in
          the purple app bar (App.jsx) — it is global to every page, so repeating
          it here gave the user two bells for the same inbox. */}
      <div className="lg:col-span-5">
        <h2 className="text-lg font-semibold text-lf-text">My leave</h2>
        <p className="text-sm text-slate-500">
          Apply for leave, track your requests, and check your team's calendar.
        </p>
      </div>

      {/* ================= LEFT ================= */}
      <section className="lg:col-span-3 space-y-6">
        {/* balances */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {leaveTypes.filter((t) => t.affectsAnnualBalance || t.affectsSickBalance).map((t) => {
            const b = balanceOf(t.id);
            const rem = remaining(t.id);
            const pend = pendingDays(t.id);
            return (
              <div key={t.id} className="lf-card p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">{t.label}</p>
                <p className="text-3xl font-semibold text-brand-700 mt-1">
                  {rem - pend}
                  <span className="text-sm font-normal text-slate-400"> days left</span>
                </p>
                {b && (
                  <p className="text-xs text-slate-500 mt-1">
                    {Number(b.entitled)} entitled
                    {Number(b.carried) > 0 ? ` + ${Number(b.carried)} carried` : ""} ·{" "}
                    {Number(b.used)} used{pend > 0 ? ` · ${pend} pending` : ""}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <ForfeitureRiskForecast
          available={remaining("annual") - pendingDays("annual")}
          carryForwardMax={policy?.carryForwardMax ?? 5}
          holidays={holidays}
          onPlan={scrollToApplyForm}
        />

        {/* AI-1 panel — parse is on-demand only (button click) */}
        <div className="lf-card-static p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h2 className="font-semibold text-lf-text">Apply in plain English</h2>
            <span className="text-xs bg-lf-accent-soft text-lf-accent rounded-full px-2 py-0.5 font-medium">
              AI-1 · Natural-language input
            </span>
          </div>
          <p className="text-sm text-slate-500 mb-3">
            Describe your leave — we&apos;ll pre-fill the form below. Always review fields before
            submitting.
          </p>
          {aiStatus && (
            <p
              className={`text-xs mb-2 rounded-lg px-2.5 py-1.5 inline-block ${
                aiStatus.llmConfigured
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-100"
                  : "bg-slate-100 text-slate-600 border border-slate-200"
              }`}
              title={aiStatus.message || ""}
            >
              {aiStatus.llmConfigured
                ? `Hosted AI ready (${aiStatus.provider || "llm"} · ${aiStatus.model || "model"})`
                : "Offline parser — set OPENAI_API_KEY in server/.env for OpenRouter"}
            </p>
          )}
          <textarea
            value={nlText}
            onChange={(e) => {
              setNlText(e.target.value);
              setParseError("");
              setParseSuccess("");
            }}
            rows={3}
            maxLength={500}
            disabled={parsing}
            placeholder='e.g. "I need next Monday off for a family event"'
            className="lf-input w-full min-h-[72px] resize-y"
          />
          <div className="flex flex-wrap gap-2 mt-2">
            {AI1_EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  setNlText(ex);
                  setParseError("");
                  setParseSuccess("");
                }}
                disabled={parsing}
                className="text-xs bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-full px-3 py-1 text-slate-600"
              >
                {ex}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleParse}
              disabled={parsing || !nlText.trim()}
              className="lf-btn lf-btn-primary lf-btn-sm"
              title={
                !nlText.trim()
                  ? "Type a leave request first"
                  : "Parse with AI (or offline fallback) and pre-fill the form"
              }
            >
              {parsing ? (
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Parsing…
                </span>
              ) : (
                "Parse & pre-fill form"
              )}
            </button>
            {parsing && (
              <span className="text-xs text-slate-500">
                {aiStatus?.llmConfigured ? "Calling OpenRouter…" : "Running offline parser…"}
              </span>
            )}
          </div>

          {parseError && (
            <div className="mt-3 bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-700">
              ⚠ {parseError}
            </div>
          )}
          {parseSuccess && !parseError && (
            <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">
              ✓ {parseSuccess}
            </div>
          )}

          {/* AI-1 v2: every period found in the sentence. A compound request such as
              "Monday off, then a half day on Friday" yields two rows. */}
          {parsedJSON?.requests?.length > 1 && (
            <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <p className="text-sm font-medium text-brand-900">
                  {parsedJSON.requests.length} separate periods found
                </p>
                <button
                  type="button"
                  onClick={saveSegmentsAsDrafts}
                  className="lf-btn lf-btn-outline lf-btn-sm"
                >
                  Save all as drafts
                </button>
              </div>
              <ul className="space-y-1.5">
                {parsedJSON.requests.map((r, i) => (
                  <li
                    key={i}
                    className="flex flex-wrap items-center justify-between gap-2 bg-white rounded-lg border border-brand-100 px-3 py-2"
                  >
                    <div className="text-sm">
                      <span className="font-medium text-lf-text">
                        {typeLabel(r.leaveType)} · {r.startDate ? fmt(r.startDate) : "no date"}
                        {r.endDate && r.endDate !== r.startDate ? ` → ${fmt(r.endDate)}` : ""}
                        {r.halfDay ? ` (${r.halfDayPeriod} half-day)` : ""}
                      </span>
                      {r.workingDays != null && (
                        <span className="text-xs text-lf-text-subtle"> · {r.workingDays} day(s)</span>
                      )}
                      {r.reason && <p className="text-xs text-lf-text-subtle">{r.reason}</p>}
                      {r.warning && <p className="text-xs text-amber-700 mt-0.5">⚠ {r.warning}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => useSegment(r)}
                      className="text-xs text-brand-700 hover:text-brand-900 underline shrink-0"
                    >
                      Use in form
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-lf-text-subtle mt-2">
                Nothing is submitted automatically — load one into the form, or save them all as
                drafts and submit each after review.
              </p>
            </div>
          )}

          {parsedJSON && (
            <div className="mt-3 rounded-xl border border-slate-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setPreviewOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-slate-800 text-left"
              >
                <span className="text-xs font-medium text-slate-200 uppercase tracking-wide">
                  Parsed preview {previewOpen ? "▾" : "▸"}
                </span>
                <span className="text-[10px] rounded-full px-2 py-0.5 bg-slate-700 text-brand-300">
                  source: {parsedJSON.source || "—"}
                  {parsedJSON.language && parsedJSON.language !== "en"
                    ? ` · input ${parsedJSON.language.toUpperCase()}`
                    : ""}
                  {parsedJSON.confidence != null
                    ? ` · conf ${(Number(parsedJSON.confidence) * 100).toFixed(0)}%`
                    : ""}
                </span>
              </button>
              {previewOpen && (
                <pre className="bg-slate-900 text-brand-300 text-xs p-3 overflow-x-auto shadow-inner font-mono leading-relaxed m-0">
{JSON.stringify(
  {
    leaveType: parsedJSON.leaveType,
    startDate: parsedJSON.startDate,
    endDate: parsedJSON.endDate,
    halfDay: parsedJSON.halfDay,
    halfDayPeriod: parsedJSON.halfDayPeriod ?? null,
    reason: parsedJSON.reason,
    confidence: parsedJSON.confidence,
    language: parsedJSON.language,
    requests: parsedJSON.requests?.length ?? 1,
    source: parsedJSON.source,
  },
  null,
  2
)}
                </pre>
              )}
              <p className="text-xs text-slate-500 px-3 py-2 bg-slate-50 border-t border-slate-200">
                Values are in the <span className="font-medium">Leave application</span> form
                below — edit any field before you submit.
              </p>
            </div>
          )}
        </div>

        {/* application form — always editable after parse */}
        <div id="leave-application-form" className="lf-card p-5 scroll-mt-4">
          <h2 className="font-semibold mb-1 text-lf-text">Leave application</h2>
          {parsedJSON && (
            <p className="text-xs text-brand-800 bg-brand-50 border border-brand-100 rounded-lg px-2.5 py-1.5 mb-4">
              Pre-filled from natural language — change any field below before submitting.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block sm:col-span-2">
              <span className="text-sm text-slate-600">Leave type</span>
              <select
                value={leaveType}
                onChange={(e) => setLeaveType(e.target.value)}
                className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {leaveTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                    {t.affectsAnnualBalance || t.affectsSickBalance
                      ? ` — ${remaining(t.id) - pendingDays(t.id)} day(s) available`
                      : " — no day limit tracked"}
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-400">
                Leave type cannot be changed after submission — cancel and re-apply instead.
              </span>
            </label>

            <label className="block">
              <span className="text-sm text-slate-600">Start date</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (!endDate || e.target.value > endDate) setEndDate(e.target.value);
                }}
                className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>

            <label className="block">
              <span className="text-sm text-slate-600">End date</span>
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>

            <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
              <label
                className={`inline-flex items-center gap-2 text-sm ${
                  startDate && endDate && startDate !== endDate ? "text-slate-300" : "text-slate-700"
                }`}
              >
                <input
                  type="checkbox"
                  checked={halfDay}
                  disabled={!!(startDate && endDate && startDate !== endDate)}
                  onChange={(e) => setHalfDay(e.target.checked)}
                  className="w-4 h-4 accent-brand-700"
                />
                Half-day (single-day requests only — no hourly increments)
              </label>
              {halfDay && (
                <div className="inline-flex rounded-lg overflow-hidden border border-slate-300">
                  {["AM", "PM"].map((p) => (
                    <button
                      key={p}
                      onClick={() => setHalfDayPeriod(p)}
                      className={`px-3 py-1 text-sm ${
                        halfDayPeriod === p ? "bg-brand-700 text-white" : "bg-white text-slate-600"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <label className="block sm:col-span-2">
              <span className="text-sm text-slate-600">Reason</span>
              <div className="mt-1 flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Short formal leave note for your supervisor"
                  maxLength={200}
                  className="lf-input mt-0 flex-1"
                />
                <button
                  type="button"
                  onClick={handleImproveRemarks}
                  disabled={improving || reason.trim().length < 3}
                  title={
                    reason.trim().length < 3
                      ? "Enter a short reason first"
                      : "Rewrite as a leave letter"
                  }
                  className="lf-btn lf-btn-outline lf-btn-sm shrink-0"
                >
                  {improving ? "Improving…" : "Rewrite letter"}
                </button>
              </div>
              <span className="text-xs text-slate-400">
                Optional AI rewrite is on-demand only — you always control the final text.
              </span>
            </label>
          </div>

          {/* computed summary + UC-14 balance forecast */}
          {startDate && endDate && startDate <= endDate && coverage && (
            <div className="mt-4 bg-slate-50 rounded-lg p-3 text-sm text-slate-600">
              <p>
                <span className="font-medium text-slate-800">{forecast?.days ?? requestedDays}</span>{" "}
                day(s) will be deducted ({fmt(startDate)} → {fmt(endDate)}
                {halfDay ? `, ${halfDayPeriod} half-day` : ""}). Weekends and public holidays are
                excluded automatically.
              </p>
              {holidaysSkipped.length > 0 && (
                <p className="mt-1 text-amber-700">
                  Skipped public holiday{holidaysSkipped.length > 1 ? "s" : ""}:{" "}
                  {holidaysSkipped.map((h) => `${h.name} (${fmt(h.date)})`).join(", ")} — not
                  deducted from your balance.
                </p>
              )}
              {forecast?.balance && (
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 pt-2">
                  <span className="text-xs uppercase tracking-wide text-slate-400">
                    Balance forecast
                  </span>
                  <span>
                    Now:{" "}
                    <span className="font-medium text-slate-800">
                      {forecast.balance.remainingBefore}
                    </span>{" "}
                    day(s)
                  </span>
                  <span aria-hidden="true">→</span>
                  <span>
                    After this request:{" "}
                    <span
                      className={`font-semibold ${
                        forecast.balance.sufficient ? "text-brand-800" : "text-rose-700"
                      }`}
                    >
                      {forecast.balance.remainingAfter}
                    </span>{" "}
                    day(s)
                  </span>
                  {forecast.balance.pending > 0 && (
                    <span className="text-xs text-slate-400">
                      ({forecast.balance.pending} day(s) already reserved by pending requests)
                    </span>
                  )}
                </div>
              )}
              {forecast?.warnings?.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {forecast.warnings.map((w) => (
                    <li key={w} className="text-xs text-rose-700">
                      ⚠ {w}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* M2 (UC-13): medical certificate upload — required when the selected type needs one */}
          {leaveTypes.find((t) => t.id === leaveType)?.requiresMc && (
            <div className="mt-4 rounded-lg border border-lf-border p-3 bg-lf-muted/40">
              <p className="text-sm font-medium text-lf-text mb-1">Medical certificate</p>
              <p className="text-xs text-lf-text-subtle mb-2">
                Attach your MC (PDF/JPG/PNG, max 5MB). Only you, your approvers, and HR can view it.
              </p>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/*"
                onChange={onPickAttachment}
                className="text-sm"
              />
              {attachment && (
                <p className="text-xs text-emerald-700 mt-2">
                  Attached: {attachment.name}{" "}
                  <button type="button" onClick={() => setAttachment(null)} className="underline text-rose-600 ml-1">
                    remove
                  </button>
                </p>
              )}
            </div>
          )}

          {formError && (
            <div className="mt-4 bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-700">
              ⚠ {formError}
            </div>
          )}

          {/* UC-18: restricted-period notice for the selected range */}
          {(selectedBlackout.blocked.length > 0 || selectedBlackout.special.length > 0) && (
            <div
              className={`mt-4 rounded-lg p-4 border ${
                hasBlockedDates ? "bg-red-50 border-red-400" : "bg-red-50/60 border-red-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-red-900 text-sm">
                  {hasBlockedDates ? "Leave blocked on these dates" : "Restricted period"}
                </h3>
                <span className="text-xs bg-red-200 text-red-900 rounded-full px-2 py-0.5">
                  UC-18 · Blackout period
                </span>
              </div>

              {selectedBlackout.blocked.length > 0 && (
                <p className="text-sm text-red-900 mt-2">
                  You cannot apply for{" "}
                  <span className="font-medium">
                    {selectedBlackout.blocked.map((iso) => fmt(iso)).join(", ")}
                  </span>
                  . Pick dates outside the blocked window, or speak to your Manager if the leave is
                  unavoidable.
                </p>
              )}
              {selectedBlackout.special.length > 0 && (
                <p className="text-sm text-red-900 mt-2">
                  {selectedBlackout.special.map((iso) => fmt(iso)).join(", ")} fall in a
                  special-approval window. You can still submit, but the request goes to your
                  Manager for special approval.
                </p>
              )}
              <ul className="mt-2 space-y-1 text-sm text-red-900">
                {selectedBlackout.periods.map((b) => (
                  <li key={b.id}>
                    •{" "}
                    <span className="font-medium">
                      {fmt(b.startDate)} → {fmt(b.endDate)}
                    </span>{" "}
                    — {b.reason || "restricted period"}{" "}
                    <span className="text-xs text-red-700">
                      ({b.scope === "COUNTRY" ? "country-wide" : b.scopeId} ·{" "}
                      {b.mode === "BLOCK" ? "blocked" : "special approval"})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* AI-2 warning (server-computed) */}
          {conflicts.length > 0 && (
            <div className="mt-4 bg-amber-50 border border-amber-300 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-amber-900 text-sm">Team coverage warning</h3>
                <span className="text-xs bg-amber-200 text-amber-900 rounded-full px-2 py-0.5">
                  AI-2 · Smart Coverage Analyzer
                </span>
              </div>
              <p className="text-sm text-amber-900 mt-2">
                If this leave is approved, your team drops below the minimum of{" "}
                {coverage.minPresent} of {coverage.teamSize} members present on {conflicts.length}{" "}
                day(s):
              </p>
              <ul className="mt-2 space-y-1 text-sm text-amber-900">
                {conflicts.map((c) => (
                  <li key={c.date}>
                    • <span className="font-medium">{fmt(c.date)}</span> — {c.explanation}
                  </li>
                ))}
              </ul>
              {coverage.alternative && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <p className="text-sm text-amber-900">
                    Nearest range with full coverage:{" "}
                    <span className="font-medium">
                      {fmt(coverage.alternative.start)} → {fmt(coverage.alternative.end)}
                    </span>
                  </p>
                  <button
                    onClick={() => {
                      setStartDate(coverage.alternative.start);
                      setEndDate(coverage.alternative.end);
                    }}
                    className="text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-3 py-1.5"
                  >
                    Use suggested dates
                  </button>
                </div>
              )}
              <p className="text-xs text-amber-800 mt-3">
                You may still submit — the request will be flagged for Manager special approval per
                company policy.
              </p>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="lf-btn lf-btn-primary w-full sm:w-auto"
            >
              {submitting
                ? "Working…"
                : hasBlockedDates
                ? "Blocked dates — cannot submit"
                : selectedBlackout.special.length > 0 || conflicts.length > 0
                ? "Submit anyway (flag for special approval)"
                : "Submit for approval"}
            </button>
            <button
              onClick={handleSaveDraft}
              disabled={submitting || !startDate || !endDate}
              className="lf-btn lf-btn-outline w-full sm:w-auto"
            >
              Save as draft
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            {/* M1: an approver filing their OWN leave doesn't follow the plain
                Supervisor → Manager path — nobody at their own tier can decide a
                peer's request without a conflict of interest, so a Supervisor's
                request starts at their Manager, and a Manager's or HR Admin's
                goes to HR Admin. Saying "Supervisor → Manager" here would be
                wrong for exactly the people using the view switcher. */}
            {user?.role === "EMPLOYEE"
              ? "Routing: Supervisor → Manager."
              : user?.role === "SUPERVISOR"
              ? "Routing: your Manager decides your own leave."
              : "Routing: HR Admin decides leave for Managers and HR Admins."}{" "}
            No auto-approval. Drafts stay private until submitted.
            Dates shown in red on the calendar are blackout periods — blocked dates cannot be
            requested, special-approval dates need Manager sign-off.
          </p>
        </div>

        {/* M2 (UC-14): draft requests */}
        {drafts.length > 0 && (
          <div className="lf-card p-5">
            <h2 className="font-semibold mb-3">Drafts ({drafts.length})</h2>
            <ul className="divide-y divide-slate-100">
              {drafts.map((d) => (
                <li key={d.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {typeLabel(d.leaveType)} · {fmt(d.startDate)}
                      {d.endDate !== d.startDate ? ` → ${fmt(d.endDate)}` : ""}
                      <span className="text-slate-400 font-normal"> · {Number(d.days)}d</span>
                    </p>
                    <p className="text-xs text-slate-500">{d.reason || "(no reason yet)"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => editDraft(d)} className="text-xs text-brand-700 hover:text-brand-800 underline">
                      Edit
                    </button>
                    <button type="button" onClick={() => submitDraft(d.id)} className="lf-btn lf-btn-sm lf-btn-primary">
                      Submit
                    </button>
                    <button type="button" onClick={() => deleteDraft(d.id)} className="text-xs text-rose-600 hover:text-rose-700 underline">
                      Discard
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* my requests (UC-08) */}
        <div className="lf-card p-5">
          <h2 className="font-semibold mb-3">My requests (past 12 months)</h2>
          {myRequests.length === 0 && (
            <p className="text-sm text-slate-400">No requests yet — your history appears here.</p>
          )}
          <ul className="divide-y divide-slate-100">
            {myRequests.map((r) => (
              <li key={r.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">
                    {typeLabel(r.leaveType)} · {fmt(r.startDate)}
                    {r.endDate !== r.startDate ? ` → ${fmt(r.endDate)}` : ""}{" "}
                    {r.halfDay ? `(${r.halfDayPeriod} half-day)` : ""}
                    <span className="text-slate-400 font-normal"> · {Number(r.days)}d</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    REQ-{r.id} · {r.reason}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDetailRequest(r)}
                    className="text-xs text-brand-700 hover:text-brand-800 underline"
                  >
                    Details & discussion
                  </button>
                  <span className={`text-xs rounded-full px-2.5 py-1 ${statusChipClass(r)}`}>
                    {statusLabel(r)}
                  </span>
                  {/* UC-14: status tracker with timestamps */}
                  <button
                    type="button"
                    onClick={() => setOpenStepper(openStepper === r.id ? null : r.id)}
                    className="text-xs text-slate-500 hover:text-slate-700 underline"
                  >
                    {openStepper === r.id ? "Hide progress" : "Track progress"}
                  </button>
                  {PENDING_STATUSES.includes(r.status) &&
                    !r.cancellationRequested && (
                      <button
                        type="button"
                        onClick={() => setCancelTarget(r)}
                        className="text-xs text-rose-600 hover:text-rose-700 underline"
                      >
                        Cancel
                      </button>
                    )}
                  {/* UC-13 (E): opt-in AI read of the attached certificate */}
                  {r.attachmentName && PENDING_STATUSES.includes(r.status) && (
                    <button
                      type="button"
                      onClick={() => runMcCheck(r)}
                      disabled={mcChecking === r.id}
                      title="Sends only this certificate image to the AI to read its dates"
                      className="text-xs text-brand-700 hover:text-brand-900 underline disabled:opacity-50"
                    >
                      {mcChecking === r.id ? "Checking MC…" : "Check MC with AI"}
                    </button>
                  )}
                  {/* UC-13: the MC can still be attached while the request is open */}
                  {PENDING_STATUSES.includes(r.status) &&
                    r.leaveType !== "annual" &&
                    !r.attachmentName && (
                      <button
                        type="button"
                        onClick={() => setLateMcFor(r)}
                        className="text-xs text-brand-700 hover:text-brand-800 underline"
                      >
                        Attach MC
                      </button>
                    )}
                  {r.status === "APPROVED" && (
                    <>
                      {/* UC-03: withdrawing approved leave needs Supervisor + Manager */}
                      <button
                        type="button"
                        onClick={() => setCancelTarget(r)}
                        className="text-xs text-rose-600 hover:text-rose-700 underline"
                      >
                        Request cancellation
                      </button>
                      {/* UC-03: coming back early keeps the leave and returns
                          only the unused days. Multi-day, future leave only —
                          once it has started it is HR's correction to make. */}
                      {r.endDate !== r.startDate && !r.halfDay && (
                        <button
                          type="button"
                          onClick={() => openShorten(r)}
                          title="Keep this leave but come back sooner"
                          className="text-xs text-brand-700 hover:text-brand-800 underline"
                        >
                          Return early
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => downloadIcs(r)}
                        title="Download an .ics file for Google Calendar or Outlook"
                        className="text-xs text-brand-700 hover:text-brand-800 underline"
                      >
                        Add to calendar
                      </button>
                      <button
                        type="button"
                        onClick={() => openSwap(r)}
                        className="text-xs text-brand-700 hover:text-brand-800 underline"
                      >
                        Propose swap
                      </button>
                    </>
                  )}
                </div>
                {mcResult[r.id] && (
                  <div
                    className={`basis-full w-full text-xs rounded-lg px-3 py-2 border ${
                      mcResult[r.id].verdict === "MATCH"
                        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                        : mcResult[r.id].verdict === "MISMATCH" || mcResult[r.id].verdict === "NOT_AN_MC"
                        ? "bg-rose-50 border-rose-200 text-rose-700"
                        : "bg-amber-50 border-amber-200 text-amber-800"
                    }`}
                  >
                    <span className="font-medium">MC check ({mcResult[r.id].verdict}):</span>{" "}
                    {mcResult[r.id].message}
                    {mcResult[r.id].extracted?.clinic && (
                      <span className="block text-[11px] mt-0.5 opacity-80">
                        Issued by: {mcResult[r.id].extracted.clinic}
                      </span>
                    )}
                    <span className="block text-[11px] mt-0.5 opacity-80">
                      Advisory only — your approver still reviews the document.
                    </span>
                  </div>
                )}
                {openStepper === r.id && (
                  <div className="basis-full w-full">
                    <StatusStepper request={r} applicantRole={user.role} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>

        {detailRequest && (
          <Modal
            title={`REQ-${detailRequest.id} · ${typeLabel(detailRequest.leaveType)}`}
            onClose={() => setDetailRequest(null)}
            size="lg"
            footer={
              <button type="button" onClick={() => setDetailRequest(null)} className="lf-btn lf-btn-ghost">
                Close
              </button>
            }
          >
            <div className="space-y-3">
              <div className="rounded-xl border border-lf-border bg-lf-muted p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-lf-text">
                    {fmt(detailRequest.startDate)}
                    {detailRequest.endDate !== detailRequest.startDate
                      ? ` → ${fmt(detailRequest.endDate)}`
                      : ""}
                    {` · ${Number(detailRequest.days)} day(s)`}
                  </p>
                  <span className={`text-xs rounded-full px-2.5 py-1 ${statusChipClass(detailRequest)}`}>
                    {statusLabel(detailRequest)}
                  </span>
                </div>
                <p className="mt-2 text-lf-text-muted">{detailRequest.reason}</p>
                <p className="mt-2 text-xs text-lf-text-subtle">
                  Current stage: {detailRequest.status.replace(/_/g, " ")}. Discussion stays readable after a decision but becomes append-only and locked.
                </p>
              </div>
              <CommentThread
                requestId={detailRequest.id}
                locked={!String(detailRequest.status).startsWith("PENDING")}
                setToast={setToast}
              />
            </div>
          </Modal>
        )}

        {/* M2 (UC-27): incoming swap proposals */}
        {swaps.incoming?.some((s) => s.status === "PENDING_ACCEPT") && (
          <div className="lf-card p-5">
            <h2 className="font-semibold mb-3">Swap requests for you</h2>
            <ul className="divide-y divide-slate-100">
              {swaps.incoming
                .filter((s) => s.status === "PENDING_ACCEPT")
                .map((s) => (
                  <li key={s.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm">
                      <p className="font-medium">{s.proposer?.name || "A teammate"} wants to swap dates</p>
                      <p className="text-xs text-slate-500">
                        Their {fmt(s.proposerStart)}
                        {s.proposerStart !== s.proposerEnd ? `→${fmt(s.proposerEnd)}` : ""} ⇄ your{" "}
                        {fmt(s.counterpartStart)}
                        {s.counterpartStart !== s.counterpartEnd ? `→${fmt(s.counterpartEnd)}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => respondSwap(s.id, true)} className="lf-btn lf-btn-sm lf-btn-primary">
                        Accept
                      </button>
                      <button onClick={() => respondSwap(s.id, false)} className="lf-btn lf-btn-sm lf-btn-outline">
                        Decline
                      </button>
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        )}

        {/* M2 (UC-27): my proposed swaps status */}
        {swaps.proposed?.length > 0 && (
          <div className="lf-card p-5">
            <h2 className="font-semibold mb-3">My swap proposals</h2>
            <ul className="divide-y divide-slate-100">
              {swaps.proposed.map((s) => (
                <li key={s.id} className="py-2 flex items-center justify-between text-sm">
                  <span>
                    With {s.counterpart?.name || "teammate"} ·{" "}
                    {fmt(s.proposerStart)} ⇄ {fmt(s.counterpartStart)}
                  </span>
                  <span className="text-xs rounded-full px-2.5 py-1 bg-slate-100 text-slate-600">
                    {s.status.replace(/_/g, " ")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* M2 (UC-14): edit a draft in place — the apply form and the AI-1 box stay
          untouched, so nothing is lost by opening this. */}
      {draftEdit && (
        <Modal
          title={`Edit draft — REQ-${draftEdit.id}`}
          onClose={() => !draftSaving && setDraftEdit(null)}
          footer={
            <>
              <button
                onClick={() => setDraftEdit(null)}
                disabled={draftSaving}
                className="lf-btn lf-btn-ghost"
              >
                Cancel
              </button>
              <button
                onClick={saveDraftEdit}
                disabled={draftSaving || !draftEdit.startDate || !draftEdit.endDate}
                className="lf-btn lf-btn-outline"
              >
                {draftSaving ? "Saving…" : "Save draft"}
              </button>
              <button
                onClick={saveAndSubmitDraft}
                disabled={
                  draftSaving ||
                  !draftEdit.startDate ||
                  !draftEdit.endDate ||
                  draftEdit.reason.trim().length < 3
                }
                title={
                  draftEdit.reason.trim().length < 3
                    ? "Add a reason before submitting"
                    : "Save the changes and route this for approval"
                }
                className="lf-btn lf-btn-primary"
              >
                {draftSaving ? "Working…" : "Save & submit"}
              </button>
            </>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block sm:col-span-2">
              <span className="text-sm text-lf-text-muted">Leave type</span>
              <select
                value={draftEdit.leaveType}
                onChange={(e) => patchDraftEdit({ leaveType: e.target.value })}
                className="lf-input"
              >
                {leaveTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label} — {remaining(t.id) - pendingDays(t.id)} day(s) available
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm text-lf-text-muted">Start date</span>
              <input
                type="date"
                value={draftEdit.startDate}
                onChange={(e) => patchDraftEdit({ startDate: e.target.value })}
                className="lf-input"
              />
            </label>

            <label className="block">
              <span className="text-sm text-lf-text-muted">End date</span>
              <input
                type="date"
                value={draftEdit.endDate}
                min={draftEdit.startDate || undefined}
                onChange={(e) => patchDraftEdit({ endDate: e.target.value })}
                className="lf-input"
              />
            </label>

            <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
              <label
                className={`inline-flex items-center gap-2 text-sm ${
                  draftEdit.startDate !== draftEdit.endDate
                    ? "text-lf-text-subtle"
                    : "text-lf-text-muted"
                }`}
              >
                <input
                  type="checkbox"
                  checked={draftEdit.halfDay}
                  disabled={draftEdit.startDate !== draftEdit.endDate}
                  onChange={(e) => patchDraftEdit({ halfDay: e.target.checked })}
                  className="w-4 h-4 accent-brand-700"
                />
                Half-day (single-day requests only)
              </label>
              {draftEdit.halfDay && (
                <div className="inline-flex rounded-lg overflow-hidden border border-lf-border-strong">
                  {["AM", "PM"].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => patchDraftEdit({ halfDayPeriod: p })}
                      className={`px-3 py-1 text-sm ${
                        draftEdit.halfDayPeriod === p
                          ? "bg-brand-700 text-white"
                          : "bg-white text-lf-text-muted"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <label className="block sm:col-span-2">
              <span className="text-sm text-lf-text-muted">Reason</span>
              <input
                type="text"
                value={draftEdit.reason}
                maxLength={200}
                placeholder="Short reason for your supervisor"
                onChange={(e) => patchDraftEdit({ reason: e.target.value })}
                className="lf-input"
              />
            </label>
          </div>

          {/* Same MC rule as the apply form (UC-13) */}
          {draftEdit.leaveType === "sick_mc" && (
            <div className="mt-4 rounded-lg border border-lf-border p-3 bg-lf-muted/40">
              <p className="text-sm font-medium text-lf-text mb-1">Medical certificate</p>
              <p className="text-xs text-lf-text-subtle mb-2">
                Required before this draft can be submitted. PDF/JPG/PNG, max 5MB.
              </p>
              {draftEdit.attachmentName ? (
                <p className="text-xs text-emerald-700">
                  Attached: {draftEdit.attachmentName}{" "}
                  <button
                    type="button"
                    onClick={() =>
                      patchDraftEdit({
                        attachmentName: null,
                        attachmentType: null,
                        attachmentData: null,
                      })
                    }
                    className="underline text-rose-600 ml-1"
                  >
                    remove
                  </button>
                </p>
              ) : (
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/*"
                  onChange={onPickDraftMc}
                  className="text-sm"
                />
              )}
            </div>
          )}

          {draftForecast && (
            <p className="mt-4 text-sm text-lf-text-muted bg-lf-muted/60 rounded-lg p-3">
              <span className="font-medium text-lf-text">{draftForecast.days}</span> day(s) would be
              deducted · balance after:{" "}
              <span
                className={`font-semibold ${
                  draftForecast.balance?.sufficient ? "text-brand-700" : "text-rose-700"
                }`}
              >
                {draftForecast.balance?.remainingAfter}
              </span>{" "}
              day(s)
              {draftForecast.skipped?.length > 0 && (
                <span className="block text-xs text-lf-text-subtle mt-1">
                  Not charged:{" "}
                  {draftForecast.skipped
                    .map(
                      (s) =>
                        `${fmt(s.date)} (${
                          s.reason === "PUBLIC_HOLIDAY" ? "public holiday" : "non-working day"
                        })`
                    )
                    .join(", ")}
                </span>
              )}
            </p>
          )}

          {draftEditError && (
            <div className="mt-4 bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-700">
              ⚠ {draftEditError}
            </div>
          )}
        </Modal>
      )}

      {/* M2 (UC-27): propose-swap modal */}
      {swapFor && (
        <Modal
          title="Propose a leave swap"
          onClose={() => setSwapFor(null)}
          size="sm"
          footer={
            <>
              <button onClick={() => setSwapFor(null)} className="lf-btn lf-btn-ghost">
                Cancel
              </button>
              <button onClick={proposeSwap} disabled={!swapTargetId} className="lf-btn lf-btn-primary">
                Propose swap
              </button>
            </>
          }
        >
          <p className="text-sm text-lf-text-muted mb-3">
            Swap your approved leave ({fmt(swapFor.startDate)}
            {swapFor.startDate !== swapFor.endDate ? ` → ${fmt(swapFor.endDate)}` : ""}) with a
            teammate's. Both sets of dates change only if a Supervisor and Manager approve.
          </p>
          <label className="block">
            <span className="text-sm text-lf-text-muted">
              Teammate's approved leave ({Number(swapFor.days)} day
              {Number(swapFor.days) === 1 ? "" : "s"})
            </span>
            <select
              className="lf-input mt-1"
              value={swapTargetId}
              onChange={(e) => setSwapTargetId(e.target.value)}
            >
              <option value="">Select…</option>
              {swapTargets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {fmt(t.startDate)}
                  {t.startDate !== t.endDate ? ` → ${fmt(t.endDate)}` : ""} · {t.days}d
                </option>
              ))}
            </select>
            <span className="text-xs text-lf-text-subtle">
              {swapTargets.length === 0
                ? `No teammate has future approved leave of the same length (${Number(swapFor.days)} day(s)) — a swap must not change either balance.`
                : "Only equal-length future leave is listed, so both balances stay unchanged."}
            </span>
          </label>
        </Modal>
      )}

      {/* F4: confirm cancel leave */}
      {/* UC-03 (extended): pick the new last day of leave. */}
      <Modal
        open={!!shortenTarget}
        onClose={() => !shortenBusy && setShortenTarget(null)}
        title={shortenTarget ? `Return early from REQ-${shortenTarget.id}` : "Return early"}
      >
        {shortenTarget && (
          <div className="space-y-3">
            <p className="text-sm text-lf-text-muted">
              {typeLabel(shortenTarget.leaveType)} · {fmt(shortenTarget.startDate)} →{" "}
              {fmt(shortenTarget.endDate)} ({Number(shortenTarget.days)} day(s) deducted).
            </p>
            <label className="block text-sm">
              <span className="text-lf-text-muted">New last day of leave</span>
              <input
                type="date"
                className="lf-input mt-1"
                value={shortenEnd}
                min={shortenTarget.startDate}
                max={shortenTarget.endDate}
                onChange={(e) => setShortenEnd(e.target.value)}
              />
            </label>
            <p className="text-xs text-lf-text-subtle">
              The leave is not cancelled — it simply ends sooner, and only the days you no
              longer take come back to your balance. Your Supervisor and Manager approve the
              change first. Weekends and public holidays were never charged, so trimming
              those alone returns nothing.
            </p>
            {shortenError && (
              <p className="text-sm text-rose-600">{shortenError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={shortenBusy}
                onClick={() => setShortenTarget(null)}
                className="lf-btn lf-btn-outline lf-btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={shortenBusy || !shortenEnd}
                onClick={submitShorten}
                className="lf-btn lf-btn-primary lf-btn-sm"
              >
                {shortenBusy ? "Requesting…" : "Request early return"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => !cancelLoading && setCancelTarget(null)}
        onConfirm={handleCancelConfirm}
        loading={cancelLoading}
        variant="danger"
        title={
          cancelTarget
            ? cancelTarget.status === "APPROVED"
              ? `Request cancellation of REQ-${cancelTarget.id}?`
              : `Cancel REQ-${cancelTarget.id}?`
            : "Cancel request?"
        }
        message={
          cancelTarget
            ? `${typeLabel(cancelTarget.leaveType)} · ${fmt(cancelTarget.startDate)}${
                cancelTarget.endDate !== cancelTarget.startDate
                  ? ` → ${fmt(cancelTarget.endDate)}`
                  : ""
              }. ${
                cancelTarget.status === "APPROVED"
                  ? `This leave is already approved, so your Supervisor and Manager must approve the cancellation before the ${Number(
                      cancelTarget.days
                    )} day(s) return to your balance.`
                  : "You can submit a new request if you need different dates."
              }`
            : ""
        }
        confirmLabel={
          cancelTarget?.status === "APPROVED" ? "Yes, request cancellation" : "Yes, cancel request"
        }
        loadingLabel="Working…"
        cancelLabel="Keep request"
      />

      {/* M2 (UC-13): attach an MC to an already-submitted sick request */}
      {lateMcFor && (
        <Modal
          title={`Attach medical certificate — REQ-${lateMcFor.id}`}
          onClose={() => setLateMcFor(null)}
          size="sm"
          footer={
            <button onClick={() => setLateMcFor(null)} className="lf-btn lf-btn-ghost">
              Close
            </button>
          }
        >
          <p className="text-sm text-lf-text-muted mb-3">
            {typeLabel(lateMcFor.leaveType)} · {fmt(lateMcFor.startDate)}
            {lateMcFor.endDate !== lateMcFor.startDate ? ` → ${fmt(lateMcFor.endDate)}` : ""}. PDF,
            JPG or PNG up to 5MB. Only you, your approvers and HR can view it.
          </p>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/*"
            onChange={uploadLateMc}
            className="text-sm"
          />
        </Modal>
      )}

      {/* ================= RIGHT: team calendar ================= */}
      <section className="lg:col-span-2 space-y-6">
        <LongWeekendFinder
          holidays={holidays}
          approvedLeaves={approvedLeaves}
          remainingAnnual={remaining("annual") - pendingDays("annual")}
          userId={user.id}
          onApply={applyLongWeekend}
        />

        <div className="lf-card p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold">Team availability</h2>
            <div className="flex gap-1">
              <button
                onClick={() =>
                  setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))
                }
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600"
              >
                ‹
              </button>
              <button
                onClick={() =>
                  setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))
                }
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600"
              >
                ›
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            {monthLabel} · dates only, per staff access rules (UC-08)
          </p>

          <div className="grid grid-cols-7 text-center text-xs text-slate-400 mb-1">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthCells(calMonth).map((d, i) => {
              if (!d) return <div key={`pad-${i}`} />;
              const iso = toISO(d);
              const ph = holidayName(iso);
              const off = offOn(iso);
              const selected = inSelectedRange(iso);
              const weekend = isWeekend(d);
              const isToday = iso === toISO(new Date());
              // UC-18: restricted windows outrank the holiday/weekend styling —
              // a blocked day is the single most important thing on the cell.
              const bo = blackoutLevel(iso);
              const boPeriods = bo ? blackoutsOn(iso) : [];
              return (
                <div
                  key={iso}
                  title={[
                    ...boPeriods.map(
                      (b) =>
                        `${b.mode === "BLOCK" ? "BLOCKED" : "Special approval"}: ${
                          b.reason || "restricted period"
                        } (${b.scope === "COUNTRY" ? b.scopeId : b.scopeId}, ${b.startDate} to ${
                          b.endDate
                        })`
                    ),
                    ph ? `Public holiday: ${ph}` : null,
                    ...off.map((id) => `${memberById(id)?.name} away`),
                  ]
                    .filter(Boolean)
                    .join("\n")}
                  className={`min-h-12 rounded-lg p-1 text-left border ${
                    bo === "BLOCK"
                      ? "border-red-500 bg-red-100"
                      : bo === "SPECIAL_APPROVAL"
                      ? "border-red-300 border-dashed bg-red-50"
                      : selected
                      ? "border-brand-600 bg-brand-50"
                      : ph
                      ? "border-amber-300 bg-amber-50"
                      : weekend
                      ? "border-transparent bg-slate-50"
                      : "border-transparent bg-white"
                  } ${bo && selected ? "ring-2 ring-teal-600" : ""}`}
                >
                  <p
                    className={`text-xs ${
                      isToday
                        ? "w-5 h-5 flex items-center justify-center rounded-full bg-brand-700 text-white"
                        : bo === "BLOCK"
                        ? "text-red-800 font-semibold"
                        : bo
                        ? "text-red-700"
                        : weekend
                        ? "text-slate-300"
                        : "text-slate-600"
                    }`}
                  >
                    {d.getDate()}
                  </p>
                  <div className="flex flex-wrap gap-0.5 mt-0.5">
                    {bo === "BLOCK" && (
                      <span className="bg-red-600 text-white rounded px-0.5 leading-tight" style={{ fontSize: "9px" }}>
                        BLOCKED
                      </span>
                    )}
                    {bo === "SPECIAL_APPROVAL" && (
                      <span className="bg-red-200 text-red-900 rounded px-0.5 leading-tight" style={{ fontSize: "9px" }}>
                        APPROVAL
                      </span>
                    )}
                    {ph && <span className="text-amber-600 text-xs leading-none">★</span>}
                    {off.map((id, k) => {
                      const m = memberById(id);
                      const isMe = id === user.id;
                      return (
                        <span
                          key={`${id}-${k}`}
                          className={`text-white rounded px-0.5 leading-tight ${
                            isMe ? "bg-brand-600" : "bg-slate-500"
                          }`}
                          style={{ fontSize: "9px" }}
                        >
                          {m?.initials}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>
              <span className="inline-block w-3 h-3 rounded bg-red-100 border border-red-500 align-middle" />{" "}
              Blackout — leave blocked
            </span>
            <span>
              <span className="inline-block w-3 h-3 rounded bg-red-50 border border-dashed border-red-300 align-middle" />{" "}
              Blackout — special approval
            </span>
            <span>
              <span className="text-amber-600">★</span> Public holiday
            </span>
            <span>
              <span className="bg-slate-500 text-white rounded px-1" style={{ fontSize: "9px" }}>
                XX
              </span>{" "}
              Teammate away
            </span>
            <span>
              <span className="bg-brand-600 text-white rounded px-1" style={{ fontSize: "9px" }}>
                {user.initials}
              </span>{" "}
              Your approved leave
            </span>
            <span>
              <span className="inline-block w-3 h-3 rounded bg-brand-50 border border-brand-600 align-middle" />{" "}
              Your selected dates
            </span>
          </div>
        </div>

        {/* upcoming team leave */}
        <div className="lf-card p-5">
          <h2 className="font-semibold mb-3">Upcoming team leave</h2>
          <ul className="space-y-2">
            {approvedLeaves
              .filter((l) => l.endDate >= toISO(new Date()))
              .sort((a, b) => (a.startDate < b.startDate ? -1 : 1))
              .map((l, i) => {
                const m = memberById(l.userId);
                const isMe = l.userId === user.id;
                return (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                        isMe ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {m?.initials}
                    </span>
                    <div>
                      <p className="font-medium text-slate-700">
                        {m?.name}
                        {isMe ? " (you)" : ""}
                      </p>
                      <p className="text-xs text-slate-500">
                        {fmt(l.startDate)}
                        {l.endDate !== l.startDate ? ` → ${fmt(l.endDate)}` : ""}
                        {l.halfDay ? " (half-day)" : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
          </ul>
        </div>

        {/* public holidays — the employee's OWN country calendar */}
        <div className="lf-card p-5">
          <h2 className="font-semibold mb-1">
            Public holidays — {policy?.countryName || user.country}
          </h2>
          {policy && (
            <p className="text-xs text-brand-800 bg-brand-50 rounded-lg px-2.5 py-1.5 mb-3">
              {policy.countryName} statutory policy: {policy.annualMin}–{policy.annualMax} days
              annual leave · {policy.sickMc}d sick with MC · {policy.sickNoMc}d without ·
              carry-forward capped at {policy.carryForwardMax}d.
            </p>
          )}
          <ul className="space-y-1.5 text-sm max-h-72 overflow-y-auto pr-1">
            {holidays.map((h) => (
              <li key={h.date} className="flex justify-between gap-2">
                <span className="text-slate-700">{h.name}</span>
                <span className="text-slate-400 shrink-0">{fmt(h.date)}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-400 mt-3">
            Your calendar and entitlement follow your country of employment ({user.country}).
            Leave crossing a holiday never deducts balance.
          </p>
        </div>
      </section>
    </main>
  );
}

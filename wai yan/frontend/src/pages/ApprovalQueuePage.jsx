import ApprovalQueue from '../components/approval/ApprovalQueue';

/**
 * Approval Queue — enterprise dark design system surface.
 */
export default function ApprovalQueuePage() {
  return (
    <div className="aq-page space-y-7 sm:space-y-8">
      <header className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-400">
          Leave workflow
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 sm:text-3xl">
          Approval Queue
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          UC-02 · Two-tier approval — supervisor first, then manager. No auto-approval.
          Review individually or act in bulk.
        </p>
      </header>
      <ApprovalQueue />
    </div>
  );
}

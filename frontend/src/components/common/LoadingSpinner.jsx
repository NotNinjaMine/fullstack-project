export default function LoadingSpinner({ full = false }) {
  const spinner = (
    <div className="flex items-center gap-2 text-slate-400 text-sm">
      <span className="w-4 h-4 border-2 border-slate-300 border-t-teal-600 rounded-full animate-spin" />
      Loading…
    </div>
  );

  if (!full) return <div className="py-10 flex justify-center">{spinner}</div>;

  return <div className="min-h-screen bg-slate-100 flex items-center justify-center">{spinner}</div>;
}

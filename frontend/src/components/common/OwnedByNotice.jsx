// Placeholder for feature areas outside this vertical's ownership — keeps the
// role-based shell/routing (UC-09) navigable end to end without building
// another member's screens. Swap the child route's element out once that
// member's page lands; nothing else in the shell needs to change.
export default function OwnedByNotice({ title, description }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-8 max-w-md text-center mx-auto">
      <p className="text-3xl mb-2">🚧</p>
      <p className="font-semibold text-slate-700">{title}</p>
      <p className="text-sm text-slate-500 mt-2">{description}</p>
    </div>
  );
}

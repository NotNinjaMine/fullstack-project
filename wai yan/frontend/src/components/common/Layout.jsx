import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

/**
 * App chrome — phone bottom nav, tablet+ side rail, fluid main for 24–40" monitors.
 * ENH-6 responsive + ENH-7e dark surface.
 */
export default function Layout() {
  return (
    <div className="flex min-h-screen min-h-dvh flex-col bg-slate-100 dark:bg-slate-950">
      <Navbar />
      <div className="page-shell flex w-full flex-1">
        <Sidebar />
        <main
          className={[
            'min-w-0 flex-1',
            /* phone: pad + space for bottom nav + home indicator */
            'px-3 py-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))]',
            /* tablet */
            'sm:px-5 sm:py-5',
            /* desktop sidebar present — less bottom pad */
            'md:px-6 md:py-6 md:pb-8',
            /* large monitors: roomier gutters */
            'xl:px-8 xl:py-8',
            '2xl:px-10',
            '3xl:px-12',
          ].join(' ')}
        >
          {/* ENH-6: constrain content on very large screens */}
          <div className="mx-auto w-full max-w-7xl 2xl:max-w-none">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

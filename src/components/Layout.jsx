/* ═══ Layout — Main app shell with Top Header ═══ */
import { Outlet } from 'react-router-dom';
import Header from './Header';

export default function Layout() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: 'var(--bg-primary)', overflow: 'hidden' }}>
      
      {/* Top Navigation Header */}
      <Header />

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto p-4 sm:p-6 pt-[140px] sm:pt-[84px] pb-[84px] md:pb-[24px] w-full" style={{ background: 'var(--bg-primary)' }}>
        <Outlet />
      </main>
    </div>
  );
}

/* ═══ Layout — Main app shell with Top Header ═══ */
import { Outlet } from 'react-router-dom';
import Header from './Header';

export default function Layout() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: 'var(--bg-primary)', overflow: 'hidden' }}>
      
      {/* Top Navigation Header */}
      <Header />

      {/* Main Content Area */}
      <main style={{
        flex: 1,
        overflow: 'auto',
        padding: '24px',
        paddingTop: '84px', // Space for top header
        paddingBottom: '84px', // Space for mobile bottom nav
        background: 'var(--bg-primary)',
        width: '100%',
      }} className="md:pb-[24px]">
        <Outlet />
      </main>
    </div>
  );
}

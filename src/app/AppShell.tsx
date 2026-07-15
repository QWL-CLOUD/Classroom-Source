import {
  Archive,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  HeartPulse,
  Import,
  LayoutDashboard,
  Library,
  Menu,
  Search,
  Settings,
  Sparkles,
  Users,
} from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useUiStore } from '@/app/uiStore';
import styles from './AppShell.module.css';

const navigationGroups = [
  {
    label: 'Workspace',
    links: [
      { to: '/today', label: 'Today', icon: LayoutDashboard },
      { to: '/week', label: 'Week', icon: BookOpen },
      { to: '/calendar', label: 'Calendar', icon: CalendarDays },
      { to: '/tasks', label: 'Tasks', icon: ClipboardCheck },
    ],
  },
  {
    label: 'Organize',
    links: [
      { to: '/learners', label: 'Learners', icon: Users },
      { to: '/library', label: 'Library', icon: Library },
    ],
  },
  {
    label: 'Reflect',
    links: [{ to: '/insights', label: 'Teaching Insights', icon: Sparkles }],
  },
  {
    label: 'System',
    links: [
      { to: '/import', label: 'Import Center', icon: Import },
      { to: '/export', label: 'Export & Backup', icon: Download },
      { to: '/settings', label: 'Settings', icon: Settings },
      { to: '/system-health', label: 'System Health', icon: HeartPulse },
    ],
  },
];

export function AppShell() {
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);

  return (
    <div className={styles.shell} data-sidebar-collapsed={sidebarCollapsed}>
      <aside className={styles.sidebar} aria-label="Primary navigation">
        <div className={styles.brandRow}>
          <div className={styles.brandMark} aria-hidden="true">
            C
          </div>
          {!sidebarCollapsed && (
            <div>
              <div className={styles.brandName}>Classroom</div>
              <div className={styles.schoolYear}>2026–2027</div>
            </div>
          )}
          <button
            className={styles.iconButton}
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            <Menu size={20} />
          </button>
        </div>

        <nav className={styles.nav}>
          {navigationGroups.map((group) => (
            <section key={group.label} className={styles.navGroup}>
              {!sidebarCollapsed && <h2>{group.label}</h2>}
              {group.links.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `${styles.navLink} ${isActive ? styles.activeNavLink : ''}`
                  }
                  title={sidebarCollapsed ? label : undefined}
                >
                  <Icon size={19} aria-hidden="true" />
                  {!sidebarCollapsed && <span>{label}</span>}
                </NavLink>
              ))}
            </section>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <Archive size={15} aria-hidden="true" />
          {!sidebarCollapsed && (
            <span>
              v20.0.0-alpha.0
              <br />
              Designed by Alyssa × ChatGPT
            </span>
          )}
        </div>
      </aside>

      <div className={styles.workspace}>
        <header className={styles.topbar}>
          <label className={styles.searchBox}>
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Search Classroom</span>
            <input
              type="search"
              placeholder="Search learners, lessons, tasks, Library, standards…"
              disabled
              title="Search will be implemented in a later phase"
            />
          </label>
          <div className={styles.historyControls} aria-label="Classroom data history">
            <button type="button" disabled aria-label="Undo" title="Nothing to undo">
              <ChevronLeft size={20} />
            </button>
            <button type="button" disabled aria-label="Redo" title="Nothing to redo">
              <ChevronRight size={20} />
            </button>
          </div>
        </header>
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

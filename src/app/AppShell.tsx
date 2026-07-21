import {
  Archive,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  Download,
  HeartPulse,
  Import,
  LayoutDashboard,
  Library,
  ListTodo,
  Menu,
  Redo2,
  Settings,
  Sparkles,
  Undo2,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useUiStore } from '@/app/uiStore';
import {
  navigationGroupForPath,
  readNavigationGroupPreferences,
  writeNavigationGroupPreferences,
  type NavigationGroupId,
} from '@/app/navigationGroups';
import { buildShellNavigationHref } from '@/app/workspaceNavigation';
import { useEditHistory } from '@/features/editing/useEditHistory';
import { presentActiveSchoolYear } from '@/features/schoolYears/schoolYearPresentation';
import { useActiveSchoolYear } from '@/features/schoolYears/useActiveSchoolYear';
import styles from './AppShell.module.css';

const primaryNavigationLinks = [
  { to: '/today', label: 'Today', icon: LayoutDashboard },
  { to: '/week', label: 'Week', icon: BookOpen },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/agenda', label: 'Agenda', icon: ListTodo },
  { to: '/tasks', label: 'Tasks', icon: ClipboardCheck },
  { to: '/learners', label: 'Learners', icon: Users },
];

const collapsibleNavigationGroups: Array<{
  id: NavigationGroupId;
  label: string;
  links: Array<{ to: string; label: string; icon: typeof Library; status?: 'planned' }>;
}> = [
  {
    id: 'resources',
    label: 'Resources',
    links: [{ to: '/library', label: 'Library', icon: Library, status: 'planned' }],
  },
  {
    id: 'reflect',
    label: 'Reflect',
    links: [{ to: '/insights', label: 'Teaching Insights', icon: Sparkles, status: 'planned' }],
  },
  {
    id: 'settingsData',
    label: 'Settings & Data',
    links: [
      { to: '/import', label: 'Import Center', icon: Import },
      { to: '/export', label: 'Export & Backup', icon: Download, status: 'planned' },
      { to: '/settings', label: 'Settings', icon: Settings, status: 'planned' },
      { to: '/system-health', label: 'System Health', icon: HeartPulse },
    ],
  },
];

type ContentLayout = 'standard' | 'editor' | 'wide' | 'reading';

function getRoutePresentation(pathname: string): { title: string; layout: ContentLayout } {
  if (pathname.startsWith('/planning/session')) return { title: 'Session', layout: 'editor' };
  if (pathname.startsWith('/planning/edit')) return { title: 'Planning', layout: 'editor' };
  if (pathname.startsWith('/schedule/occurrence/edit')) {
    return { title: 'Schedule occurrence', layout: 'editor' };
  }
  if (pathname.startsWith('/schedule/edit')) return { title: 'Schedule', layout: 'editor' };
  if (pathname.startsWith('/calendar/edit')) {
    return { title: 'Calendar event editor', layout: 'editor' };
  }
  if (pathname.startsWith('/week')) return { title: 'Week', layout: 'wide' };
  if (pathname.startsWith('/calendar')) return { title: 'Calendar', layout: 'wide' };
  if (pathname.startsWith('/today')) return { title: 'Today', layout: 'standard' };
  if (pathname.startsWith('/agenda')) return { title: 'Agenda', layout: 'standard' };
  if (pathname.startsWith('/tasks')) return { title: 'Tasks', layout: 'standard' };
  if (pathname.startsWith('/learners')) return { title: 'Learners', layout: 'standard' };
  if (pathname.startsWith('/library')) return { title: 'Library', layout: 'standard' };
  if (pathname.startsWith('/insights')) {
    return { title: 'Teaching Insights', layout: 'standard' };
  }
  if (pathname.startsWith('/import')) return { title: 'Import Center', layout: 'reading' };
  if (pathname.startsWith('/migration')) return { title: 'Migration', layout: 'reading' };
  if (pathname.startsWith('/export')) return { title: 'Export & Backup', layout: 'reading' };
  if (pathname.startsWith('/settings')) return { title: 'Settings', layout: 'reading' };
  if (pathname.startsWith('/system-health')) {
    return { title: 'System Health', layout: 'reading' };
  }
  return { title: 'Classroom', layout: 'standard' };
}

export function AppShell() {
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const history = useEditHistory();
  const activeSchoolYearState = useActiveSchoolYear();
  const location = useLocation();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [navigationGroupPreferences, setNavigationGroupPreferences] = useState(
    readNavigationGroupPreferences,
  );
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileCloseButtonRef = useRef<HTMLButtonElement>(null);
  const presentation = getRoutePresentation(location.pathname);
  const schoolYearContext = presentActiveSchoolYear(activeSchoolYearState);

  useEffect(() => {
    document.title = `${presentation.title} · Classroom`;
  }, [presentation.title]);

  useEffect(() => {
    setMobileNavigationOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const activeGroup = navigationGroupForPath(location.pathname);
    if (!activeGroup) return;
    setNavigationGroupPreferences((preferences) => {
      if (preferences[activeGroup]) return preferences;
      const nextPreferences = { ...preferences, [activeGroup]: true };
      writeNavigationGroupPreferences(nextPreferences);
      return nextPreferences;
    });
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNavigationOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      mobileCloseButtonRef.current?.focus({ preventScroll: true });
    }, 220);

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return;
      setMobileNavigationOpen(false);
      requestAnimationFrame(() => mobileMenuButtonRef.current?.focus());
    }

    document.addEventListener('keydown', closeOnEscape);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileNavigationOpen]);

  function closeMobileNavigation(): void {
    setMobileNavigationOpen(false);
  }

  function toggleNavigationGroup(groupId: NavigationGroupId): void {
    setNavigationGroupPreferences((preferences) => {
      const nextPreferences = { ...preferences, [groupId]: !preferences[groupId] };
      writeNavigationGroupPreferences(nextPreferences);
      return nextPreferences;
    });
  }

  function renderNavigationLink({
    to,
    label,
    icon: Icon,
    status,
  }: {
    to: string;
    label: string;
    icon: typeof Library;
    status?: 'planned';
  }) {
    return (
      <NavLink
        key={to}
        to={buildShellNavigationHref(to, location.search)}
        onClick={closeMobileNavigation}
        className={({ isActive }) => `${styles.navLink} ${isActive ? styles.activeNavLink : ''}`}
        aria-label={label}
        title={sidebarCollapsed ? label : undefined}
      >
        <Icon size={19} aria-hidden="true" />
        <span className={styles.navLinkLabel}>{label}</span>
        {status === 'planned' ? <span className={styles.navStatus}>Planned</span> : null}
      </NavLink>
    );
  }

  return (
    <>
      <a
        className={styles.skipLink}
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        Skip to main content
      </a>
      <div
        className={styles.shell}
        data-sidebar-collapsed={sidebarCollapsed}
        data-mobile-navigation-open={mobileNavigationOpen}
      >
        {mobileNavigationOpen ? (
          <button
            className={styles.mobileBackdrop}
            type="button"
            aria-label="Dismiss navigation"
            onClick={() => {
              closeMobileNavigation();
              requestAnimationFrame(() => mobileMenuButtonRef.current?.focus());
            }}
          />
        ) : null}

        <aside className={styles.sidebar} aria-label="Primary navigation" id="primary-navigation">
          <div className={styles.brandRow}>
            <div className={styles.brandMark} aria-hidden="true">
              C
            </div>
            <div className={styles.brandText}>
              <div className={styles.brandName}>Classroom</div>
              <div
                className={styles.schoolYear}
                data-status={schoolYearContext.tone}
                title={schoolYearContext.detail}
                aria-live="polite"
              >
                {schoolYearContext.label}
              </div>
            </div>
            <button
              ref={mobileCloseButtonRef}
              className={`${styles.iconButton} ${styles.mobileCloseButton}`}
              type="button"
              onClick={() => {
                closeMobileNavigation();
                requestAnimationFrame(() => mobileMenuButtonRef.current?.focus());
              }}
              aria-label="Close navigation"
            >
              <X size={20} />
            </button>
            <button
              className={`${styles.iconButton} ${styles.desktopCollapseButton}`}
              type="button"
              onClick={toggleSidebar}
              aria-label={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            >
              <Menu size={20} />
            </button>
          </div>

          <nav className={styles.nav}>
            <section className={`${styles.navGroup} ${styles.primaryNavGroup}`} aria-label="Daily">
              <div className={styles.navGroupLinks}>
                {primaryNavigationLinks.map(renderNavigationLink)}
              </div>
            </section>

            {collapsibleNavigationGroups.map((group) => {
              const expanded = navigationGroupPreferences[group.id];
              const headingId = `navigation-group-${group.id}-heading`;
              const contentId = `navigation-group-${group.id}-links`;
              return (
                <section
                  key={group.id}
                  className={styles.navGroup}
                  data-collapsible="true"
                  data-expanded={expanded}
                  aria-labelledby={headingId}
                >
                  <h2 id={headingId}>
                    <button
                      className={styles.navGroupToggle}
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={contentId}
                      onClick={() => toggleNavigationGroup(group.id)}
                    >
                      <span>{group.label}</span>
                      <ChevronDown
                        className={styles.navGroupChevron}
                        size={15}
                        aria-hidden="true"
                      />
                    </button>
                  </h2>
                  <div id={contentId} className={styles.navGroupLinks}>
                    {group.links.map(renderNavigationLink)}
                  </div>
                </section>
              );
            })}
          </nav>

          <div className={styles.sidebarFooter}>
            <Archive size={15} aria-hidden="true" />
            <span>
              Classroom v20
              <br />
              Designed by: Alyssa × ChatGPT
            </span>
          </div>
        </aside>

        <div className={styles.workspace}>
          <header className={styles.topbar}>
            <div className={styles.topbarIdentity}>
              <button
                ref={mobileMenuButtonRef}
                className={styles.mobileMenuButton}
                type="button"
                aria-label="Open navigation"
                aria-controls="primary-navigation"
                aria-expanded={mobileNavigationOpen}
                onClick={() => setMobileNavigationOpen(true)}
              >
                <Menu size={20} aria-hidden="true" />
              </button>
              <div>
                <span className={styles.topbarProduct}>
                  <span className={styles.topbarProductName}>Classroom · </span>
                  <span
                    className={styles.topbarSchoolYear}
                    data-status={schoolYearContext.tone}
                    title={schoolYearContext.detail}
                  >
                    {schoolYearContext.label}
                  </span>
                </span>
                <strong aria-live="polite">{presentation.title}</strong>
              </div>
            </div>

            <div className={styles.historyControls} aria-label="Classroom data history">
              <button
                type="button"
                disabled={!history.canUndo || history.busy}
                aria-label="Undo"
                title={history.undoLabel ? `Undo ${history.undoLabel}` : 'Nothing to undo'}
                onClick={() => void history.undo()}
              >
                <Undo2 size={18} aria-hidden="true" />
                <span className={styles.historyLabel}>Undo</span>
              </button>
              <button
                type="button"
                disabled={!history.canRedo || history.busy}
                aria-label="Redo"
                title={history.redoLabel ? `Redo ${history.redoLabel}` : 'Nothing to redo'}
                onClick={() => void history.redo()}
              >
                <Redo2 size={18} aria-hidden="true" />
                <span className={styles.historyLabel}>Redo</span>
              </button>
              <span className="sr-only" role="status" aria-live="polite">
                {history.error ?? ''}
              </span>
            </div>
          </header>
          <main
            id="main-content"
            className={styles.content}
            data-content-layout={presentation.layout}
            tabIndex={-1}
          >
            <Outlet />
          </main>
        </div>
      </div>
    </>
  );
}

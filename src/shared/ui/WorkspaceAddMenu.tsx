import { CalendarDays, CalendarPlus, CheckSquare2, Plus, UserRoundCheck } from 'lucide-react';

import {
  buildPlanningEntryHref,
  type PlanningReturnTarget,
} from '@/features/planning/planningNavigation';
import { useDismissibleDetailsMenu } from './useDismissibleDetailsMenu';
import styles from './WorkspaceAddMenu.module.css';

interface WorkspaceAddMenuProps {
  date: string;
  returnTo: Exclude<PlanningReturnTarget, 'learners'>;
  label?: string;
  compact?: boolean;
  includeWorkspaceItems?: boolean;
  align?: 'start' | 'end';
}

export function WorkspaceAddMenu({
  date,
  returnTo,
  label = 'Add',
  compact = false,
  includeWorkspaceItems = false,
  align = 'end',
}: WorkspaceAddMenuProps) {
  const menu = useDismissibleDetailsMenu<HTMLElement>({
    preferredPlacement: 'auto',
  });

  return (
    <details
      ref={menu.rootRef}
      className={`${styles.root} ${compact ? styles.compact : ''} ${
        align === 'start' ? styles.alignStart : styles.alignEnd
      }`}
      onToggle={menu.onToggle}
      onKeyDown={menu.onKeyDown}
    >
      <summary
        ref={menu.summaryRef}
        className={`button ${compact ? styles.compactSummary : 'button-primary'} ${styles.summary}`}
        aria-label={`${label} to ${date}`}
      >
        <Plus aria-hidden="true" size={compact ? 16 : 18} />
        <span>{label}</span>
      </summary>
      <nav ref={menu.panelRef} className={styles.menu} aria-label={`Add items for ${date}`}>
        <a href={buildPlanningEntryHref({ date, returnTo })}>
          <CalendarPlus aria-hidden="true" size={17} />
          <span>
            <strong>New plan</strong>
            <small>Plan or schedule teaching for this date</small>
          </span>
        </a>
        <a href={`#/calendar/edit?date=${encodeURIComponent(date)}`}>
          <CalendarDays aria-hidden="true" size={17} />
          <span>
            <strong>New event</strong>
            <small>Add a dated calendar event</small>
          </span>
        </a>
        {includeWorkspaceItems ? (
          <>
            <a href={`#/tasks?date=${encodeURIComponent(date)}`}>
              <CheckSquare2 aria-hidden="true" size={17} />
              <span>
                <strong>New task</strong>
                <small>Open Tasks to capture work</small>
              </span>
            </a>
            <a href={`#/learners?date=${encodeURIComponent(date)}&support=active`}>
              <UserRoundCheck aria-hidden="true" size={17} />
              <span>
                <strong>Learner notice</strong>
                <small>Open learner support and notices</small>
              </span>
            </a>
          </>
        ) : null}
      </nav>
    </details>
  );
}

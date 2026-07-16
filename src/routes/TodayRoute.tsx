import {
  AlertTriangle,
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  StickyNote,
  Users,
} from 'lucide-react';
import { useMemo } from 'react';

import type { TodayTemporalStatus, TodayTimelineItem } from '@/features/today/todayReadModel';
import { buildTodayReadModel } from '@/features/today/todayReadModel';
import { TaskList } from '@/features/tasks/TaskList';
import { useWorkspaceReadModel } from '@/features/workspace/useWorkspaceReadModel';
import { formatLongDate, shiftDays, todayLocalDate } from '@/shared/dates/localDate';
import { useDateSearchParam } from '@/shared/dates/useDateSearchParam';

import styles from './TodayRoute.module.css';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function getItemTypeLabel(item: TodayTimelineItem): string {
  if (item.sourceType === 'calendar-event') return 'Calendar';
  if (item.kind === 'container') return 'Schedule group';
  if (item.kind === 'routine') return 'Routine';
  if (item.kind === 'transition') return 'Transition';
  return 'Schedule';
}

function getStatusClassName(status: TodayTemporalStatus): string {
  if (status === 'past') return styles.statusPast!;
  if (status === 'now') return styles.statusNow!;
  if (status === 'upcoming') return styles.statusUpcoming!;
  return styles.statusAllDay!;
}

function getItemClassName(item: TodayTimelineItem): string {
  const classes = [styles.timelineItem];
  classes.push(item.sourceType === 'calendar-event' ? styles.calendarItem : styles.scheduleItem);
  if (item.kind === 'container') classes.push(styles.containerItem);
  if (item.spanPosition !== 'single') classes.push(styles.spanningItem);
  return classes.join(' ');
}

function itemCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'item' : 'items'}`;
}

export function TodayRoute() {
  const { date, setDate } = useDateSearchParam();
  const previousDate = shiftDays(date, -1);
  const nextDate = shiftDays(date, 1);
  const currentDate = todayLocalDate();
  const now = new Date();
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  const state = useWorkspaceReadModel({ startDate: date, endDate: date });
  const today = useMemo(
    () =>
      state.status === 'ready'
        ? buildTodayReadModel(
            date,
            state.data.scheduleBlocks,
            state.data.calendarEvents,
            currentDate,
            currentMinute,
          )
        : null,
    [currentDate, currentMinute, date, state],
  );

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Today workspace</p>
          <h1 className="page-title">{getGreeting()}, Alyssa.</h1>
          <p className="page-subtitle">Previewing {formatLongDate(date)}</p>
        </div>

        <div className={styles.dateToolbar} aria-label="Today date navigation">
          <button
            className="button button-icon"
            type="button"
            aria-label={`Previous day, ${formatLongDate(previousDate)}`}
            onClick={() => setDate(previousDate)}
          >
            <ChevronLeft size={18} />
          </button>
          <button className="button" type="button" onClick={() => setDate(currentDate)}>
            Today
          </button>
          <button
            className="button button-icon"
            type="button"
            aria-label={`Next day, ${formatLongDate(nextDate)}`}
            onClick={() => setDate(nextDate)}
          >
            <ChevronRight size={18} />
          </button>
          <label className={styles.datePicker}>
            <span className="sr-only">Selected date</span>
            <input
              className="input"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
        </div>
      </header>

      <div className={styles.layout}>
        <div className={styles.leftColumn}>
          <article className={`card ${styles.panel}`}>
            <h2>To-do</h2>
            <TaskList dueDate={date} compact />
          </article>

          <article
            className={`card ${styles.panel} ${styles.warmPanel}`}
            aria-labelledby="today-reminders-heading"
          >
            <div className={styles.panelHeading}>
              <Bell size={19} aria-hidden="true" />
              <h2 id="today-reminders-heading">Reminders</h2>
            </div>
            <p className={styles.panelIntro}>Calendar events attached to the selected date.</p>

            {state.status === 'loading' ? (
              <p className={styles.mutedText}>Loading reminders…</p>
            ) : null}
            {state.status === 'error' ? (
              <p className={styles.inlineError}>Reminders could not be loaded.</p>
            ) : null}
            {state.status === 'ready' && today ? (
              today.reminderItems.length > 0 ? (
                <ul
                  className={styles.reminderList}
                  aria-label={`Calendar reminders for ${today.label}`}
                >
                  {today.reminderItems.map((reminder) => (
                    <li key={reminder.occurrenceId}>
                      <div>
                        <strong>{reminder.title}</strong>
                        <span>{reminder.category}</span>
                      </div>
                      <time>{reminder.timeLabel}</time>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.mutedText}>
                  No calendar reminders or dated events for this date.
                </p>
              )
            ) : null}
          </article>

          <article className={`card ${styles.panel}`}>
            <div className={styles.panelHeading}>
              <Users size={19} aria-hidden="true" />
              <h2>Students to notice</h2>
            </div>
            <p>No learner notices have been migrated yet.</p>
            {state.status === 'ready' && state.data.learnerContexts.length > 0 ? (
              <p className={styles.contextNote}>
                {state.data.learnerContexts.length} active learner{' '}
                {state.data.learnerContexts.length === 1 ? 'context is' : 'contexts are'} connected
                to v20 and ready for the Learners phase.
              </p>
            ) : null}
          </article>

          <article className={`card ${styles.panel}`}>
            <h2>Quick capture</h2>
            <textarea
              className={styles.capture}
              placeholder="Idea, reminder, learner moment, or teaching note…"
              disabled
            />
            <button className="button" type="button" disabled>
              <StickyNote size={17} /> Save capture
            </button>
          </article>
        </div>

        <article
          className={styles.scheduleColumn}
          role="region"
          aria-label={`Schedule for ${formatLongDate(date)}`}
        >
          <div className={styles.scheduleHeader}>
            <div>
              <p className="page-eyebrow">Today schedule</p>
              <h2>{formatLongDate(date)}</h2>
              {today ? (
                <p className={styles.scheduleSummary}>
                  {today.sourceScheduleBlockCount} schedule{' '}
                  {today.sourceScheduleBlockCount === 1 ? 'block' : 'blocks'} ·{' '}
                  {today.sourceCalendarEventCount} dated{' '}
                  {today.sourceCalendarEventCount === 1 ? 'event' : 'events'} ·{' '}
                  {itemCountLabel(today.visibleItemCount)} visible
                </p>
              ) : null}
            </div>
            <a className="button button-primary" href={`#/week?date=${date}`}>
              <CalendarDays size={17} /> View in Week
            </a>
          </div>

          {state.status === 'loading' ? (
            <div className={`card ${styles.statePanel}`} aria-live="polite">
              <Clock3 size={28} aria-hidden="true" />
              <p>Loading Today from the v20 database…</p>
            </div>
          ) : null}

          {state.status === 'error' ? (
            <div className={`card ${styles.errorPanel}`} role="alert" aria-live="assertive">
              <AlertTriangle size={24} aria-hidden="true" />
              <div>
                <h3>Today could not be loaded</h3>
                <p>{state.message}</p>
              </div>
            </div>
          ) : null}

          {state.status === 'ready' && today ? (
            <>
              {today.hiddenDuplicateCount > 0 ? (
                <p className={styles.duplicateNote}>
                  {today.hiddenDuplicateCount} exact dated{' '}
                  {today.hiddenDuplicateCount === 1 ? 'duplicate' : 'duplicates'} suppressed in this
                  timeline.
                </p>
              ) : null}

              {state.data.quarantineCount > 0 ? (
                <p className={styles.quarantineNote}>
                  Quarantined imports remain isolated and are not shown in Today.
                </p>
              ) : null}

              {today.focusItem && today.focusLabel ? (
                <article
                  className={`card ${styles.focusCard}`}
                  aria-label={`${today.focusLabel}: ${today.focusItem.title}`}
                >
                  <div className={styles.focusLabel}>{today.focusLabel}</div>
                  <div className={styles.focusBody}>
                    <div>
                      <h3>{today.focusItem.title}</h3>
                      <p>
                        {today.focusItem.timeLabel} · {getItemTypeLabel(today.focusItem)}
                      </p>
                    </div>
                    <Clock3 size={25} aria-hidden="true" />
                  </div>
                </article>
              ) : null}

              {today.timelineItems.length > 0 ? (
                <ol className={styles.timelineList} aria-label={`Timeline for ${today.label}`}>
                  {today.timelineItems.map((item) => (
                    <li
                      key={item.occurrenceId}
                      className={getItemClassName(item)}
                      aria-label={`${item.title}, ${item.timeLabel}, ${item.statusLabel}`}
                    >
                      <div className={styles.timelineRail} aria-hidden="true">
                        <span />
                      </div>
                      <div className={styles.timelineContent}>
                        <div className={styles.itemMeta}>
                          <span
                            className={`${styles.statusBadge} ${getStatusClassName(
                              item.temporalStatus,
                            )}`}
                          >
                            {item.statusLabel}
                          </span>
                          <time>{item.timeLabel}</time>
                        </div>
                        <h3>{item.title}</h3>
                        {item.parentTitle ? (
                          <p className={styles.itemContext}>Part of {item.parentTitle}</p>
                        ) : null}
                        <div className={styles.itemFooter}>
                          <span>{getItemTypeLabel(item)}</span>
                          <span>{item.category}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className={`card ${styles.scheduleEmpty}`}>
                  <Clock3 size={32} aria-hidden="true" />
                  <h3>No schedule items for this date</h3>
                  <p>
                    Today reads recurring Schedule Blocks and dated Calendar events from the v20
                    database.
                  </p>
                  <a className="button" href={`#/calendar?date=${date}`}>
                    <CalendarDays size={17} /> Open Calendar
                  </a>
                </div>
              )}
            </>
          ) : null}
        </article>
      </div>
    </section>
  );
}

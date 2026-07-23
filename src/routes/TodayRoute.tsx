import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Users,
} from 'lucide-react';
import { useMemo, type ChangeEvent } from 'react';

import { formatCalendarMinute } from '@/features/calendar/calendarReadModel';
import {
  buildScheduleBlockHierarchyMetadata,
  type ScheduleBlockHierarchyMetadata,
} from '@/features/editing/scheduleBlockHierarchy';
import { buildPlanningEntryHref } from '@/features/planning/planningNavigation';
import { buildWeekHref } from '@/features/week/weekNavigation';
import { useWeekPlanningReadModel } from '@/features/week/useWeekPlanningReadModel';
import type {
  TodayReadModel,
  TodayTemporalStatus,
  TodayTimelineItem,
} from '@/features/today/todayReadModel';
import { buildTodayReadModel } from '@/features/today/todayReadModel';
import { useScheduleExceptionsForRange } from '@/features/scheduleExceptions/useScheduleExceptionsForRange';
import { useActiveSchoolYear } from '@/features/schoolYears/useActiveSchoolYear';
import { AgendaSummary } from '@/features/agenda/AgendaSummary';
import { TodayLearnerNoticeList } from '@/features/learnerNotices/TodayLearnerNoticeList';
import { TodayReminderList } from '@/features/reminders/TodayReminderList';
import { TaskList } from '@/features/tasks/TaskList';
import { useWorkspaceReadModel } from '@/features/workspace/useWorkspaceReadModel';
import { formatLongDate, shiftDays, todayLocalDate } from '@/shared/dates/localDate';
import { useDateSearchParam } from '@/shared/dates/useDateSearchParam';
import { WorkspaceAddMenu } from '@/shared/ui/WorkspaceAddMenu';

import styles from './TodayRoute.module.css';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function getItemTypeLabel(item: TodayTimelineItem): string {
  if (item.sourceType === 'session-occurrence') return 'Session';
  if (item.sourceType === 'calendar-event') return 'Event';
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
  const classes = [styles.timelineItem!];
  if (item.sourceType === 'session-occurrence') classes.push(styles.sessionItem!);
  else
    classes.push(
      item.sourceType === 'calendar-event' ? styles.calendarItem! : styles.scheduleItem!,
    );
  if (item.kind === 'container') classes.push(styles.containerItem!);
  if (item.spanPosition !== 'single') classes.push(styles.spanningItem!);
  return classes.join(' ');
}

function itemCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'item' : 'items'}`;
}

function childCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'child' : 'children'}`;
}

function getStartTimeLabel(item: TodayTimelineItem): string {
  if (item.isAllDay) return 'All day';

  if (item.spanPosition === 'middle') {
    return 'Continues';
  }

  if (item.spanPosition === 'end') {
    return item.endMinute !== undefined ? `Until ${formatCalendarMinute(item.endMinute)}` : 'Ends';
  }

  if (item.spanPosition === 'start') {
    return item.startMinute !== undefined ? formatCalendarMinute(item.startMinute) : 'Starts';
  }

  if (item.startMinute !== undefined) {
    return formatCalendarMinute(item.startMinute);
  }

  if (item.endMinute !== undefined) {
    return `Until ${formatCalendarMinute(item.endMinute)}`;
  }

  return item.timeLabel;
}

function getDurationLabel(item: TodayTimelineItem): string | null {
  if (
    item.spanPosition !== 'single' ||
    item.startMinute === undefined ||
    item.endMinute === undefined ||
    item.endMinute <= item.startMinute
  ) {
    return null;
  }

  const duration = item.endMinute - item.startMinute;
  if (duration < 60) return `${duration} min`;
  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;
  return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

function getTodayWeekHref(date: string, today: TodayReadModel | null): string {
  const focusItem = today?.focusItem;
  if (!focusItem) return buildWeekHref({ date, view: 'everything' });

  return buildWeekHref({
    date,
    view:
      focusItem.sourceType === 'calendar-event'
        ? 'events'
        : focusItem.sourceType === 'session-occurrence'
          ? 'everything'
          : 'schedule',
    focus: focusItem.occurrenceId,
  });
}

export function TodayRoute() {
  const { date, setDate } = useDateSearchParam();
  const previousDate = shiftDays(date, -1);
  const nextDate = shiftDays(date, 1);
  const currentDate = todayLocalDate();
  const now = new Date();
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  const state = useWorkspaceReadModel({ startDate: date, endDate: date });
  const scheduleExceptions = useScheduleExceptionsForRange(date, date);
  const planningState = useWeekPlanningReadModel({
    startDate: date,
    endDate: date,
  });
  const activeSchoolYearState = useActiveSchoolYear();
  const schoolYearBoundary =
    activeSchoolYearState.status === 'ready'
      ? (activeSchoolYearState.data ?? undefined)
      : undefined;
  const scheduleHierarchy = useMemo<ReadonlyMap<string, ScheduleBlockHierarchyMetadata>>(
    () =>
      state.status === 'ready'
        ? buildScheduleBlockHierarchyMetadata(state.data.scheduleBlocks)
        : new Map<string, ScheduleBlockHierarchyMetadata>(),
    [state],
  );
  const learnerContextNames = useMemo<ReadonlyMap<string, string>>(
    () =>
      state.status === 'ready'
        ? new Map(state.data.learnerContexts.map((context) => [context.id, context.name] as const))
        : new Map<string, string>(),
    [state],
  );
  const today = useMemo(
    () =>
      state.status === 'ready' && planningState.status === 'ready'
        ? buildTodayReadModel(
            date,
            state.data.scheduleBlocks,
            state.data.calendarEvents,
            currentDate,
            currentMinute,
            scheduleExceptions ?? [],
            planningState.data.lessonPlans,
            planningState.data.sessionOccurrences,
            schoolYearBoundary,
          )
        : null,
    [
      currentDate,
      currentMinute,
      date,
      planningState,
      scheduleExceptions,
      schoolYearBoundary,
      state,
    ],
  );
  const weekHref = getTodayWeekHref(date, today);

  return (
    <section>
      <header className={styles.heroHeader}>
        <div className={styles.heroCopy}>
          <p className="page-eyebrow">Today workspace</p>
          <h1 className={`page-title ${styles.heroTitle}`}>{getGreeting()}, Alyssa.</h1>
          <p className="page-subtitle">
            {date === currentDate
              ? `Today · ${formatLongDate(date)}`
              : `Viewing ${formatLongDate(date)}`}
          </p>
        </div>

        <div className={styles.heroAction}>
          <WorkspaceAddMenu date={date} returnTo="today" includeWorkspaceItems />
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
              onChange={(event: ChangeEvent<HTMLInputElement>) => setDate(event.target.value)}
            />
          </label>
        </div>
      </header>

      <div className={styles.layout}>
        <article
          className={styles.scheduleColumn}
          role="region"
          aria-label={`Schedule for ${formatLongDate(date)}`}
        >
          <div className={styles.scheduleHeader}>
            <div>
              <h2 className={styles.scheduleSectionTitle}>
                {date === currentDate ? 'Today schedule' : 'Schedule'}
              </h2>
              {today ? (
                <p className={styles.scheduleSummary}>
                  {today.sourceScheduleBlockCount} schedule{' '}
                  {today.sourceScheduleBlockCount === 1 ? 'block' : 'blocks'} ·{' '}
                  {today.sourceCalendarEventCount} dated{' '}
                  {today.sourceCalendarEventCount === 1 ? 'event' : 'events'} ·{' '}
                  {today.sourceSessionOccurrenceCount} session
                  {today.sourceSessionOccurrenceCount === 1 ? '' : 's'} ·{' '}
                  {itemCountLabel(today.visibleItemCount)} visible
                </p>
              ) : null}
            </div>
            <a className="button button-primary" href={weekHref}>
              <CalendarDays size={17} /> View in Week
            </a>
          </div>

          {state.status === 'loading' ? (
            <div className={`card ${styles.statePanel}`} aria-live="polite">
              <Clock3 size={28} aria-hidden="true" />
              <p>Loading today’s schedule…</p>
            </div>
          ) : null}

          {state.status === 'error' || planningState.status === 'error' ? (
            <div className={`card ${styles.errorPanel}`} role="alert" aria-live="assertive">
              <AlertTriangle size={24} aria-hidden="true" />
              <div>
                <h3>Today could not be loaded</h3>
                <p>
                  {state.status === 'error'
                    ? state.message
                    : planningState.status === 'error'
                      ? planningState.message
                      : 'Planning data could not be loaded.'}
                </p>
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
                <div
                  className={styles.focusStrip}
                  role="status"
                  aria-label={`${today.focusLabel}: ${today.focusItem.title}`}
                >
                  <span className={styles.focusLabel}>{today.focusLabel}</span>
                  <strong>{today.focusItem.title}</strong>
                  <span>
                    {getStartTimeLabel(today.focusItem)} · {getItemTypeLabel(today.focusItem)}
                  </span>
                </div>
              ) : null}

              {today.timelineItems.length > 0 ? (
                <ol className={styles.timelineList} aria-label={`Timeline for ${today.label}`}>
                  {today.timelineItems.map((item) => {
                    const durationLabel = getDurationLabel(item);
                    const hierarchy =
                      item.sourceType === 'schedule-block'
                        ? scheduleHierarchy.get(item.sourceRecordId)
                        : undefined;
                    return (
                      <li
                        key={item.occurrenceId}
                        className={`${getItemClassName(item)} ${
                          hierarchy?.visualDepth ? styles.hierarchyChild : ''
                        } ${
                          hierarchy && hierarchy.directChildCount > 0 ? styles.hierarchyParent : ''
                        }`}
                        aria-label={`${item.title}, ${item.timeLabel}, ${item.statusLabel}`}
                        data-today-item={item.occurrenceId}
                        data-schedule-id={
                          item.sourceType === 'schedule-block' ? item.sourceRecordId : undefined
                        }
                        data-schedule-depth={hierarchy?.visualDepth}
                        data-parent-id={hierarchy?.parentId}
                        data-child-count={hierarchy?.directChildCount}
                        data-group-tone={hierarchy?.groupTone}
                        data-hierarchy-role={
                          hierarchy?.directChildCount
                            ? 'parent'
                            : hierarchy?.visualDepth
                              ? 'child'
                              : undefined
                        }
                      >
                        <div
                          className={styles.timelineTime}
                          title={item.timeLabel}
                          data-timeline-time
                        >
                          <time>{getStartTimeLabel(item)}</time>
                          {durationLabel ? <span>{durationLabel}</span> : null}
                        </div>
                        <div className={styles.timelineRail} aria-hidden="true">
                          <span />
                        </div>
                        <div className={styles.timelineContent} data-timeline-content>
                          <div className={styles.itemMeta}>
                            <span
                              className={`${styles.statusBadge} ${getStatusClassName(
                                item.temporalStatus,
                              )}`}
                            >
                              {item.statusLabel}
                            </span>
                            <span className={styles.itemType}>{getItemTypeLabel(item)}</span>
                          </div>
                          {hierarchy &&
                          (hierarchy.directChildCount > 0 || hierarchy.visualDepth) ? (
                            <div className={styles.hierarchyBanner}>
                              <span className={styles.hierarchyRole}>
                                {hierarchy.directChildCount > 0 ? 'Parent block' : 'Child block'}
                              </span>
                              <span className={styles.hierarchyDetail}>
                                {hierarchy.directChildCount > 0
                                  ? `${childCountLabel(hierarchy.directChildCount)} scheduled inside`
                                  : hierarchy.parentUnavailable
                                    ? 'Parent unavailable'
                                    : `Inside ${
                                        hierarchy.parentTitle ?? item.parentTitle ?? 'parent block'
                                      }`}
                              </span>
                            </div>
                          ) : null}
                          <h3>{item.title}</h3>
                          {hierarchy && hierarchy.directChildCount > 0 ? (
                            <span className={styles.childCountBadge}>
                              {childCountLabel(hierarchy.directChildCount)}
                            </span>
                          ) : null}
                          {item.parentTitle ? (
                            <p className={styles.itemContext}>Part of {item.parentTitle}</p>
                          ) : null}
                          {item.category ? (
                            <p className={styles.itemCategory}>{item.category}</p>
                          ) : null}
                          {item.attachedSessions.length > 0 ? (
                            <div
                              className={styles.attachedSessions}
                              aria-label={`Teaching plans attached to ${item.title}`}
                            >
                              <span className={styles.attachedSessionsLabel}>Teaching plan</span>
                              {item.attachedSessions.map((session) => (
                                <div
                                  key={session.sessionId}
                                  className={styles.attachedSession}
                                  data-today-item={`session-occurrence:${session.sessionId}`}
                                  data-session-id={session.sessionId}
                                >
                                  <div>
                                    <span className={styles.attachedSessionType}>Session</span>
                                    <strong>{session.title}</strong>
                                    <span>
                                      {learnerContextNames.get(session.contextId) ??
                                        'Learner context'}{' '}
                                      · {session.deliveryState}
                                    </span>
                                  </div>
                                  <a
                                    className={styles.occurrenceEdit}
                                    href={`#/planning/session?session=${encodeURIComponent(session.sessionId)}&date=${date}&return=today`}
                                    aria-label={`Manage ${session.title} session`}
                                  >
                                    Manage session
                                  </a>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {item.sourceType === 'schedule-block' ? (
                            <div className={styles.occurrenceActions}>
                              {item.kind === 'teachable' && item.planningEnabled ? (
                                <a
                                  className={styles.occurrenceEdit}
                                  href={buildPlanningEntryHref({
                                    date,
                                    returnTo: 'today',
                                    scheduleBlockId: item.sourceRecordId,
                                  })}
                                  aria-label={`Plan ${item.title} on ${date}`}
                                >
                                  <CalendarPlus aria-hidden="true" size={14} /> Plan this block
                                </a>
                              ) : null}
                              <a
                                className={styles.occurrenceEdit}
                                href={`#/schedule/occurrence/edit?block=${encodeURIComponent(item.sourceRecordId)}&date=${date}&return=today`}
                                aria-label={`Edit ${item.title} on ${date}`}
                              >
                                Edit occurrence
                              </a>
                            </div>
                          ) : null}
                          {item.sourceType === 'session-occurrence' ? (
                            <a
                              className={styles.occurrenceEdit}
                              href={`#/planning/session?session=${encodeURIComponent(item.sourceRecordId)}&date=${date}&return=today`}
                              aria-label={`Manage ${item.title} session`}
                            >
                              Manage session
                            </a>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <div className={`card ${styles.scheduleEmpty}`}>
                  <Clock3 size={32} aria-hidden="true" />
                  <h3>No schedule items for this date</h3>
                  <p>
                    Recurring schedule blocks, dated events, and learner sessions will appear here.
                  </p>
                  <a className="button" href={`#/calendar?date=${date}`}>
                    <CalendarDays size={17} /> Open Calendar
                  </a>
                </div>
              )}
            </>
          ) : null}
        </article>

        <div className={styles.leftColumn}>
          <article className={`card ${styles.panel}`}>
            <h2>To-do</h2>
            <TaskList selectedDate={date} compact />
          </article>

          <article className={`card ${styles.panel}`}>
            <AgendaSummary selectedDate={date} />
          </article>

          <article
            className={`card ${styles.panel} ${styles.warmPanel}`}
            aria-labelledby="today-reminders-heading"
          >
            <div className={styles.panelHeading}>
              <Bell size={19} aria-hidden="true" />
              <h2 id="today-reminders-heading">Reminders</h2>
            </div>
            <TodayReminderList selectedDate={date} />
          </article>

          <article className={`card ${styles.panel}`}>
            <div className={styles.panelHeading}>
              <Users size={19} aria-hidden="true" />
              <h2>Students to notice</h2>
            </div>
            <TodayLearnerNoticeList selectedDate={date} />
          </article>
        </div>
      </div>
    </section>
  );
}

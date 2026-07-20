import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { CalendarDayItem, CalendarDayReadModel } from '@/features/calendar/calendarReadModel';
import {
  CALENDAR_WEEKDAY_LABELS,
  buildCalendarMonthReadModel,
  getCalendarMonthRange,
  shiftCalendarMonth,
} from '@/features/calendar/calendarReadModel';
import {
  buildScheduleBlockHierarchyMetadata,
  type ScheduleBlockHierarchyMetadata,
} from '@/features/editing/scheduleBlockHierarchy';
import { buildPlanningEntryHref } from '@/features/planning/planningNavigation';
import { useScheduleExceptionsForRange } from '@/features/scheduleExceptions/useScheduleExceptionsForRange';
import { useWeekPlanningReadModel } from '@/features/week/useWeekPlanningReadModel';
import { buildWeekHref } from '@/features/week/weekNavigation';
import { useWorkspaceReadModel } from '@/features/workspace/useWorkspaceReadModel';
import { todayLocalDate } from '@/shared/dates/localDate';
import { useDateSearchParam } from '@/shared/dates/useDateSearchParam';

import styles from './CalendarRoute.module.css';

const compactCalendarQuery = '(max-width: 900px)';

function getItemTypeLabel(item: CalendarDayItem): string {
  if (item.sourceType === 'session-occurrence') return 'Session';
  if (item.sourceType === 'calendar-event') return 'Event';
  if (item.kind === 'container') return 'Schedule group';
  if (item.kind === 'routine') return 'Routine';
  if (item.kind === 'transition') return 'Transition';
  return 'Schedule';
}

function getItemClassName(item: CalendarDayItem): string {
  const classes = [styles.item];
  if (item.sourceType === 'session-occurrence') classes.push(styles.sessionItem);
  else
    classes.push(
      item.sourceType === 'calendar-event' ? styles.calendarEvent : styles.scheduleBlock,
    );
  if (item.kind === 'container') classes.push(styles.containerItem);
  if (item.spanPosition !== 'single') classes.push(styles.spanningItem);
  return classes.join(' ');
}

function useCompactCalendar(): boolean {
  const [compact, setCompact] = useState(
    () =>
      typeof window !== 'undefined' && window.matchMedia?.(compactCalendarQuery).matches === true,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia(compactCalendarQuery);
    const update = () => setCompact(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  return compact;
}

function CalendarItemCard({
  item,
  date,
  hierarchy,
}: {
  item: CalendarDayItem;
  date: string;
  hierarchy: ScheduleBlockHierarchyMetadata | undefined;
}) {
  return (
    <li
      className={`${getItemClassName(item)} ${
        item.sourceType === 'schedule-block' && hierarchy?.visualDepth ? styles.hierarchyChild : ''
      } ${
        item.sourceType === 'schedule-block' && (hierarchy?.directChildCount ?? 0) > 0
          ? styles.hierarchyParent
          : ''
      }`}
      data-calendar-item={item.occurrenceId}
      data-schedule-id={item.sourceType === 'schedule-block' ? item.sourceRecordId : undefined}
      data-schedule-depth={
        item.sourceType === 'schedule-block' ? hierarchy?.visualDepth : undefined
      }
      data-parent-id={item.sourceType === 'schedule-block' ? hierarchy?.parentId : undefined}
      data-child-count={
        item.sourceType === 'schedule-block' ? hierarchy?.directChildCount : undefined
      }
      data-group-tone={item.sourceType === 'schedule-block' ? hierarchy?.groupTone : undefined}
    >
      <div className={styles.itemMeta}>
        <span>{getItemTypeLabel(item)}</span>
        {item.deliveryState ? <span>{item.deliveryState}</span> : null}
        <time>{item.timeLabel}</time>
      </div>
      <p className={styles.itemTitle}>{item.title}</p>
      {item.parentTitle ? <p className={styles.itemContext}>Part of {item.parentTitle}</p> : null}
      {item.category ? <p className={styles.itemCategory}>{item.category}</p> : null}
      {item.sourceType === 'schedule-block' ? (
        <a
          className={styles.occurrenceEdit}
          href={`#/schedule/occurrence/edit?block=${encodeURIComponent(item.sourceRecordId)}&date=${date}&return=calendar`}
          aria-label={`Edit ${item.title} on ${date}`}
        >
          Edit occurrence
        </a>
      ) : null}
      {item.sourceType === 'session-occurrence' ? (
        <a
          className={styles.occurrenceEdit}
          href={`#/planning/session?session=${encodeURIComponent(item.sourceRecordId)}&date=${date}&return=calendar`}
          aria-label={`Manage ${item.title} session`}
        >
          Manage session
        </a>
      ) : null}
    </li>
  );
}

function getDayCounts(items: readonly CalendarDayItem[]): {
  schedule: number;
  events: number;
  sessions: number;
} {
  return items.reduce(
    (counts, item) => {
      if (item.sourceType === 'schedule-block') counts.schedule += 1;
      else if (item.sourceType === 'calendar-event') counts.events += 1;
      else counts.sessions += 1;
      return counts;
    },
    { schedule: 0, events: 0, sessions: 0 },
  );
}

function selectDayHighlights(items: readonly CalendarDayItem[]): CalendarDayItem[] {
  const dated = items.filter((item) => item.sourceType !== 'schedule-block');
  const recurring = items.filter((item) => item.sourceType === 'schedule-block');
  return [...dated, ...recurring].slice(0, 3);
}

function MobileCalendarDay({
  day,
  scheduleHierarchy,
}: {
  day: CalendarDayReadModel;
  scheduleHierarchy: ReadonlyMap<string, ScheduleBlockHierarchyMetadata>;
}) {
  const counts = getDayCounts(day.items);
  const highlights = selectDayHighlights(day.items);

  return (
    <li className={`${styles.mobileDay} ${day.isToday ? styles.today : ''}`}>
      <article
        aria-label={`${day.label}, ${day.items.length} item${day.items.length === 1 ? '' : 's'}`}
      >
        <header className={styles.mobileDayHeader}>
          <div>
            <span className={styles.mobileWeekday}>{day.weekdayLabel}</span>
            <time
              className={styles.mobileDateLabel}
              dateTime={day.date}
              aria-current={day.isToday ? 'date' : undefined}
            >
              {day.dayNumber}
            </time>
            {day.isToday ? <span className={styles.todayLabel}>Today</span> : null}
          </div>
          <a
            className={styles.dayAddButton}
            href={buildPlanningEntryHref({ date: day.date, returnTo: 'calendar' })}
            aria-label={`Add lesson plan to ${day.label}`}
          >
            <CalendarPlus aria-hidden="true" size={15} />
            <span>Plan</span>
          </a>
        </header>

        {day.items.length === 0 ? (
          <p className={styles.mobileNoItems}>No items</p>
        ) : (
          <>
            <div className={styles.mobileCounts} aria-label={`Item counts for ${day.label}`}>
              {counts.events > 0 ? <span>{counts.events} events</span> : null}
              {counts.sessions > 0 ? <span>{counts.sessions} sessions</span> : null}
              {counts.schedule > 0 ? <span>{counts.schedule} schedule</span> : null}
            </div>
            <ul className={styles.mobileHighlights} aria-label={`Highlights for ${day.label}`}>
              {highlights.map((item) => (
                <li key={item.occurrenceId}>
                  <span>{getItemTypeLabel(item)}</span>
                  <strong>{item.title}</strong>
                  <time>{item.timeLabel}</time>
                </li>
              ))}
            </ul>
            <details className={styles.dayDetails}>
              <summary>View all {day.items.length} and manage</summary>
              <ul className={`${styles.itemList} ${styles.mobileItemList}`}>
                {day.items.map((item) => (
                  <CalendarItemCard
                    key={item.occurrenceId}
                    item={item}
                    date={day.date}
                    hierarchy={
                      item.sourceType === 'schedule-block'
                        ? scheduleHierarchy.get(item.sourceRecordId)
                        : undefined
                    }
                  />
                ))}
              </ul>
            </details>
          </>
        )}

        <a
          className={styles.viewInWeek}
          href={buildWeekHref({ date: day.date, view: 'everything' })}
        >
          View in Week
        </a>
      </article>
    </li>
  );
}

export function CalendarRoute() {
  const { date, setDate } = useDateSearchParam();
  const compactCalendar = useCompactCalendar();
  const monthRange = useMemo(() => getCalendarMonthRange(date), [date]);
  const state = useWorkspaceReadModel({
    startDate: monthRange.gridStartDate,
    endDate: monthRange.gridEndDate,
  });
  const scheduleExceptions = useScheduleExceptionsForRange(
    monthRange.gridStartDate,
    monthRange.gridEndDate,
  );
  const planningState = useWeekPlanningReadModel({
    startDate: monthRange.gridStartDate,
    endDate: monthRange.gridEndDate,
  });
  const scheduleHierarchy = useMemo<ReadonlyMap<string, ScheduleBlockHierarchyMetadata>>(
    () =>
      state.status === 'ready'
        ? buildScheduleBlockHierarchyMetadata(state.data.scheduleBlocks)
        : new Map<string, ScheduleBlockHierarchyMetadata>(),
    [state],
  );

  const calendar = useMemo(
    () =>
      state.status === 'ready' && planningState.status === 'ready'
        ? buildCalendarMonthReadModel(
            date,
            state.data.scheduleBlocks,
            state.data.calendarEvents,
            todayLocalDate(),
            scheduleExceptions ?? [],
            planningState.data.lessonPlans,
            planningState.data.sessionOccurrences,
          )
        : null,
    [date, planningState, scheduleExceptions, state],
  );

  const previousMonthDate = shiftCalendarMonth(date, -1);
  const nextMonthDate = shiftCalendarMonth(date, 1);
  const previousMonthLabel = getCalendarMonthRange(previousMonthDate).label;
  const nextMonthLabel = getCalendarMonthRange(nextMonthDate).label;
  const currentMonthDays = calendar?.days.filter((day) => day.inCurrentMonth) ?? [];

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Workspace</p>
          <h1 className="page-title">
            Calendar <span className={styles.monthLabel}>{monthRange.label}</span>
          </h1>
          {calendar ? (
            <p className={styles.summary} aria-live="polite">
              {calendar.sourceScheduleBlockCount} schedule block
              {calendar.sourceScheduleBlockCount === 1 ? '' : 's'} ·{' '}
              {calendar.sourceCalendarEventCount} dated event
              {calendar.sourceCalendarEventCount === 1 ? '' : 's'} ·{' '}
              {calendar.sourceSessionOccurrenceCount} session
              {calendar.sourceSessionOccurrenceCount === 1 ? '' : 's'} · {calendar.visibleItemCount}{' '}
              visible occurrence
              {calendar.visibleItemCount === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>

        <nav className={styles.navigation} aria-label="Calendar month navigation">
          <button
            className="button"
            type="button"
            aria-label={`Previous month, ${previousMonthLabel}`}
            onClick={() => setDate(previousMonthDate)}
          >
            <ChevronLeft aria-hidden="true" size={18} /> Previous
          </button>
          <button className="button" type="button" onClick={() => setDate(todayLocalDate())}>
            This month
          </button>
          <button
            className="button"
            type="button"
            aria-label={`Next month, ${nextMonthLabel}`}
            onClick={() => setDate(nextMonthDate)}
          >
            Next <ChevronRight aria-hidden="true" size={18} />
          </button>
          <a className="button" href={`#/schedule/edit?date=${date}`}>
            Manage schedule
          </a>
          <a
            className="button button-primary"
            href={`#/calendar/edit?date=${date}`}
            aria-label="Manage events"
          >
            <CalendarDays aria-hidden="true" size={18} /> Events
          </a>
        </nav>
      </header>

      <section className={`card ${styles.legend}`} aria-label="Calendar item legend">
        <div>
          <span className={`${styles.legendMarker} ${styles.scheduleMarker}`} aria-hidden="true" />
          Recurring schedule
        </div>
        <div>
          <span className={`${styles.legendMarker} ${styles.eventMarker}`} aria-hidden="true" />
          Dated event
        </div>
        <div>
          <span className={`${styles.legendMarker} ${styles.sessionMarker}`} aria-hidden="true" />
          Learner session
        </div>
        <p>All-day items appear first. Weeks run Monday through Sunday.</p>
      </section>

      {state.status === 'loading' || planningState.status === 'loading' ? (
        <div className={`card ${styles.statePanel}`} role="status">
          <CalendarDays aria-hidden="true" size={24} />
          <p>Loading calendar…</p>
        </div>
      ) : null}

      {state.status === 'error' || planningState.status === 'error' ? (
        <div className={`card ${styles.errorPanel}`} role="alert">
          <h2>Calendar could not be loaded</h2>
          <p>
            {state.status === 'error'
              ? state.message
              : planningState.status === 'error'
                ? planningState.message
                : 'Planning data could not be loaded.'}
          </p>
        </div>
      ) : null}

      {state.status === 'ready' && planningState.status === 'ready' && calendar ? (
        <>
          {calendar.visibleItemCount === 0 ? (
            <div className={`card ${styles.emptyPanel}`} role="status">
              <CalendarDays aria-hidden="true" size={26} />
              <div>
                <h2>No calendar items in {calendar.range.label}</h2>
                <p>Schedule blocks, dated events, and learner sessions will appear here.</p>
              </div>
            </div>
          ) : null}

          {state.data.quarantineCount > 0 ? (
            <p className={styles.quarantineNote}>
              Some imported records need review and are not shown here.
            </p>
          ) : null}

          {compactCalendar ? (
            <section
              className={styles.mobileCalendar}
              aria-label={`${calendar.range.label} calendar`}
            >
              <ol className={styles.mobileMonthList}>
                {currentMonthDays.map((day) => (
                  <MobileCalendarDay
                    key={day.date}
                    day={day}
                    scheduleHierarchy={scheduleHierarchy}
                  />
                ))}
              </ol>
            </section>
          ) : (
            <section
              className={`card ${styles.calendarCard}`}
              aria-label={`${calendar.range.label} calendar`}
            >
              <div className={styles.weekdayRow} aria-hidden="true">
                {CALENDAR_WEEKDAY_LABELS.map((weekday) => (
                  <div key={weekday}>{weekday}</div>
                ))}
              </div>

              <ol className={styles.monthGrid}>
                {calendar.days.map((day) => (
                  <li
                    key={day.date}
                    className={`${styles.day} ${
                      day.inCurrentMonth ? styles.currentMonthDay : styles.adjacentMonthDay
                    } ${day.isToday ? styles.today : ''}`}
                  >
                    <article
                      aria-label={`${day.label}, ${day.items.length} item${day.items.length === 1 ? '' : 's'}`}
                    >
                      <header className={styles.dayHeader}>
                        <time
                          className={styles.dayNumber}
                          dateTime={day.date}
                          aria-current={day.isToday ? 'date' : undefined}
                        >
                          {day.dayNumber}
                        </time>
                        {day.isToday ? <span className={styles.todayLabel}>Today</span> : null}
                        <a
                          className={styles.dayAddButton}
                          href={buildPlanningEntryHref({ date: day.date, returnTo: 'calendar' })}
                          aria-label={`Add lesson plan to ${day.label}`}
                        >
                          <CalendarPlus aria-hidden="true" size={14} />
                          <span>Plan</span>
                        </a>
                      </header>

                      {day.items.length > 0 ? (
                        <ul className={styles.itemList} aria-label={`Items for ${day.label}`}>
                          {day.items.map((item) => (
                            <CalendarItemCard
                              key={item.occurrenceId}
                              item={item}
                              date={day.date}
                              hierarchy={
                                item.sourceType === 'schedule-block'
                                  ? scheduleHierarchy.get(item.sourceRecordId)
                                  : undefined
                              }
                            />
                          ))}
                        </ul>
                      ) : (
                        <p className={styles.noItems}>No items</p>
                      )}
                    </article>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      ) : null}
    </section>
  );
}

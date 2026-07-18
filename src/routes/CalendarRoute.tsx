import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { buildPlanningEntryHref } from '@/features/planning/planningNavigation';
import {
  buildScheduleBlockHierarchyMetadata,
  type ScheduleBlockHierarchyMetadata,
} from '@/features/editing/scheduleBlockHierarchy';

import type { CalendarDayItem } from '@/features/calendar/calendarReadModel';
import {
  CALENDAR_WEEKDAY_LABELS,
  buildCalendarMonthReadModel,
  getCalendarMonthRange,
  shiftCalendarMonth,
} from '@/features/calendar/calendarReadModel';
import { useScheduleExceptionsForRange } from '@/features/scheduleExceptions/useScheduleExceptionsForRange';
import { useWeekPlanningReadModel } from '@/features/week/useWeekPlanningReadModel';
import { useWorkspaceReadModel } from '@/features/workspace/useWorkspaceReadModel';
import { todayLocalDate } from '@/shared/dates/localDate';
import { useDateSearchParam } from '@/shared/dates/useDateSearchParam';

import styles from './CalendarRoute.module.css';

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

export function CalendarRoute() {
  const { date, setDate } = useDateSearchParam();
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
          <a className="button button-primary" href={`#/calendar/edit?date=${date}`}>
            <CalendarDays aria-hidden="true" size={18} /> Manage events
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
        <p>All-day events are shown before timed items. Weeks run Monday through Sunday.</p>
      </section>

      {state.status === 'loading' || planningState.status === 'loading' ? (
        <div className={`card ${styles.statePanel}`} role="status">
          <CalendarDays aria-hidden="true" size={24} />
          <p>Loading Calendar from the v20 database…</p>
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
                <p>
                  Migrated schedule blocks, dated events, and learner sessions will appear here when
                  they overlap this month.
                </p>
              </div>
            </div>
          ) : null}

          {state.data.quarantineCount > 0 ? (
            <p className={styles.quarantineNote}>
              Quarantined imports remain isolated and are not shown in this calendar.
            </p>
          ) : null}

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
                      <span className={styles.mobileWeekday}>{day.weekdayLabel}</span>
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
                        <Plus aria-hidden="true" size={16} />
                      </a>
                    </header>

                    {day.items.length > 0 ? (
                      <ul className={styles.itemList} aria-label={`Items for ${day.label}`}>
                        {day.items.map((item) => (
                          <li
                            key={item.occurrenceId}
                            className={`${getItemClassName(item)} ${
                              item.sourceType === 'schedule-block' &&
                              scheduleHierarchy.get(item.sourceRecordId)?.visualDepth
                                ? styles.hierarchyChild
                                : ''
                            } ${
                              item.sourceType === 'schedule-block' &&
                              (scheduleHierarchy.get(item.sourceRecordId)?.directChildCount ?? 0) >
                                0
                                ? styles.hierarchyParent
                                : ''
                            }`}
                            data-calendar-item={item.occurrenceId}
                            data-schedule-id={
                              item.sourceType === 'schedule-block' ? item.sourceRecordId : undefined
                            }
                            data-schedule-depth={
                              item.sourceType === 'schedule-block'
                                ? scheduleHierarchy.get(item.sourceRecordId)?.visualDepth
                                : undefined
                            }
                            data-parent-id={
                              item.sourceType === 'schedule-block'
                                ? scheduleHierarchy.get(item.sourceRecordId)?.parentId
                                : undefined
                            }
                            data-child-count={
                              item.sourceType === 'schedule-block'
                                ? scheduleHierarchy.get(item.sourceRecordId)?.directChildCount
                                : undefined
                            }
                            data-group-tone={
                              item.sourceType === 'schedule-block'
                                ? scheduleHierarchy.get(item.sourceRecordId)?.groupTone
                                : undefined
                            }
                          >
                            <div className={styles.itemMeta}>
                              <span>{getItemTypeLabel(item)}</span>
                              {item.deliveryState ? <span>{item.deliveryState}</span> : null}
                              <time>{item.timeLabel}</time>
                            </div>
                            <p className={styles.itemTitle}>{item.title}</p>
                            {item.parentTitle ? (
                              <p className={styles.itemContext}>Part of {item.parentTitle}</p>
                            ) : null}
                            {item.category ? (
                              <p className={styles.itemCategory}>{item.category}</p>
                            ) : null}
                            {item.sourceType === 'schedule-block' ? (
                              <a
                                className={styles.occurrenceEdit}
                                href={`#/schedule/occurrence/edit?block=${encodeURIComponent(item.sourceRecordId)}&date=${day.date}&return=calendar`}
                                aria-label={`Edit ${item.title} on ${day.date}`}
                              >
                                Edit occurrence
                              </a>
                            ) : null}
                            {item.sourceType === 'session-occurrence' ? (
                              <a
                                className={styles.occurrenceEdit}
                                href={`#/planning/session?session=${encodeURIComponent(item.sourceRecordId)}&date=${day.date}&return=calendar`}
                                aria-label={`Manage ${item.title} session`}
                              >
                                Manage session
                              </a>
                            ) : null}
                          </li>
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
        </>
      ) : null}
    </section>
  );
}

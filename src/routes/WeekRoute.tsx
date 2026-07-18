import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, type ChangeEvent, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useUiStore } from '@/app/uiStore';
import { buildPlanningEntryHref } from '@/features/planning/planningNavigation';
import {
  buildScheduleBlockHierarchyMetadata,
  type ScheduleBlockHierarchyMetadata,
} from '@/features/editing/scheduleBlockHierarchy';
import { parseWeekViewQuery, toWeekViewQuery } from '@/features/week/weekNavigation';
import type { WeekDayItem, WeekViewFilter } from '@/features/week/weekReadModel';
import { buildWeekReadModel, getWeekRange, shiftWeek } from '@/features/week/weekReadModel';
import { useScheduleExceptionsForRange } from '@/features/scheduleExceptions/useScheduleExceptionsForRange';
import { useWeekPlanningReadModel } from '@/features/week/useWeekPlanningReadModel';
import { useWorkspaceReadModel } from '@/features/workspace/useWorkspaceReadModel';
import { todayLocalDate } from '@/shared/dates/localDate';
import { useDateSearchParam } from '@/shared/dates/useDateSearchParam';

import styles from './WeekRoute.module.css';

const WEEK_VIEW_LABELS: Record<WeekViewFilter, string> = {
  teaching: 'Schedule',
  calendar: 'Events',
  personal: 'Personal',
  everything: 'Everything',
};

function getItemTypeLabel(item: WeekDayItem): string {
  if (item.sourceType === 'session-occurrence') return 'Session';
  if (item.sourceType === 'calendar-event') return 'Event';
  if (item.kind === 'container') return 'Schedule group';
  if (item.kind === 'routine') return 'Routine';
  if (item.kind === 'transition') return 'Transition';
  return 'Schedule';
}

function getItemClassName(item: WeekDayItem, focused: boolean): string {
  const classes = [styles.item!];
  if (item.sourceType === 'session-occurrence') classes.push(styles.sessionItem!);
  else if (item.sourceType === 'calendar-event') classes.push(styles.calendarEvent!);
  else classes.push(styles.scheduleBlock!);
  if (item.kind === 'container') classes.push(styles.containerItem!);
  if (item.spanPosition !== 'single') classes.push(styles.spanningItem!);
  if (focused) classes.push(styles.focusedItem!);
  return classes.join(' ');
}

function itemCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'item' : 'items'}`;
}

function childCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'child' : 'children'}`;
}

export function WeekRoute() {
  const { date } = useDateSearchParam();
  const [searchParams, setSearchParams] = useSearchParams();
  const showWeekends = useUiStore((state) => state.showWeekends);
  const setShowWeekends = useUiStore((state) => state.setShowWeekends);
  const storedWeekView = useUiStore((state) => state.weekView);
  const setWeekView = useUiStore((state) => state.setWeekView);
  const queryWeekView = parseWeekViewQuery(searchParams.get('view'));
  const weekView = queryWeekView ?? storedWeekView;
  const focusId = searchParams.get('focus');
  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  const handledFocusKeyRef = useRef<string | null>(null);

  const range = useMemo(() => getWeekRange(date), [date]);
  const previousRange = useMemo(() => getWeekRange(shiftWeek(date, -1)), [date]);
  const nextRange = useMemo(() => getWeekRange(shiftWeek(date, 1)), [date]);
  const state = useWorkspaceReadModel({
    startDate: range.mondayDate,
    endDate: range.sundayDate,
  });
  const planningState = useWeekPlanningReadModel({
    startDate: range.mondayDate,
    endDate: range.sundayDate,
  });
  const scheduleExceptions = useScheduleExceptionsForRange(range.mondayDate, range.sundayDate);
  const week = useMemo(
    () =>
      state.status === 'ready' && planningState.status === 'ready'
        ? buildWeekReadModel(
            date,
            state.data.scheduleBlocks,
            state.data.calendarEvents,
            weekView,
            todayLocalDate(),
            planningState.data.lessonPlans,
            planningState.data.sessionOccurrences,
            scheduleExceptions ?? [],
          )
        : null,
    [date, planningState, scheduleExceptions, state, weekView],
  );
  const scheduleHierarchy = useMemo<ReadonlyMap<string, ScheduleBlockHierarchyMetadata>>(
    () =>
      state.status === 'ready'
        ? buildScheduleBlockHierarchyMetadata(state.data.scheduleBlocks)
        : new Map<string, ScheduleBlockHierarchyMetadata>(),
    [state],
  );
  const visibleDays = week ? (showWeekends ? week.days : week.days.slice(0, 5)) : [];
  const errorMessage =
    state.status === 'error'
      ? state.message
      : planningState.status === 'error'
        ? planningState.message
        : null;
  const loading = state.status === 'loading' || planningState.status === 'loading';

  useEffect(() => {
    if (queryWeekView && queryWeekView !== storedWeekView) {
      setWeekView(queryWeekView);
    }
  }, [queryWeekView, setWeekView, storedWeekView]);

  useEffect(() => {
    if (!focusId || !week || showWeekends) return;
    const focusedDayIndex = week.days.findIndex((day) =>
      day.items.some((item) => item.occurrenceId === focusId),
    );
    if (focusedDayIndex >= 5) setShowWeekends(true);
  }, [focusId, setShowWeekends, showWeekends, week]);

  useEffect(() => {
    if (!focusId) {
      handledFocusKeyRef.current = null;
      return;
    }
    if (!week) return;

    const focusKey = `${date}:${focusId}`;
    if (handledFocusKeyRef.current === focusKey) return;

    const frame = window.requestAnimationFrame(() => {
      const target = itemRefs.current.get(focusId);
      if (!target) return;
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
      target.focus({ preventScroll: true });
      handledFocusKeyRef.current = focusKey;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [date, focusId, showWeekends, week]);

  function navigateToDate(nextDate: string): void {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('date', nextDate);
    nextParams.delete('focus');
    setSearchParams(nextParams);
  }

  function changeView(event: ChangeEvent<HTMLSelectElement>): void {
    const nextView = event.target.value as WeekViewFilter;
    setWeekView(nextView);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('view', toWeekViewQuery(nextView));
    nextParams.delete('focus');
    setSearchParams(nextParams);
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Workspace</p>
          <h1 className="page-title">
            Week <span className={styles.range}>{range.label}</span>
          </h1>
          {week ? (
            <p className={styles.summary}>
              {week.sourceScheduleBlockCount} schedule block
              {week.sourceScheduleBlockCount === 1 ? '' : 's'} · {week.sourceCalendarEventCount}{' '}
              dated event
              {week.sourceCalendarEventCount === 1 ? '' : 's'} · {week.sourceSessionOccurrenceCount}{' '}
              session
              {week.sourceSessionOccurrenceCount === 1 ? '' : 's'} · {week.visibleItemCount} visible{' '}
              {week.visibleItemCount === 1 ? 'item' : 'items'} in {WEEK_VIEW_LABELS[weekView]}
            </p>
          ) : null}
        </div>

        <div className={styles.navigation}>
          <button
            className="button"
            type="button"
            aria-label={`Previous week, ${previousRange.label}`}
            onClick={() => navigateToDate(previousRange.mondayDate)}
          >
            <ChevronLeft size={18} /> Previous
          </button>
          <button className="button" type="button" onClick={() => navigateToDate(todayLocalDate())}>
            This week
          </button>
          <button
            className="button"
            type="button"
            aria-label={`Next week, ${nextRange.label}`}
            onClick={() => navigateToDate(nextRange.mondayDate)}
          >
            Next <ChevronRight size={18} />
          </button>
          <a className="button button-primary" href={`#/schedule/edit?date=${date}`}>
            Manage schedule
          </a>
        </div>
      </header>

      <div className={`card ${styles.controls}`}>
        <label>
          <span>View</span>
          <select className="select" value={weekView} onChange={changeView}>
            <option value="teaching">Schedule</option>
            <option value="calendar">Events</option>
            <option value="personal">Personal</option>
            <option value="everything">Everything</option>
          </select>
        </label>

        <p className={styles.filterHelp}>
          Schedule shows recurring blocks. Events and Personal show dated events. Everything also
          includes learner sessions.
        </p>

        <label className={styles.toggleLabel}>
          <input
            type="checkbox"
            checked={showWeekends}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setShowWeekends(event.target.checked)
            }
          />
          <span className={styles.toggleTrack} aria-hidden="true" />
          Weekends
        </label>
      </div>

      {loading ? (
        <div className={`card ${styles.statePanel}`} role="status">
          <CalendarDays size={22} aria-hidden="true" />
          <p>Loading this week…</p>
        </div>
      ) : null}

      {errorMessage ? (
        <div className={`card ${styles.errorPanel}`} role="alert">
          <CalendarDays size={22} aria-hidden="true" />
          <div>
            <h2>Week could not be loaded</h2>
            <p>{errorMessage}</p>
          </div>
        </div>
      ) : null}

      {state.status === 'ready' && planningState.status === 'ready' && week ? (
        <>
          {week.hiddenDuplicateCount > 0 ? (
            <p className={styles.duplicateNote}>
              {week.hiddenDuplicateCount} exact dated duplicate
              {week.hiddenDuplicateCount === 1 ? '' : 's'} suppressed in this view.
            </p>
          ) : null}

          {state.data.quarantineCount > 0 ? (
            <p className={styles.quarantineNote}>
              Quarantined imports remain isolated and are not shown in this week.
            </p>
          ) : null}

          <div
            className={styles.weekGrid}
            role="region"
            aria-label={range.ariaLabel}
            tabIndex={0}
            style={{ '--day-count': visibleDays.length } as CSSProperties}
          >
            {visibleDays.map((day) => (
              <article
                key={day.date}
                className={`card ${styles.dayColumn} ${day.isToday ? styles.today : ''}`}
                data-date={day.date}
                aria-label={`${day.label}, ${itemCountLabel(day.items.length)}`}
              >
                <header className={styles.dayHeader}>
                  <div>
                    <div className={styles.dayTitleLine}>
                      <h2>{day.weekdayLabel}</h2>
                      {day.isToday ? <span className={styles.todayLabel}>Today</span> : null}
                    </div>
                    <p>{day.shortDateLabel}</p>
                  </div>

                  <a
                    className={styles.addButton}
                    href={buildPlanningEntryHref({ date: day.date, returnTo: 'week' })}
                    aria-label={`Add lesson plan to ${day.label}`}
                  >
                    <Plus aria-hidden="true" size={21} />
                  </a>
                </header>

                {day.items.length > 0 ? (
                  <ul className={styles.itemList} aria-label={`Items for ${day.label}`}>
                    {day.items.map((item) => {
                      const focused = item.occurrenceId === focusId;
                      const hierarchy =
                        item.sourceType === 'schedule-block'
                          ? scheduleHierarchy.get(item.sourceRecordId)
                          : undefined;
                      return (
                        <li
                          key={item.occurrenceId}
                          ref={(node: HTMLLIElement | null) => {
                            if (node) itemRefs.current.set(item.occurrenceId, node);
                            else itemRefs.current.delete(item.occurrenceId);
                          }}
                          className={`${getItemClassName(item, focused)} ${
                            hierarchy?.visualDepth ? styles.hierarchyChild : ''
                          } ${
                            hierarchy && hierarchy.directChildCount > 0
                              ? styles.hierarchyParent
                              : ''
                          }`}
                          aria-current={focused ? 'true' : undefined}
                          tabIndex={focused ? -1 : undefined}
                          data-week-item={item.occurrenceId}
                          data-schedule-id={
                            item.sourceType === 'schedule-block' ? item.sourceRecordId : undefined
                          }
                          data-schedule-depth={hierarchy?.visualDepth}
                          data-parent-id={hierarchy?.parentId}
                          data-child-count={hierarchy?.directChildCount}
                          data-group-tone={hierarchy?.groupTone}
                        >
                          <div className={styles.itemMeta}>
                            <span>{getItemTypeLabel(item)}</span>
                            {item.deliveryState ? (
                              <span className={styles.deliveryState}>{item.deliveryState}</span>
                            ) : null}
                          </div>
                          <time className={styles.itemTime} title={item.timeLabel} data-week-time>
                            {item.timeLabel}
                          </time>
                          <p className={styles.itemTitle}>{item.title}</p>
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
                          {item.sourceType === 'schedule-block' ? (
                            <a
                              className={styles.occurrenceEdit}
                              href={`#/schedule/occurrence/edit?block=${encodeURIComponent(item.sourceRecordId)}&date=${day.date}&return=week`}
                              aria-label={`Edit ${item.title} on ${day.date}`}
                            >
                              Edit occurrence
                            </a>
                          ) : null}
                          {item.sourceType === 'session-occurrence' ? (
                            <a
                              className={styles.occurrenceEdit}
                              href={`#/planning/session?session=${encodeURIComponent(item.sourceRecordId)}&date=${day.date}&return=week`}
                              aria-label={`Manage ${item.title} session`}
                            >
                              Manage session
                            </a>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className={styles.dayEmpty}>
                    <p>No items in {WEEK_VIEW_LABELS[weekView]}.</p>
                    <span>Change the view to compare schedule, events, and sessions.</span>
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

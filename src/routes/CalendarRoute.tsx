import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';

import type { CalendarDayItem, CalendarDayReadModel } from '@/features/calendar/calendarReadModel';
import {
  CALENDAR_WEEKDAY_LABELS,
  buildCalendarMonthReadModel,
  getCalendarMonthRange,
  shiftCalendarMonth,
} from '@/features/calendar/calendarReadModel';
import {
  buildCalendarWeekPresentation,
  splitCalendarDayItems,
  type CalendarWeekPresentation,
} from '@/features/calendar/calendarPresentation';
import {
  buildScheduleBlockHierarchyMetadata,
  type ScheduleBlockHierarchyMetadata,
} from '@/features/editing/scheduleBlockHierarchy';
import { buildPlanningEntryHref } from '@/features/planning/planningNavigation';
import { useScheduleExceptionsForRange } from '@/features/scheduleExceptions/useScheduleExceptionsForRange';
import { useActiveSchoolYear } from '@/features/schoolYears/useActiveSchoolYear';
import { useWeekPlanningReadModel } from '@/features/week/useWeekPlanningReadModel';
import { buildWeekHref } from '@/features/week/weekNavigation';
import { useWorkspaceReadModel } from '@/features/workspace/useWorkspaceReadModel';
import { todayLocalDate } from '@/shared/dates/localDate';
import { useDateSearchParam } from '@/shared/dates/useDateSearchParam';

import styles from './CalendarRoute.module.css';

const compactCalendarQuery = '(max-width: 900px)';
const desktopDatedItemLimit = 2;
const mobileDatedHighlightLimit = 3;

function getItemTypeLabel(item: CalendarDayItem): string {
  if (item.sourceType === 'session-occurrence') return 'Session';
  if (item.sourceType === 'calendar-event') return 'Event';
  if (item.scheduleExceptionAction === 'modify') return 'Schedule change';
  if (item.scheduleExceptionAction === 'add') return 'Added schedule';
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
  if (item.scheduleExceptionAction) classes.push(styles.scheduleAdjustment);
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

function CalendarItemList({
  items,
  date,
  scheduleHierarchy,
  className = '',
  ariaLabel,
}: {
  items: readonly CalendarDayItem[];
  date: string;
  scheduleHierarchy: ReadonlyMap<string, ScheduleBlockHierarchyMetadata>;
  className?: string;
  ariaLabel: string;
}) {
  return (
    <ul className={`${styles.itemList} ${className}`} aria-label={ariaLabel}>
      {items.map((item) => (
        <CalendarItemCard
          key={item.occurrenceId}
          item={item}
          date={date}
          hierarchy={
            item.sourceType === 'schedule-block'
              ? scheduleHierarchy.get(item.sourceRecordId)
              : undefined
          }
        />
      ))}
    </ul>
  );
}

function CalendarItemCounts({
  day,
  scheduleCount,
  eventCount,
  sessionCount,
}: {
  day: CalendarDayReadModel;
  scheduleCount: number;
  eventCount: number;
  sessionCount: number;
}) {
  return (
    <div className={styles.mobileCounts} aria-label={`Item counts for ${day.label}`}>
      {eventCount > 0 ? <span>{eventCount} events</span> : null}
      {sessionCount > 0 ? <span>{sessionCount} sessions</span> : null}
      {scheduleCount > 0 ? <span>{scheduleCount} schedule</span> : null}
    </div>
  );
}

function MobileCalendarDay({
  day,
  selected,
  scheduleHierarchy,
  onSelectDate,
}: {
  day: CalendarDayReadModel;
  selected: boolean;
  scheduleHierarchy: ReadonlyMap<string, ScheduleBlockHierarchyMetadata>;
  onSelectDate: (date: string) => void;
}) {
  const sections = splitCalendarDayItems(day.items, mobileDatedHighlightLimit);

  return (
    <li
      className={`${styles.mobileDay} ${day.isToday ? styles.today : ''} ${
        selected ? styles.selectedDay : ''
      }`}
      data-date={day.date}
    >
      <article
        aria-label={`${day.label}, ${day.items.length} item${day.items.length === 1 ? '' : 's'}`}
      >
        <header className={styles.mobileDayHeader}>
          <button
            className={styles.mobileDateButton}
            type="button"
            aria-label={`Select ${day.label}`}
            aria-pressed={selected}
            onClick={() => onSelectDate(day.date)}
          >
            <span className={styles.mobileWeekday}>{day.weekdayLabel}</span>
            <time
              className={styles.mobileDateLabel}
              dateTime={day.date}
              aria-current={day.isToday ? 'date' : undefined}
            >
              {day.dayNumber}
            </time>
            {day.isToday ? <span className={styles.todayLabel}>Today</span> : null}
            {selected ? <span className={styles.selectedLabel}>Selected</span> : null}
          </button>
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
          <p className={styles.mobileNoItems}>No events, sessions, or schedule</p>
        ) : (
          <>
            <CalendarItemCounts
              day={day}
              eventCount={sections.counts.events}
              sessionCount={sections.counts.sessions}
              scheduleCount={sections.counts.schedule}
            />

            {sections.highlightedDatedItems.length > 0 ? (
              <ul className={styles.mobileHighlights} aria-label={`Highlights for ${day.label}`}>
                {sections.highlightedDatedItems.map((item) => (
                  <li key={item.occurrenceId}>
                    <span>{getItemTypeLabel(item)}</span>
                    <strong>{item.title}</strong>
                    <time>{item.timeLabel}</time>
                  </li>
                ))}
              </ul>
            ) : null}

            {sections.datedItems.length > 0 ? (
              <details className={styles.dayDetails}>
                <summary>
                  Manage {sections.datedItems.length} dated item
                  {sections.datedItems.length === 1 ? '' : 's'}
                </summary>
                <CalendarItemList
                  items={sections.datedItems}
                  date={day.date}
                  scheduleHierarchy={scheduleHierarchy}
                  className={styles.mobileItemList}
                  ariaLabel={`Dated items for ${day.label}`}
                />
              </details>
            ) : null}

            {sections.scheduleItems.length > 0 ? (
              <details className={`${styles.dayDetails} ${styles.scheduleDetails}`}>
                <summary>
                  Show {sections.scheduleItems.length} recurring schedule block
                  {sections.scheduleItems.length === 1 ? '' : 's'}
                </summary>
                <CalendarItemList
                  items={sections.scheduleItems}
                  date={day.date}
                  scheduleHierarchy={scheduleHierarchy}
                  className={styles.mobileItemList}
                  ariaLabel={`Recurring schedule for ${day.label}`}
                />
              </details>
            ) : null}
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

function MobileCalendarWeek({
  week,
  expanded,
  targetRef,
  selectedDate,
  scheduleHierarchy,
  onToggle,
  onSelectDate,
}: {
  week: CalendarWeekPresentation;
  expanded: boolean;
  targetRef?: RefObject<HTMLDetailsElement | null>;
  selectedDate: string;
  scheduleHierarchy: ReadonlyMap<string, ScheduleBlockHierarchyMetadata>;
  onToggle: (weekId: string, open: boolean) => void;
  onSelectDate: (date: string) => void;
}) {
  const datedCount = week.counts.events + week.counts.sessions;

  return (
    <li className={styles.mobileWeek}>
      <details
        ref={targetRef}
        className={styles.mobileWeekDetails}
        open={expanded}
        data-week={week.id}
        onToggle={(event) => onToggle(week.id, event.currentTarget.open)}
      >
        <summary>
          <span className={styles.mobileWeekIdentity}>
            <strong>{week.label}</strong>
            <span>
              {week.containsToday ? 'Current week' : null}
              {week.containsToday && week.containsSelectedDate ? ' · ' : null}
              {week.containsSelectedDate ? 'Selected week' : null}
            </span>
          </span>
          <span className={styles.mobileWeekCounts}>
            {datedCount > 0 ? `${datedCount} dated` : 'No dated items'}
            {week.counts.schedule > 0 ? ` · ${week.counts.schedule} schedule` : ''}
          </span>
        </summary>
        <ol className={styles.mobileWeekDays}>
          {week.days.map((day) => (
            <MobileCalendarDay
              key={day.date}
              day={day}
              selected={day.date === selectedDate}
              scheduleHierarchy={scheduleHierarchy}
              onSelectDate={onSelectDate}
            />
          ))}
        </ol>
      </details>
    </li>
  );
}

function DesktopCalendarDay({
  day,
  selected,
  scheduleHierarchy,
  onSelectDate,
}: {
  day: CalendarDayReadModel;
  selected: boolean;
  scheduleHierarchy: ReadonlyMap<string, ScheduleBlockHierarchyMetadata>;
  onSelectDate: (date: string) => void;
}) {
  const sections = splitCalendarDayItems(day.items, desktopDatedItemLimit);

  return (
    <li
      className={`${styles.day} ${
        day.inCurrentMonth ? styles.currentMonthDay : styles.adjacentMonthDay
      } ${day.isToday ? styles.today : ''} ${selected ? styles.selectedDay : ''}`}
      data-date={day.date}
    >
      <article
        aria-label={`${day.label}, ${day.items.length} item${day.items.length === 1 ? '' : 's'}`}
      >
        <header className={styles.dayHeader}>
          <button
            className={styles.dayNumberButton}
            type="button"
            aria-label={`Select ${day.label}`}
            aria-pressed={selected}
            onClick={() => onSelectDate(day.date)}
          >
            <time
              className={styles.dayNumber}
              dateTime={day.date}
              aria-current={day.isToday ? 'date' : undefined}
            >
              {day.dayNumber}
            </time>
          </button>
          <span className={styles.dayStatus}>
            {day.isToday ? (
              <span className={styles.todayLabel}>Today</span>
            ) : selected ? (
              <span className={styles.selectedLabel}>Selected</span>
            ) : null}
          </span>
          <a
            className={styles.dayAddButton}
            href={buildPlanningEntryHref({ date: day.date, returnTo: 'calendar' })}
            aria-label={`Add lesson plan to ${day.label}`}
          >
            <CalendarPlus aria-hidden="true" size={14} />
            <span>Plan</span>
          </a>
        </header>

        {sections.highlightedDatedItems.length > 0 ? (
          <CalendarItemList
            items={sections.highlightedDatedItems}
            date={day.date}
            scheduleHierarchy={scheduleHierarchy}
            ariaLabel={`Dated highlights for ${day.label}`}
          />
        ) : null}

        {sections.hiddenDatedItems.length > 0 ? (
          <details className={styles.compactDetails}>
            <summary>
              + {sections.hiddenDatedItems.length} more dated item
              {sections.hiddenDatedItems.length === 1 ? '' : 's'}
            </summary>
            <CalendarItemList
              items={sections.hiddenDatedItems}
              date={day.date}
              scheduleHierarchy={scheduleHierarchy}
              className={styles.compactDetailsList}
              ariaLabel={`More dated items for ${day.label}`}
            />
          </details>
        ) : null}

        {sections.scheduleItems.length > 0 ? (
          <details className={`${styles.compactDetails} ${styles.scheduleDetails}`}>
            <summary>
              {sections.scheduleItems.length} recurring schedule block
              {sections.scheduleItems.length === 1 ? '' : 's'}
            </summary>
            <CalendarItemList
              items={sections.scheduleItems}
              date={day.date}
              scheduleHierarchy={scheduleHierarchy}
              className={styles.compactDetailsList}
              ariaLabel={`Recurring schedule for ${day.label}`}
            />
          </details>
        ) : null}

        {day.items.length === 0 ? <p className={styles.noItems}>No items</p> : null}
      </article>
    </li>
  );
}

export function CalendarRoute() {
  const { date, setDate } = useDateSearchParam();
  const compactCalendar = useCompactCalendar();
  const currentDate = todayLocalDate();
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

  const calendar = useMemo(
    () =>
      state.status === 'ready' && planningState.status === 'ready'
        ? buildCalendarMonthReadModel(
            date,
            state.data.scheduleBlocks,
            state.data.calendarEvents,
            currentDate,
            scheduleExceptions ?? [],
            planningState.data.lessonPlans,
            planningState.data.sessionOccurrences,
            schoolYearBoundary,
          )
        : null,
    [currentDate, date, planningState, scheduleExceptions, schoolYearBoundary, state],
  );

  const previousMonthDate = shiftCalendarMonth(date, -1);
  const nextMonthDate = shiftCalendarMonth(date, 1);
  const previousMonthLabel = getCalendarMonthRange(previousMonthDate).label;
  const nextMonthLabel = getCalendarMonthRange(nextMonthDate).label;
  const currentMonthDays = useMemo(
    () => calendar?.days.filter((day) => day.inCurrentMonth) ?? [],
    [calendar],
  );
  const mobileWeeks = useMemo(
    () => buildCalendarWeekPresentation(currentMonthDays, date, currentDate),
    [currentDate, currentMonthDays, date],
  );
  const targetWeekId =
    mobileWeeks.find((week) => week.containsSelectedDate)?.id ??
    mobileWeeks.find((week) => week.containsToday)?.id ??
    mobileWeeks[0]?.id;
  const calendarMonthLabel = calendar?.range.label;
  const [expandedWeekIds, setExpandedWeekIds] = useState<ReadonlySet<string>>(new Set());
  const targetWeekRef = useRef<HTMLDetailsElement>(null);
  const scrolledTargetWeekRef = useRef<string | null>(null);

  useEffect(() => {
    if (!targetWeekId) return;
    setExpandedWeekIds(new Set([targetWeekId]));
  }, [monthRange.label, targetWeekId]);

  useLayoutEffect(() => {
    if (
      !compactCalendar ||
      !targetWeekId ||
      !calendarMonthLabel ||
      !expandedWeekIds.has(targetWeekId) ||
      scrolledTargetWeekRef.current === targetWeekId
    ) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      targetWeekRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
      scrolledTargetWeekRef.current = targetWeekId;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [calendarMonthLabel, compactCalendar, expandedWeekIds, targetWeekId]);

  function toggleMobileWeek(weekId: string, open: boolean) {
    setExpandedWeekIds((current) => {
      const next = new Set(current);
      if (open) next.add(weekId);
      else next.delete(weekId);
      return next;
    });
  }

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
          <button className="button" type="button" onClick={() => setDate(currentDate)}>
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
        <p>Events and sessions stay visible. Recurring schedule remains available in summaries.</p>
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
                {mobileWeeks.map((week) => (
                  <MobileCalendarWeek
                    key={week.id}
                    week={week}
                    expanded={expandedWeekIds.has(week.id)}
                    targetRef={week.id === targetWeekId ? targetWeekRef : undefined}
                    selectedDate={date}
                    scheduleHierarchy={scheduleHierarchy}
                    onToggle={toggleMobileWeek}
                    onSelectDate={setDate}
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
                  <DesktopCalendarDay
                    key={day.date}
                    day={day}
                    selected={day.date === date}
                    scheduleHierarchy={scheduleHierarchy}
                    onSelectDate={setDate}
                  />
                ))}
              </ol>
            </section>
          )}
        </>
      ) : null}
    </section>
  );
}

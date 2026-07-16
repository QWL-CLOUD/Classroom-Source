import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';

import type { CalendarDayItem } from '@/features/calendar/calendarReadModel';
import {
  CALENDAR_WEEKDAY_LABELS,
  buildCalendarMonthReadModel,
  getCalendarMonthRange,
  shiftCalendarMonth,
} from '@/features/calendar/calendarReadModel';
import { useWorkspaceReadModel } from '@/features/workspace/useWorkspaceReadModel';
import { todayLocalDate } from '@/shared/dates/localDate';
import { useDateSearchParam } from '@/shared/dates/useDateSearchParam';

import styles from './CalendarRoute.module.css';

function getItemTypeLabel(item: CalendarDayItem): string {
  if (item.sourceType === 'calendar-event') return 'Event';
  if (item.kind === 'container') return 'Schedule group';
  if (item.kind === 'routine') return 'Routine';
  if (item.kind === 'transition') return 'Transition';
  return 'Schedule';
}

function getItemClassName(item: CalendarDayItem): string {
  const classes = [styles.item];
  classes.push(item.sourceType === 'calendar-event' ? styles.calendarEvent : styles.scheduleBlock);
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

  const calendar = useMemo(
    () =>
      state.status === 'ready'
        ? buildCalendarMonthReadModel(
            date,
            state.data.scheduleBlocks,
            state.data.calendarEvents,
            todayLocalDate(),
          )
        : null,
    [date, state],
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
              {calendar.sourceCalendarEventCount === 1 ? '' : 's'} · {calendar.visibleItemCount}{' '}
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
        <p>All-day events are shown before timed items. Weeks run Monday through Sunday.</p>
      </section>

      {state.status === 'loading' ? (
        <div className={`card ${styles.statePanel}`} role="status">
          <CalendarDays aria-hidden="true" size={24} />
          <p>Loading Calendar from the v20 database…</p>
        </div>
      ) : null}

      {state.status === 'error' ? (
        <div className={`card ${styles.errorPanel}`} role="alert">
          <h2>Calendar could not be loaded</h2>
          <p>{state.message}</p>
        </div>
      ) : null}

      {state.status === 'ready' && calendar ? (
        <>
          {calendar.visibleItemCount === 0 ? (
            <div className={`card ${styles.emptyPanel}`} role="status">
              <CalendarDays aria-hidden="true" size={26} />
              <div>
                <h2>No calendar items in {calendar.range.label}</h2>
                <p>
                  Migrated schedule blocks and dated events will appear here when they overlap this
                  month.
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
                    </header>

                    {day.items.length > 0 ? (
                      <ul className={styles.itemList} aria-label={`Items for ${day.label}`}>
                        {day.items.map((item) => (
                          <li key={item.occurrenceId} className={getItemClassName(item)}>
                            <div className={styles.itemMeta}>
                              <span>{getItemTypeLabel(item)}</span>
                              <time>{item.timeLabel}</time>
                            </div>
                            <p className={styles.itemTitle}>{item.title}</p>
                            {item.parentTitle ? (
                              <p className={styles.itemContext}>Part of {item.parentTitle}</p>
                            ) : null}
                            {item.category ? (
                              <p className={styles.itemCategory}>{item.category}</p>
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

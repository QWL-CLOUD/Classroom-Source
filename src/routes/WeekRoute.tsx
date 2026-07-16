import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useMemo, type ChangeEvent, type CSSProperties } from 'react';

import { useUiStore } from '@/app/uiStore';
import type { WeekDayItem, WeekViewFilter } from '@/features/week/weekReadModel';
import { buildWeekReadModel, getWeekRange, shiftWeek } from '@/features/week/weekReadModel';
import { useWorkspaceReadModel } from '@/features/workspace/useWorkspaceReadModel';
import { todayLocalDate } from '@/shared/dates/localDate';
import { useDateSearchParam } from '@/shared/dates/useDateSearchParam';

import styles from './WeekRoute.module.css';

const WEEK_VIEW_LABELS: Record<WeekViewFilter, string> = {
  teaching: 'Teaching',
  calendar: 'Calendar',
  personal: 'Personal Agenda',
  everything: 'Everything',
};

function getItemTypeLabel(item: WeekDayItem): string {
  if (item.sourceType === 'calendar-event') return 'Event';
  if (item.kind === 'container') return 'Schedule group';
  if (item.kind === 'routine') return 'Routine';
  if (item.kind === 'transition') return 'Transition';
  return 'Schedule';
}

function getItemClassName(item: WeekDayItem): string {
  const classes = [styles.item];
  classes.push(item.sourceType === 'calendar-event' ? styles.calendarEvent : styles.scheduleBlock);
  if (item.kind === 'container') classes.push(styles.containerItem);
  if (item.spanPosition !== 'single') classes.push(styles.spanningItem);
  return classes.join(' ');
}

function itemCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'item' : 'items'}`;
}

export function WeekRoute() {
  const { date, setDate } = useDateSearchParam();
  const showWeekends = useUiStore((state) => state.showWeekends);
  const setShowWeekends = useUiStore((state) => state.setShowWeekends);
  const weekView = useUiStore((state) => state.weekView);
  const setWeekView = useUiStore((state) => state.setWeekView);

  const range = useMemo(() => getWeekRange(date), [date]);
  const previousRange = useMemo(() => getWeekRange(shiftWeek(date, -1)), [date]);
  const nextRange = useMemo(() => getWeekRange(shiftWeek(date, 1)), [date]);
  const state = useWorkspaceReadModel({
    startDate: range.mondayDate,
    endDate: range.sundayDate,
  });
  const week = useMemo(
    () =>
      state.status === 'ready'
        ? buildWeekReadModel(
            date,
            state.data.scheduleBlocks,
            state.data.calendarEvents,
            weekView,
            todayLocalDate(),
          )
        : null,
    [date, state, weekView],
  );
  const visibleDays = week ? (showWeekends ? week.days : week.days.slice(0, 5)) : [];

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
              {week.sourceCalendarEventCount === 1 ? '' : 's'} · {week.visibleItemCount} visible{' '}
              {week.visibleItemCount === 1 ? 'item' : 'items'} in {WEEK_VIEW_LABELS[weekView]}
            </p>
          ) : null}
        </div>

        <div className={styles.navigation}>
          <button
            className="button"
            type="button"
            aria-label={`Previous week, ${previousRange.label}`}
            onClick={() => setDate(previousRange.mondayDate)}
          >
            <ChevronLeft size={18} /> Previous
          </button>
          <button className="button" type="button" onClick={() => setDate(todayLocalDate())}>
            This week
          </button>
          <button
            className="button"
            type="button"
            aria-label={`Next week, ${nextRange.label}`}
            onClick={() => setDate(nextRange.mondayDate)}
          >
            Next <ChevronRight size={18} />
          </button>
        </div>
      </header>

      <div className={`card ${styles.controls}`}>
        <label>
          <span>View</span>
          <select
            className="select"
            value={weekView}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              setWeekView(event.target.value as WeekViewFilter)
            }
          >
            <option value="teaching">Teaching</option>
            <option value="calendar">Calendar</option>
            <option value="personal">Personal Agenda</option>
            <option value="everything">Everything</option>
          </select>
        </label>

        <p className={styles.filterHelp}>
          Teaching shows recurring blocks. Calendar and Personal Agenda show dated events.
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

        <button className="button" type="button" disabled>
          Lesson templates · 0
        </button>
      </div>

      {state.status === 'loading' ? (
        <div className={`card ${styles.statePanel}`} role="status">
          <CalendarDays size={22} aria-hidden="true" />
          <p>Loading Week from the v20 database…</p>
        </div>
      ) : null}

      {state.status === 'error' ? (
        <div className={`card ${styles.errorPanel}`} role="alert">
          <CalendarDays size={22} aria-hidden="true" />
          <div>
            <h2>Week could not be loaded</h2>
            <p>{state.message}</p>
          </div>
        </div>
      ) : null}

      {state.status === 'ready' && week ? (
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
            tabIndex={0}
            aria-label={range.ariaLabel}
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

                  <button
                    className={styles.addButton}
                    type="button"
                    disabled
                    aria-label={`Add to ${day.label}`}
                  >
                    <Plus size={21} />
                  </button>
                </header>

                {day.items.length > 0 ? (
                  <ul className={styles.itemList} aria-label={`Items for ${day.label}`}>
                    {day.items.map((item) => (
                      <li key={item.occurrenceId} className={getItemClassName(item)}>
                        <div className={styles.itemMeta}>
                          <span>{getItemTypeLabel(item)}</span>
                          <span>{item.timeLabel}</span>
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
                  <div className={styles.dayEmpty}>
                    <p>No items in {WEEK_VIEW_LABELS[weekView]}.</p>
                    <span>Change the view to compare recurring blocks and dated events.</span>
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

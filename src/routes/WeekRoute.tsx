import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useUiStore } from '@/app/uiStore';
import {
  formatShortDate,
  getMonday,
  getWeekDates,
  shiftDays,
  todayLocalDate,
} from '@/shared/dates/localDate';
import { useDateSearchParam } from '@/shared/dates/useDateSearchParam';
import styles from './WeekRoute.module.css';

export function WeekRoute() {
  const { date, setDate } = useDateSearchParam();
  const showWeekends = useUiStore((state) => state.showWeekends);
  const setShowWeekends = useUiStore((state) => state.setShowWeekends);
  const weekView = useUiStore((state) => state.weekView);
  const setWeekView = useUiStore((state) => state.setWeekView);
  const monday = getMonday(date);
  const allDates = getWeekDates(monday);
  const visibleDates = showWeekends ? allDates : allDates.slice(0, 5);
  const sunday = allDates[6]!;

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Workspace</p>
          <h1 className="page-title">
            Week{' '}
            <span className={styles.range}>
              {formatShortDate(monday)} – {formatShortDate(sunday)}
            </span>
          </h1>
        </div>
        <div className={styles.navigation}>
          <button className="button" type="button" onClick={() => setDate(shiftDays(monday, -7))}>
            <ChevronLeft size={18} /> Previous
          </button>
          <button className="button" type="button" onClick={() => setDate(todayLocalDate())}>
            This week
          </button>
          <button className="button" type="button" onClick={() => setDate(shiftDays(monday, 7))}>
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
            onChange={(event) =>
              setWeekView(event.target.value as 'teaching' | 'calendar' | 'personal' | 'everything')
            }
          >
            <option value="teaching">Teaching</option>
            <option value="calendar">Calendar</option>
            <option value="personal">Personal Agenda</option>
            <option value="everything">Everything</option>
          </select>
        </label>
        <label className={styles.toggleLabel}>
          <input
            type="checkbox"
            checked={showWeekends}
            onChange={(event) => setShowWeekends(event.target.checked)}
          />
          <span className={styles.toggleTrack} aria-hidden="true" />
          Weekends
        </label>
        <button className="button" type="button" disabled>
          Lesson templates · 0
        </button>
      </div>

      <div
        className={styles.weekGrid}
        style={{ '--day-count': visibleDates.length } as React.CSSProperties}
      >
        {visibleDates.map((day) => (
          <article key={day} className={`card ${styles.dayColumn}`} data-date={day}>
            <header className={styles.dayHeader}>
              <div>
                <h2>{format(parseISO(day), 'EEEE')}</h2>
                <p>{format(parseISO(day), 'MMM d')}</p>
              </div>
              <button
                className={styles.addButton}
                type="button"
                disabled
                aria-label={`Add to ${day}`}
              >
                <Plus size={21} />
              </button>
            </header>
            <div className={styles.dayEmpty}>
              <p>No Schedule Blocks yet.</p>
              <span>Migration and the occurrence engine arrive next.</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

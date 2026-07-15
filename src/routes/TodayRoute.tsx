import { CalendarDays, Clock3, StickyNote } from 'lucide-react';
import { formatLongDate } from '@/shared/dates/localDate';
import { useDateSearchParam } from '@/shared/dates/useDateSearchParam';
import { TaskList } from '@/features/tasks/TaskList';
import styles from './TodayRoute.module.css';

export function TodayRoute() {
  const { date, setDate } = useDateSearchParam();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Today workspace</p>
          <h1 className="page-title">{greeting}, Alyssa.</h1>
          <p className="page-subtitle">Previewing {formatLongDate(date)}</p>
        </div>
        <label className={styles.datePicker}>
          <span className="sr-only">Selected date</span>
          <input
            className="input"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
      </header>

      <div className={styles.layout}>
        <div className={styles.leftColumn}>
          <article className={`card ${styles.panel}`}>
            <h2>To-do</h2>
            <TaskList dueDate={date} compact />
          </article>
          <article className={`card ${styles.panel} ${styles.warmPanel}`}>
            <h2>Reminders</h2>
            <p>No calendar reminders for this date.</p>
          </article>
          <article className={`card ${styles.panel}`}>
            <h2>Students to notice</h2>
            <p>No learner notices have been migrated yet.</p>
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

        <article className={styles.scheduleColumn}>
          <div className={styles.scheduleHeader}>
            <div>
              <p className="page-eyebrow">Today schedule</p>
              <h2>{formatLongDate(date)}</h2>
            </div>
            <button className="button button-primary" type="button" disabled>
              Open daily planning
            </button>
          </div>
          <div className={`card ${styles.scheduleEmpty}`}>
            <Clock3 size={32} />
            <h3>No schedule data in v20 yet</h3>
            <p>
              Phase 1 will generate this timeline from recurring Schedule Blocks and Session
              Occurrences. It will not copy the old page DOM.
            </p>
            <a className="button" href="#/migration">
              <CalendarDays size={17} /> Open migration preview
            </a>
          </div>
        </article>
      </div>
    </section>
  );
}

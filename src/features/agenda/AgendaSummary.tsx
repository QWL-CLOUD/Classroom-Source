import { CalendarRange } from 'lucide-react';

import { useAgendaReadModel } from './useAgendaReadModel';
import styles from './AgendaSummary.module.css';

export function AgendaSummary({ selectedDate }: { selectedDate: string }) {
  const agenda = useAgendaReadModel(selectedDate);

  return (
    <div className={styles.wrapper} role="region" aria-label="Personal Agenda summary">
      <div className={styles.heading}>
        <CalendarRange size={19} aria-hidden="true" />
        <h2>Personal Agenda</h2>
      </div>
      {!agenda ? (
        <p>Loading Agenda summary…</p>
      ) : (
        <>
          <div className={styles.counts} aria-label="Agenda counts">
            <span data-emphasis={agenda.summary.overdue > 0}>
              <strong>{agenda.summary.overdue}</strong> overdue
            </span>
            <span>
              <strong>{agenda.summary.today}</strong> today
            </span>
            <span>
              <strong>{agenda.summary.waiting}</strong> waiting
            </span>
          </div>
          <p>A live summary of original Tasks, Reminders, personal events, and learner support.</p>
        </>
      )}
      <a className="button button-quiet" href={`#/agenda?date=${selectedDate}`}>
        Open full Agenda
      </a>
    </div>
  );
}

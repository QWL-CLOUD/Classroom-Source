import { Bell, Clock3 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';

import { classroomDb } from '@/data/db/ClassroomDatabase';
import { lessonPlanSchema, reminderSchema } from '@/domain/models/entities';
import { formatLongDate } from '@/shared/dates/localDate';

import { reminderMutationService } from './reminderMutationService';
import {
  buildReminderListItems,
  selectActiveRemindersForDate,
  shiftReminderSchedule,
} from './reminderReadModel';
import styles from './TodayReminderList.module.css';

export function TodayReminderList({ selectedDate }: { selectedDate: string }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const data = useLiveQuery(async () => {
    const [reminderValues, tasks, sessions, lessonPlanValues, calendarEvents, learnerNotices] =
      await Promise.all([
        classroomDb.reminders.where('remindDate').equals(selectedDate).toArray(),
        classroomDb.tasks.toArray(),
        classroomDb.sessionOccurrences.toArray(),
        classroomDb.lessonPlans.toArray(),
        classroomDb.calendarEvents.toArray(),
        classroomDb.learnerNotices.toArray(),
      ]);
    const reminders = selectActiveRemindersForDate(
      reminderValues.map((value) => reminderSchema.parse(value)),
      selectedDate,
    );
    return buildReminderListItems(reminders, {
      tasks,
      sessions,
      lessonPlans: lessonPlanValues.map((value) => lessonPlanSchema.parse(value)),
      calendarEvents,
      learnerNotices,
    });
  }, [selectedDate]);
  const items = useMemo(() => data ?? [], [data]);

  async function run(id: string, action: () => Promise<unknown>): Promise<void> {
    if (busyId) return;
    setBusyId(id);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Reminder action failed.');
    } finally {
      setBusyId(null);
    }
  }

  if (data === undefined) return <p className={styles.message}>Loading reminders…</p>;

  return (
    <div className={styles.wrapper}>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className={styles.message}>No active reminders for this date.</p>
      ) : (
        <ul className={styles.list} aria-label={`Reminders for ${formatLongDate(selectedDate)}`}>
          {items.map((item) => (
            <li key={item.id}>
              <div className={styles.summary}>
                <Bell size={16} aria-hidden="true" />
                <div>
                  {item.sourceHref ? (
                    <a href={item.sourceHref}>{item.sourceTitle}</a>
                  ) : (
                    <strong>{item.sourceTitle}</strong>
                  )}
                  <span>{item.sourceTypeLabel}</span>
                  {item.note ? <p>{item.note}</p> : null}
                </div>
                <time>
                  <Clock3 size={14} aria-hidden="true" /> {item.timeLabel}
                </time>
              </div>
              <div className={styles.actions}>
                <button
                  className="button button-quiet"
                  type="button"
                  disabled={Boolean(busyId)}
                  onClick={() => void run(item.id, () => reminderMutationService.dismiss(item.id))}
                >
                  Dismiss
                </button>
                <button
                  className="button button-quiet"
                  type="button"
                  disabled={Boolean(busyId)}
                  onClick={() => {
                    const shifted = shiftReminderSchedule(item.remindDate, item.remindMinute, 10);
                    void run(item.id, () =>
                      reminderMutationService.snooze(item.id, {
                        ...shifted,
                        note: item.note,
                      }),
                    );
                  }}
                >
                  Snooze 10 min
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import {
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Hourglass,
  RotateCcw,
  Users,
} from 'lucide-react';
import { useState, type ChangeEvent } from 'react';

import type { AgendaItem, AgendaSectionId } from '@/features/agenda/agendaReadModel';
import { useAgendaReadModel } from '@/features/agenda/useAgendaReadModel';
import { learnerNoticeMutationService } from '@/features/learnerNotices/learnerNoticeMutationService';
import { reminderMutationService } from '@/features/reminders/reminderMutationService';
import { shiftReminderSchedule } from '@/features/reminders/reminderReadModel';
import { taskMutationService } from '@/features/tasks/taskMutationService';
import { formatLongDate, shiftDays, todayLocalDate } from '@/shared/dates/localDate';
import { useDateSearchParam } from '@/shared/dates/useDateSearchParam';

import styles from './AgendaRoute.module.css';

function sourceIcon(item: AgendaItem) {
  if (item.sourceType === 'reminder') return <Bell size={18} aria-hidden="true" />;
  if (item.sourceType === 'calendar-event') return <CalendarDays size={18} aria-hidden="true" />;
  if (item.sourceType === 'learner-notice') return <Users size={18} aria-hidden="true" />;
  if (item.taskStatus === 'waiting') return <Hourglass size={18} aria-hidden="true" />;
  return <Check size={18} aria-hidden="true" />;
}

function emptyMessage(section: AgendaSectionId): string {
  if (section === 'overdue') return 'Nothing overdue for this date.';
  if (section === 'today') return 'No Agenda items for this date.';
  if (section === 'upcoming') return 'No upcoming dated items.';
  if (section === 'waiting') return 'No Tasks are waiting.';
  return 'No unscheduled learner follow-up Tasks.';
}

export function AgendaRoute() {
  const { date, setDate } = useDateSearchParam();
  const agenda = useAgendaReadModel(date);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previousDate = shiftDays(date, -1);
  const nextDate = shiftDays(date, 1);
  const currentDate = todayLocalDate();

  async function run(item: AgendaItem, action: () => Promise<unknown>): Promise<void> {
    if (busyId) return;
    setBusyId(item.id);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Agenda action failed.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Workspace</p>
          <h1 className="page-title">Personal Agenda</h1>
          <p className="page-subtitle">
            One live view of Tasks, deadlines, Reminders, personal events, and active learner
            support. Every action updates the original record—Agenda never stores a duplicate.
          </p>
        </div>
        <div className={styles.dateToolbar} aria-label="Agenda date navigation">
          <button
            className="button button-icon"
            type="button"
            aria-label={`Previous day, ${formatLongDate(previousDate)}`}
            onClick={() => setDate(previousDate)}
          >
            <ChevronLeft size={18} />
          </button>
          <button className="button" type="button" onClick={() => setDate(currentDate)}>
            Today
          </button>
          <button
            className="button button-icon"
            type="button"
            aria-label={`Next day, ${formatLongDate(nextDate)}`}
            onClick={() => setDate(nextDate)}
          >
            <ChevronRight size={18} />
          </button>
          <label className={styles.datePicker}>
            <span className="sr-only">Selected Agenda date</span>
            <input
              className="input"
              type="date"
              value={date}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setDate(event.target.value)}
            />
          </label>
        </div>
      </header>

      <div className={styles.selectedDate}>
        <Clock3 size={18} aria-hidden="true" />
        <strong>{formatLongDate(date)}</strong>
        <span>is the reference date for Overdue, Today, and Upcoming.</span>
      </div>

      {!agenda ? (
        <div className={`card ${styles.loading}`} aria-live="polite">
          Loading Personal Agenda…
        </div>
      ) : (
        <>
          <div className={styles.metrics} aria-label="Agenda summary">
            <div className={styles.metric} data-emphasis={agenda.summary.overdue > 0}>
              <span>Overdue</span>
              <strong>{agenda.summary.overdue}</strong>
            </div>
            <div className={styles.metric}>
              <span>Today</span>
              <strong>{agenda.summary.today}</strong>
            </div>
            <div className={styles.metric}>
              <span>Upcoming</span>
              <strong>{agenda.summary.upcoming}</strong>
            </div>
            <div className={styles.metric}>
              <span>Waiting</span>
              <strong>{agenda.summary.waiting}</strong>
            </div>
            <div className={styles.metric}>
              <span>Unscheduled follow-up</span>
              <strong>{agenda.summary.unscheduledFollowUp}</strong>
            </div>
          </div>

          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}

          <div className={styles.sections}>
            {agenda.sections.map((section) => (
              <section
                key={section.id}
                className={`card ${styles.section}`}
                aria-labelledby={`agenda-${section.id}`}
              >
                <header className={styles.sectionHeader}>
                  <div>
                    <h2 id={`agenda-${section.id}`}>{section.label}</h2>
                    <p>{section.description}</p>
                  </div>
                  <span aria-label={`${section.items.length} items`}>{section.items.length}</span>
                </header>

                {section.items.length === 0 ? (
                  <p className={styles.empty}>{emptyMessage(section.id)}</p>
                ) : (
                  <ul className={styles.itemList} aria-label={`${section.label} Agenda items`}>
                    {section.items.map((item) => (
                      <li key={item.id} className={styles.item} data-source-type={item.sourceType}>
                        <div className={styles.itemIcon}>{sourceIcon(item)}</div>
                        <div className={styles.itemBody}>
                          <div className={styles.itemHeading}>
                            <a href={item.href}>{item.title}</a>
                            <span>{item.sourceLabel}</span>
                          </div>
                          <p className={styles.timing}>{item.timingLabel}</p>
                          {item.contextName ? <p>{item.contextName}</p> : null}
                          {item.detailLabel ? <p>{item.detailLabel}</p> : null}
                        </div>
                        <div className={styles.actions}>
                          {item.sourceType === 'task' && item.taskStatus === 'active' ? (
                            <button
                              className="button button-quiet"
                              type="button"
                              disabled={Boolean(busyId)}
                              onClick={() =>
                                void run(item, () => taskMutationService.complete(item.sourceId))
                              }
                            >
                              <Check size={15} aria-hidden="true" /> Complete
                            </button>
                          ) : null}
                          {item.sourceType === 'task' && item.taskStatus === 'waiting' ? (
                            <>
                              <button
                                className="button button-quiet"
                                type="button"
                                disabled={Boolean(busyId)}
                                onClick={() =>
                                  void run(item, () => taskMutationService.restore(item.sourceId))
                                }
                              >
                                <RotateCcw size={15} aria-hidden="true" /> Restore
                              </button>
                              <button
                                className="button button-quiet"
                                type="button"
                                disabled={Boolean(busyId)}
                                onClick={() =>
                                  void run(item, () => taskMutationService.complete(item.sourceId))
                                }
                              >
                                <Check size={15} aria-hidden="true" /> Complete
                              </button>
                            </>
                          ) : null}
                          {item.sourceType === 'reminder' ? (
                            <>
                              <button
                                className="button button-quiet"
                                type="button"
                                disabled={Boolean(busyId)}
                                onClick={() =>
                                  void run(item, () =>
                                    reminderMutationService.dismiss(item.sourceId),
                                  )
                                }
                              >
                                Dismiss
                              </button>
                              <button
                                className="button button-quiet"
                                type="button"
                                disabled={Boolean(busyId)}
                                onClick={() => {
                                  if (
                                    item.remindDate === undefined ||
                                    item.remindMinute === undefined
                                  )
                                    return;
                                  const shifted = shiftReminderSchedule(
                                    item.remindDate,
                                    item.remindMinute,
                                    10,
                                  );
                                  void run(item, () =>
                                    reminderMutationService.snooze(item.sourceId, {
                                      ...shifted,
                                      note: item.reminderNote,
                                    }),
                                  );
                                }}
                              >
                                Snooze 10 min
                              </button>
                            </>
                          ) : null}
                          {item.sourceType === 'learner-notice' ? (
                            <button
                              className="button button-quiet"
                              type="button"
                              disabled={Boolean(busyId)}
                              onClick={() =>
                                void run(item, () =>
                                  learnerNoticeMutationService.resolve(item.sourceId),
                                )
                              }
                            >
                              <Check size={15} aria-hidden="true" /> Resolve
                            </button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

import { Bell, Clock3, Edit3, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';

import { classroomDb } from '@/data/db/ClassroomDatabase';
import type { Reminder, ReminderSourceType } from '@/domain/models/entities';
import { formatShortDate } from '@/shared/dates/localDate';

import { reminderMutationService, type ReminderScheduleValues } from './reminderMutationService';
import { formatReminderMinute, shiftReminderSchedule } from './reminderReadModel';
import styles from './ReminderPanel.module.css';

interface ReminderPanelProps {
  sourceType: ReminderSourceType;
  sourceId: string;
  sourceTitle: string;
  defaultDate?: string;
  defaultMinute?: number;
}

interface ReminderFormProps {
  initial?: Reminder;
  defaultDate?: string;
  defaultMinute?: number;
  submitLabel: string;
  busy: boolean;
  onSubmit: (values: ReminderScheduleValues) => Promise<void>;
  onCancel: () => void;
}

function minuteToTime(value: number | undefined): string {
  if (value === undefined) return '';
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function timeToMinute(value: string): number {
  const [hourText, minuteText] = value.split(':');
  return Number(hourText) * 60 + Number(minuteText);
}

function ReminderForm({
  initial,
  defaultDate,
  defaultMinute,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: ReminderFormProps) {
  const id = useId();
  const [date, setDate] = useState(initial?.remindDate ?? defaultDate ?? '');
  const [time, setTime] = useState(minuteToTime(initial?.remindMinute ?? defaultMinute ?? 9 * 60));
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    try {
      await onSubmit({
        remindDate: date,
        remindMinute: timeToMinute(time),
        note,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Reminder could not be saved.');
    }
  }

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <label htmlFor={`${id}-date`}>
        <span>Date</span>
        <input
          id={`${id}-date`}
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          required
        />
      </label>
      <label htmlFor={`${id}-time`}>
        <span>Time</span>
        <input
          id={`${id}-time`}
          type="time"
          value={time}
          onChange={(event) => setTime(event.target.value)}
          required
        />
      </label>
      <label className={styles.noteField} htmlFor={`${id}-note`}>
        <span>Note</span>
        <input
          id={`${id}-note`}
          value={note}
          maxLength={1000}
          placeholder="Optional reminder note"
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.formActions}>
        <button className="button button-primary" type="submit" disabled={busy || !date || !time}>
          {submitLabel}
        </button>
        <button className="button button-quiet" type="button" onClick={onCancel} disabled={busy}>
          <X size={15} aria-hidden="true" /> Cancel
        </button>
      </div>
    </form>
  );
}

export function ReminderPanel({
  sourceType,
  sourceId,
  sourceTitle,
  defaultDate,
  defaultMinute,
}: ReminderPanelProps) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reminders = useLiveQuery(
    async () =>
      classroomDb.reminders.where('[sourceType+sourceId]').equals([sourceType, sourceId]).toArray(),
    [sourceType, sourceId],
  );
  const ordered = useMemo(
    () =>
      (reminders ?? []).sort(
        (first, second) =>
          first.remindDate.localeCompare(second.remindDate) ||
          first.remindMinute - second.remindMinute ||
          first.id.localeCompare(second.id),
      ),
    [reminders],
  );

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Reminder action failed.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel} aria-label={`Reminders for ${sourceTitle}`}>
      <div className={styles.heading}>
        <div>
          <Bell size={17} aria-hidden="true" />
          <strong>Reminders</strong>
          <span>{ordered.length}</span>
        </div>
        {!creating ? (
          <button className="button button-quiet" type="button" onClick={() => setCreating(true)}>
            <Plus size={15} aria-hidden="true" /> Add reminder
          </button>
        ) : null}
      </div>

      {creating ? (
        <ReminderForm
          defaultDate={defaultDate}
          defaultMinute={defaultMinute}
          submitLabel="Create reminder"
          busy={busy}
          onCancel={() => setCreating(false)}
          onSubmit={async (values) => {
            const saved = await run(() =>
              reminderMutationService.create({
                ...values,
                sourceType,
                sourceId,
              }),
            );
            if (saved) setCreating(false);
          }}
        />
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {reminders === undefined ? (
        <p className={styles.message}>Loading reminders…</p>
      ) : ordered.length === 0 && !creating ? (
        <p className={styles.message}>No reminders are attached to this record.</p>
      ) : (
        <ul className={styles.list} aria-label={`Reminders attached to ${sourceTitle}`}>
          {ordered.map((reminder) => (
            <li key={reminder.id}>
              {editingId === reminder.id ? (
                <ReminderForm
                  initial={reminder}
                  submitLabel="Save reminder"
                  busy={busy}
                  onCancel={() => setEditingId(null)}
                  onSubmit={async (values) => {
                    const saved = await run(() =>
                      reminderMutationService.update(reminder.id, values),
                    );
                    if (saved) setEditingId(null);
                  }}
                />
              ) : (
                <>
                  <div className={styles.reminderSummary}>
                    <Clock3 size={15} aria-hidden="true" />
                    <div>
                      <strong>
                        {formatShortDate(reminder.remindDate)} at{' '}
                        {formatReminderMinute(reminder.remindMinute)}
                      </strong>
                      <span data-status={reminder.status}>
                        {reminder.status === 'active' ? 'Active' : 'Dismissed'}
                      </span>
                      {reminder.note ? <p>{reminder.note}</p> : null}
                    </div>
                  </div>
                  <div className={styles.actions}>
                    <button
                      className="button button-quiet"
                      type="button"
                      onClick={() => setEditingId(reminder.id)}
                      disabled={busy}
                    >
                      <Edit3 size={14} aria-hidden="true" /> Edit
                    </button>
                    {reminder.status === 'active' ? (
                      <>
                        <button
                          className="button button-quiet"
                          type="button"
                          onClick={() =>
                            void run(() => reminderMutationService.dismiss(reminder.id))
                          }
                          disabled={busy}
                        >
                          Dismiss
                        </button>
                        <button
                          className="button button-quiet"
                          type="button"
                          onClick={() => {
                            const shifted = shiftReminderSchedule(
                              reminder.remindDate,
                              reminder.remindMinute,
                              10,
                            );
                            void run(() =>
                              reminderMutationService.snooze(reminder.id, {
                                ...shifted,
                                note: reminder.note,
                              }),
                            );
                          }}
                          disabled={busy}
                        >
                          Snooze 10 min
                        </button>
                      </>
                    ) : (
                      <button
                        className="button button-quiet"
                        type="button"
                        onClick={() => void run(() => reminderMutationService.restore(reminder.id))}
                        disabled={busy}
                      >
                        <RotateCcw size={14} aria-hidden="true" /> Restore
                      </button>
                    )}
                    <button
                      className="button button-quiet"
                      type="button"
                      onClick={() => void run(() => reminderMutationService.delete(reminder.id))}
                      disabled={busy}
                    >
                      <Trash2 size={14} aria-hidden="true" /> Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

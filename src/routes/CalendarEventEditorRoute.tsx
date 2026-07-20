import { ArrowLeft, CalendarDays, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ZodError } from 'zod';

import type { CalendarEvent } from '@/domain/models/entities';
import { formatCalendarMinute, getCalendarMonthRange } from '@/features/calendar/calendarReadModel';
import {
  calendarEventMutationService,
  type CalendarEventMutationService,
} from '@/features/editing/calendarEventMutationService';
import {
  createCalendarEventEditorValues,
  toCalendarEventEditorValues,
  type CalendarEventEditorValues,
} from '@/features/editing/calendarEventEditorModel';
import { ReminderPanel } from '@/features/reminders/ReminderPanel';
import { useWorkspaceReadModel } from '@/features/workspace/useWorkspaceReadModel';
import { formatLongDate } from '@/shared/dates/localDate';
import { useDateSearchParam } from '@/shared/dates/useDateSearchParam';
import styles from './CalendarEventEditorRoute.module.css';

interface CalendarEventFormProps {
  event: CalendarEvent | null;
  initialDate: string;
  service?: CalendarEventMutationService;
  onSaved: (event: CalendarEvent) => void;
  onDeleted: () => void;
  onCancel: () => void;
}

function getEventTimeLabel(event: CalendarEvent): string {
  if (event.startMinute === undefined && event.endMinute === undefined) {
    return 'All day';
  }
  if (event.startMinute !== undefined && event.endMinute !== undefined) {
    return `${formatCalendarMinute(event.startMinute)}–${formatCalendarMinute(event.endMinute)}`;
  }
  if (event.startMinute !== undefined) {
    return formatCalendarMinute(event.startMinute);
  }
  return `Until ${formatCalendarMinute(event.endMinute!)}`;
}

function getValidationMessage(cause: unknown): string {
  if (cause instanceof ZodError) {
    return cause.issues[0]?.message ?? 'Check the event details.';
  }
  return cause instanceof Error ? cause.message : 'Calendar event could not be saved.';
}

function CalendarEventForm({
  event,
  initialDate,
  service = calendarEventMutationService,
  onSaved,
  onDeleted,
  onCancel,
}: CalendarEventFormProps) {
  const [values, setValues] = useState<CalendarEventEditorValues>(() =>
    event ? toCalendarEventEditorValues(event) : createCalendarEventEditorValues(initialDate),
  );
  const [saving, setSaving] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof CalendarEventEditorValues>(
    key: K,
    value: CalendarEventEditorValues[K],
  ): void {
    setValues((current) => ({ ...current, [key]: value }));
    setError(null);
    if (key !== 'title') setDeleteArmed(false);
  }

  async function save(): Promise<void> {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = event ? await service.update(event.id, values) : await service.create(values);
      onSaved(saved);
    } catch (cause) {
      setError(getValidationMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function remove(): Promise<void> {
    if (!event || saving) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await service.delete(event.id);
      onDeleted();
    } catch (cause) {
      setError(getValidationMessage(cause));
      setSaving(false);
    }
  }

  return (
    <section className={`card ${styles.editor}`} aria-label="Calendar event editor">
      <div className={styles.editorHeader}>
        <div>
          <p className="page-eyebrow">Controlled editing</p>
          <h2>{event ? 'Edit event' : 'New event'}</h2>
        </div>
        <button className="button" type="button" onClick={onCancel}>
          <X size={17} aria-hidden="true" />
          Close
        </button>
      </div>

      <div className={styles.formGrid}>
        <label className={styles.fullWidth}>
          <span>Title</span>
          <input
            value={values.title}
            onChange={(input) => update('title', input.target.value)}
            autoFocus
          />
        </label>

        <label>
          <span>Start date</span>
          <input
            type="date"
            value={values.startDate}
            onChange={(input) => update('startDate', input.target.value)}
          />
        </label>

        <label>
          <span>End date</span>
          <input
            type="date"
            value={values.endDate}
            min={values.startDate}
            onChange={(input) => update('endDate', input.target.value)}
          />
        </label>

        <label className={`${styles.checkboxLabel} ${styles.fullWidth}`}>
          <input
            type="checkbox"
            checked={values.allDay}
            onChange={(input) => update('allDay', input.target.checked)}
          />
          <span>All-day event</span>
        </label>

        <label>
          <span>Start time</span>
          <input
            type="time"
            value={values.startTime}
            disabled={values.allDay}
            onChange={(input) => update('startTime', input.target.value)}
          />
        </label>

        <label>
          <span>End time</span>
          <input
            type="time"
            value={values.endTime}
            disabled={values.allDay}
            onChange={(input) => update('endTime', input.target.value)}
          />
        </label>

        <label className={styles.fullWidth}>
          <span>Category</span>
          <input
            value={values.category}
            onChange={(input) => update('category', input.target.value)}
          />
        </label>

        <label className={styles.fullWidth}>
          <span>Details</span>
          <textarea
            rows={4}
            value={values.details}
            onChange={(input) => update('details', input.target.value)}
          />
        </label>
      </div>

      {event ? (
        <ReminderPanel
          sourceType="calendar-event"
          sourceId={event.id}
          sourceTitle={event.title}
          defaultDate={event.startDate}
          defaultMinute={event.startMinute}
        />
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div
        className={`editor-action-bar ${styles.formActions}`}
        role="group"
        aria-label="Editor actions"
      >
        <button
          className="button button-primary"
          type="button"
          disabled={saving}
          onClick={() => void save()}
        >
          <Save size={17} aria-hidden="true" />
          {saving ? 'Saving…' : 'Save event'}
        </button>
        {event ? (
          <button
            className={deleteArmed ? styles.dangerButton : 'button'}
            type="button"
            disabled={saving}
            onClick={() => void remove()}
          >
            <Trash2 size={17} aria-hidden="true" />
            {deleteArmed ? 'Confirm delete' : 'Delete event'}
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function CalendarEventEditorRoute() {
  const { date, setDate } = useDateSearchParam();
  const range = useMemo(() => getCalendarMonthRange(date), [date]);
  const state = useWorkspaceReadModel({
    startDate: range.monthStartDate,
    endDate: range.monthEndDate,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const events = state.status === 'ready' ? state.data.calendarEvents : [];
  const editingEvent = editingId ? (events.find((event) => event.id === editingId) ?? null) : null;
  const editorOpen = creating || Boolean(editingEvent);

  function openCreate(): void {
    setEditingId(null);
    setCreating(true);
    setNotice(null);
  }

  function openEdit(id: string): void {
    setCreating(false);
    setEditingId(id);
    setNotice(null);
  }

  function closeEditor(): void {
    setCreating(false);
    setEditingId(null);
  }

  return (
    <section className="page">
      <header className="page-header editor-page-header">
        <div>
          <p className="page-eyebrow">Calendar events</p>
          <h1>Calendar event editor</h1>
          <p>
            Create and maintain dated events. Every change stays available through Classroom Undo
            and Redo.
          </p>
        </div>
        <div className={styles.headerActions}>
          <a className="button" href={`#/calendar?date=${date}`}>
            <ArrowLeft size={17} aria-hidden="true" />
            Back to Calendar
          </a>
          <button className="button button-primary" type="button" onClick={openCreate}>
            <Plus size={17} aria-hidden="true" />
            New event
          </button>
        </div>
      </header>

      <div className={`card ${styles.monthBar}`}>
        <CalendarDays size={19} aria-hidden="true" />
        <label>
          <span>Month</span>
          <input
            type="month"
            value={date.slice(0, 7)}
            onChange={(input) => setDate(`${input.target.value}-01`)}
          />
        </label>
        <strong>{range.label}</strong>
      </div>

      {notice ? (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      ) : null}

      <div className={styles.layout}>
        <section
          className={`card ${styles.eventListPanel}`}
          aria-label={`${range.label} dated events`}
        >
          <div className={styles.listHeader}>
            <div>
              <p className="page-eyebrow">Dated records</p>
              <h2>{range.label}</h2>
            </div>
            <span>
              {events.length} event{events.length === 1 ? '' : 's'}
            </span>
          </div>

          {state.status === 'loading' ? <p>Loading events…</p> : null}
          {state.status === 'error' ? (
            <p className={styles.error} role="alert">
              {state.message}
            </p>
          ) : null}
          {state.status === 'ready' && events.length === 0 ? (
            <div className={styles.emptyState}>
              <h3>No dated events in this month</h3>
              <p>Recurring schedule blocks are managed separately in Schedule.</p>
            </div>
          ) : null}
          {state.status === 'ready' && events.length > 0 ? (
            <ul className={styles.eventList} aria-label={`${range.label} calendar events`}>
              {events.map((event) => (
                <li key={event.id} className={styles.eventItem}>
                  <div>
                    <p className={styles.eventDate}>
                      {formatLongDate(event.startDate)} · {getEventTimeLabel(event)}
                    </p>
                    <h3>{event.title}</h3>
                    <p>{event.category}</p>
                    {event.endDate && event.endDate !== event.startDate ? (
                      <p>Through {formatLongDate(event.endDate)}</p>
                    ) : null}
                  </div>
                  <button className="button" type="button" onClick={() => openEdit(event.id)}>
                    <Pencil size={16} aria-hidden="true" />
                    Edit
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {editorOpen ? (
          <CalendarEventForm
            key={editingEvent?.id ?? `new-${date}`}
            event={editingEvent}
            initialDate={date}
            onCancel={closeEditor}
            onSaved={(saved) => {
              setDate(saved.startDate);
              closeEditor();
              setNotice(`Saved “${saved.title}”.`);
            }}
            onDeleted={() => {
              closeEditor();
              setNotice('Calendar event deleted. Use Undo to restore it.');
            }}
          />
        ) : (
          <aside className={`card ${styles.guidance}`} aria-label="Editing guidance">
            <CalendarDays size={30} aria-hidden="true" />
            <h2>Select an event to edit</h2>
            <p>
              Every save is validated with Zod and committed with its matching change-log record in
              one IndexedDB transaction.
            </p>
            <p>
              The global Undo and Redo buttons in the top bar operate on these calendar event
              changes.
            </p>
          </aside>
        )}
      </div>
    </section>
  );
}

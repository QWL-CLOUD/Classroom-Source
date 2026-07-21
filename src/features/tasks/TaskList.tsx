import { useId, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Ban,
  CalendarClock,
  Check,
  Clock3,
  Edit3,
  Hourglass,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';

import { classroomDb } from '@/data/db/ClassroomDatabase';
import type { LearnerContext, Task, TaskStatus } from '@/domain/models/entities';
import { ReminderPanel } from '@/features/reminders/ReminderPanel';
import { formatShortDate } from '@/shared/dates/localDate';
import { EditorActionMenu } from '@/shared/ui/EditorActionMenu';

import { taskMutationService, type TaskEditorValues } from './taskMutationService';
import { buildTaskWorkspaceReadModel, selectTodayTasks } from './taskReadModel';
import styles from './TaskList.module.css';

interface TaskListProps {
  selectedDate?: string;
  compact?: boolean;
  defaultScheduledDate?: string;
}

interface TaskEditorProps {
  contexts: LearnerContext[];
  initialTask?: Task;
  defaultScheduledDate?: string;
  submitLabel: string;
  busy: boolean;
  onSubmit: (values: TaskEditorValues) => Promise<void>;
  onCancel?: () => void;
}

interface EditorState {
  title: string;
  notes: string;
  scheduledDate: string;
  scheduledTime: string;
  dueDate: string;
  dueTime: string;
  contextId: string;
}

function minuteToTime(value: number | undefined): string {
  if (value === undefined) return '';
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function timeToMinute(value: string): number | undefined {
  if (!value) return undefined;
  const [hourText, minuteText] = value.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return undefined;
  return hour * 60 + minute;
}

function formatMinute(value: number | undefined): string | null {
  if (value === undefined) return null;
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function buildInitialEditorState(task?: Task, defaultScheduledDate?: string): EditorState {
  return {
    title: task?.title ?? '',
    notes: task?.notes ?? '',
    scheduledDate: task?.scheduledDate ?? defaultScheduledDate ?? '',
    scheduledTime: minuteToTime(task?.scheduledMinute),
    dueDate: task?.dueDate ?? '',
    dueTime: minuteToTime(task?.dueMinute),
    contextId: task?.contextId ?? '',
  };
}

function TaskEditor({
  contexts,
  initialTask,
  defaultScheduledDate,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: TaskEditorProps) {
  const id = useId();
  const [values, setValues] = useState<EditorState>(() =>
    buildInitialEditorState(initialTask, defaultScheduledDate),
  );
  const [error, setError] = useState<string | null>(null);

  const activeContexts = contexts.filter((context) => context.status === 'active');
  const currentArchivedContext = initialTask?.contextId
    ? contexts.find(
        (context) => context.id === initialTask.contextId && context.status === 'archived',
      )
    : undefined;

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    try {
      await onSubmit({
        title: values.title,
        notes: values.notes,
        scheduledDate: values.scheduledDate,
        scheduledMinute: timeToMinute(values.scheduledTime),
        dueDate: values.dueDate,
        dueMinute: timeToMinute(values.dueTime),
        contextId: values.contextId,
      });
      if (!initialTask) setValues(buildInitialEditorState(undefined, defaultScheduledDate));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Task could not be saved.');
    }
  }

  return (
    <form className={styles.editor} onSubmit={(event) => void submit(event)}>
      <div className={styles.editorPrimaryRow}>
        <label className={styles.field} htmlFor={`${id}-title`}>
          <span>Task title</span>
          <input
            id={`${id}-title`}
            className="input"
            value={values.title}
            onChange={(event) =>
              setValues((current) => ({ ...current, title: event.target.value }))
            }
            maxLength={240}
            required
            autoFocus
          />
        </label>
        <label className={styles.field} htmlFor={`${id}-context`}>
          <span>Context</span>
          <select
            id={`${id}-context`}
            className="select"
            value={values.contextId}
            onChange={(event) =>
              setValues((current) => ({ ...current, contextId: event.target.value }))
            }
          >
            <option value="">No learner context</option>
            {currentArchivedContext ? (
              <option value={currentArchivedContext.id}>
                {currentArchivedContext.name} (archived — preserved)
              </option>
            ) : null}
            {activeContexts.map((context) => (
              <option key={context.id} value={context.id}>
                {context.name} · {context.kind}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.dateGrid}>
        <fieldset className={styles.dateGroup}>
          <legend>Scheduled</legend>
          <p>When you plan to work on it.</p>
          <label className={styles.field} htmlFor={`${id}-scheduled-date`}>
            <span>Date</span>
            <input
              id={`${id}-scheduled-date`}
              className="input"
              type="date"
              value={values.scheduledDate}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  scheduledDate: event.target.value,
                  scheduledTime: event.target.value ? current.scheduledTime : '',
                }))
              }
            />
          </label>
          <label className={styles.field} htmlFor={`${id}-scheduled-time`}>
            <span>Time</span>
            <input
              id={`${id}-scheduled-time`}
              className="input"
              type="time"
              value={values.scheduledTime}
              disabled={!values.scheduledDate}
              onChange={(event) =>
                setValues((current) => ({ ...current, scheduledTime: event.target.value }))
              }
            />
          </label>
        </fieldset>

        <fieldset className={styles.dateGroup}>
          <legend>Due</legend>
          <p>The deadline, not the work date.</p>
          <label className={styles.field} htmlFor={`${id}-due-date`}>
            <span>Date</span>
            <input
              id={`${id}-due-date`}
              className="input"
              type="date"
              value={values.dueDate}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  dueDate: event.target.value,
                  dueTime: event.target.value ? current.dueTime : '',
                }))
              }
            />
          </label>
          <label className={styles.field} htmlFor={`${id}-due-time`}>
            <span>Time</span>
            <input
              id={`${id}-due-time`}
              className="input"
              type="time"
              value={values.dueTime}
              disabled={!values.dueDate}
              onChange={(event) =>
                setValues((current) => ({ ...current, dueTime: event.target.value }))
              }
            />
          </label>
        </fieldset>
      </div>

      <label className={styles.field} htmlFor={`${id}-notes`}>
        <span>Notes</span>
        <textarea
          id={`${id}-notes`}
          value={values.notes}
          onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))}
          rows={3}
          maxLength={5000}
        />
      </label>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.editorActions}>
        {onCancel ? (
          <button className="button button-quiet" type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        ) : null}
        <button
          className="button button-primary"
          type="submit"
          disabled={busy || !values.title.trim()}
        >
          {initialTask ? (
            <Check size={17} aria-hidden="true" />
          ) : (
            <Plus size={17} aria-hidden="true" />
          )}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function statusLabel(status: TaskStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function TaskCard({
  task,
  contexts,
  busy,
  onRun,
}: {
  task: Task;
  contexts: LearnerContext[];
  busy: boolean;
  onRun: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const context = task.contextId ? contexts.find((item) => item.id === task.contextId) : undefined;
  const scheduledTime = formatMinute(task.scheduledMinute);
  const dueTime = formatMinute(task.dueMinute);

  async function run(action: () => Promise<unknown>): Promise<void> {
    setError(null);
    try {
      await onRun(action);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Task action failed.');
    }
  }

  return (
    <article className={styles.taskCard} aria-label={`${task.title} task`}>
      {editing ? (
        <TaskEditor
          contexts={contexts}
          initialTask={task}
          submitLabel="Save task"
          busy={busy}
          onCancel={() => setEditing(false)}
          onSubmit={async (values) => {
            await onRun(() => taskMutationService.update(task.id, values));
            setEditing(false);
          }}
        />
      ) : (
        <>
          <div className={styles.taskHeading}>
            <div>
              <span className={styles.statusBadge} data-status={task.status}>
                {statusLabel(task.status)}
              </span>
              <h3>{task.title}</h3>
            </div>
          </div>

          <div className={styles.metaList}>
            {task.scheduledDate ? (
              <span>
                <CalendarClock size={15} aria-hidden="true" /> Scheduled{' '}
                {formatShortDate(task.scheduledDate)}
                {scheduledTime ? ` at ${scheduledTime}` : ''}
              </span>
            ) : (
              <span>
                <CalendarClock size={15} aria-hidden="true" /> Unscheduled
              </span>
            )}
            {task.dueDate ? (
              <span>
                <Clock3 size={15} aria-hidden="true" /> Due {formatShortDate(task.dueDate)}
                {dueTime ? ` at ${dueTime}` : ''}
              </span>
            ) : null}
            {context ? (
              <span>
                {context.name}
                {context.status === 'archived' ? ' · archived context' : ''}
              </span>
            ) : null}
          </div>

          {task.notes ? <p className={styles.notes}>{task.notes}</p> : null}

          <ReminderPanel
            sourceType="task"
            sourceId={task.id}
            sourceTitle={task.title}
            defaultDate={task.scheduledDate ?? task.dueDate}
            defaultMinute={task.scheduledMinute ?? task.dueMinute}
          />

          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}

          <div className={styles.taskActions}>
            <div className={styles.primaryTaskActions}>
              {task.status === 'active' || task.status === 'waiting' ? (
                <button
                  className="button"
                  type="button"
                  onClick={() => void run(() => taskMutationService.complete(task.id))}
                  disabled={busy}
                >
                  <Check size={16} aria-hidden="true" /> Complete
                </button>
              ) : null}

              {task.status === 'completed' ? (
                <button
                  className="button"
                  type="button"
                  onClick={() => void run(() => taskMutationService.reopen(task.id))}
                  disabled={busy}
                >
                  <RotateCcw size={16} aria-hidden="true" /> Reopen
                </button>
              ) : null}
            </div>

            <EditorActionMenu label="More task actions">
              <button
                className="button button-quiet"
                type="button"
                aria-label={`Edit ${task.title}`}
                onClick={() => setEditing(true)}
                disabled={busy}
              >
                <Edit3 size={16} aria-hidden="true" /> Edit task
              </button>

              {task.status === 'active' ? (
                <button
                  className="button button-quiet"
                  type="button"
                  onClick={() => void run(() => taskMutationService.wait(task.id))}
                  disabled={busy}
                >
                  <Hourglass size={16} aria-hidden="true" /> Move to Waiting
                </button>
              ) : null}

              {task.status === 'waiting' || task.status === 'cancelled' ? (
                <button
                  className="button button-quiet"
                  type="button"
                  onClick={() => void run(() => taskMutationService.restore(task.id))}
                  disabled={busy}
                >
                  <RotateCcw size={16} aria-hidden="true" /> Restore
                </button>
              ) : null}

              {task.status === 'active' || task.status === 'waiting' ? (
                <button
                  className="button button-quiet"
                  type="button"
                  onClick={() => void run(() => taskMutationService.cancel(task.id))}
                  disabled={busy}
                >
                  <Ban size={16} aria-hidden="true" /> Cancel task
                </button>
              ) : null}

              <button
                className="button button-danger"
                type="button"
                aria-label="Delete"
                onClick={() => setConfirmingDelete(true)}
                disabled={busy}
              >
                <Trash2 size={16} aria-hidden="true" /> Delete task
              </button>
            </EditorActionMenu>
          </div>

          {confirmingDelete ? (
            <div className={styles.deleteConfirm} role="group" aria-label={`Delete ${task.title}`}>
              <span>Delete permanently?</span>
              <button
                className="button"
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={busy}
              >
                Keep
              </button>
              <button
                className="button button-danger"
                type="button"
                onClick={() => void run(() => taskMutationService.delete(task.id))}
                disabled={busy}
              >
                Confirm delete
              </button>
            </div>
          ) : null}
        </>
      )}
    </article>
  );
}

function TodayTaskList({ selectedDate }: { selectedDate: string }) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tasks = useLiveQuery(
    async () => selectTodayTasks(await classroomDb.tasks.toArray(), selectedDate),
    [selectedDate],
  );

  async function addTask(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await taskMutationService.create({ title, scheduledDate: selectedDate });
      setTitle('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Task could not be added.');
    } finally {
      setBusy(false);
    }
  }

  async function complete(task: Task): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await taskMutationService.complete(task.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Task could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.compactWrapper}>
      <form className={styles.quickForm} onSubmit={(event) => void addTask(event)}>
        <label className="sr-only" htmlFor={`today-task-${selectedDate}`}>
          Task title
        </label>
        <input
          id={`today-task-${selectedDate}`}
          className="input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add a task for this date…"
        />
        <button
          className="button"
          type="submit"
          disabled={busy || !title.trim()}
          aria-label="Add task"
        >
          <Plus size={17} aria-hidden="true" />
        </button>
      </form>
      <p className={styles.todayRule}>
        Today shows active tasks scheduled for this date. Unscheduled tasks and deadlines stay in
        Tasks.
      </p>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {!tasks ? (
        <p className={styles.message}>Loading tasks…</p>
      ) : tasks.length === 0 ? (
        <p className={styles.message}>No active tasks are scheduled for this date.</p>
      ) : (
        <ul className={styles.compactList} aria-label={`Tasks scheduled for ${selectedDate}`}>
          {tasks.map((task) => (
            <li key={task.id}>
              <button
                className={styles.completeButton}
                type="button"
                onClick={() => void complete(task)}
                aria-label={`Complete ${task.title}`}
                disabled={busy}
              >
                <Check size={15} aria-hidden="true" />
              </button>
              <div>
                <strong>{task.title}</strong>
                {task.scheduledMinute !== undefined ? (
                  <span>{formatMinute(task.scheduledMinute)}</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <a className={styles.manageLink} href={`#/tasks?date=${encodeURIComponent(selectedDate)}`}>
        Manage all tasks
      </a>
    </div>
  );
}

export function TaskList({ selectedDate, compact = false, defaultScheduledDate }: TaskListProps) {
  const [creating, setCreating] = useState(false);
  const newTaskButtonRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const data = useLiveQuery(async () => {
    const [tasks, contexts] = await Promise.all([
      classroomDb.tasks.toArray(),
      classroomDb.learnerContexts.toArray(),
    ]);
    return { model: buildTaskWorkspaceReadModel(tasks), contexts };
  }, []);

  const contexts = useMemo(
    () =>
      (data?.contexts ?? []).sort(
        (first, second) =>
          first.name.localeCompare(second.name) || first.id.localeCompare(second.id),
      ),
    [data?.contexts],
  );

  if (compact && selectedDate) return <TodayTaskList selectedDate={selectedDate} />;

  function closeCreatePanel(): void {
    setCreating(false);
    requestAnimationFrame(() => newTaskButtonRef.current?.focus());
  }

  async function run(action: () => Promise<unknown>): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Task action failed.';
      setError(message);
      throw cause;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.workspace}>
      <div className={styles.workspaceToolbar}>
        <button
          ref={newTaskButtonRef}
          className="button button-primary"
          type="button"
          onClick={() => {
            if (creating) closeCreatePanel();
            else setCreating(true);
          }}
          aria-expanded={creating}
          aria-controls="new-task-panel"
        >
          <Plus size={17} aria-hidden="true" /> {creating ? 'Close new task' : 'New task'}
        </button>
      </div>

      {creating ? (
        <section
          id="new-task-panel"
          className={styles.createPanel}
          aria-labelledby="new-task-heading"
        >
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.kicker}>Create task</p>
              <h2 id="new-task-heading">New task</h2>
            </div>
          </div>
          <TaskEditor
            contexts={contexts}
            defaultScheduledDate={defaultScheduledDate}
            submitLabel="Create task"
            busy={busy}
            onCancel={closeCreatePanel}
            onSubmit={async (values) => {
              await run(() => taskMutationService.create(values));
              closeCreatePanel();
            }}
          />
        </section>
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {!data ? (
        <p className={styles.message}>Loading tasks…</p>
      ) : data.model.total === 0 ? (
        <section className={styles.emptyState}>
          <h2>No tasks yet</h2>
          <p>Use New task above when you are ready. Scheduled tasks will appear on Today.</p>
        </section>
      ) : (
        <div className={styles.sections} aria-label="Task lifecycle sections">
          {data.model.sections.map((section) => (
            <section
              key={section.status}
              className={styles.section}
              aria-labelledby={`task-section-${section.status}`}
            >
              <div className={styles.sectionHeading}>
                <h2 id={`task-section-${section.status}`}>{section.label}</h2>
                <span>{section.tasks.length}</span>
              </div>
              {section.tasks.length === 0 ? (
                <p className={styles.sectionEmpty}>No {section.label.toLowerCase()} tasks.</p>
              ) : (
                <div className={styles.cardList}>
                  {section.tasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      contexts={contexts}
                      busy={busy}
                      onRun={run}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

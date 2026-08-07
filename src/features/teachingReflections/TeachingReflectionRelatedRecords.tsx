import {
  Ban,
  CalendarClock,
  Check,
  Clock3,
  Hourglass,
  ListTodo,
  Plus,
  RotateCcw,
  UserRound,
  X,
} from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';

import type { AssessmentEvidenceRecord, Task, TaskStatus } from '@/domain/models/entities';
import {
  taskMutationService,
  type TeachingReflectionNextStepValues,
} from '@/features/tasks/taskMutationService';
import { formatLongDate, formatShortDate } from '@/shared/dates/localDate';

import type {
  TeachingReflectionDetailReadModel,
  TeachingReflectionEvidenceItemReadModel,
} from './teachingReflectionReadModel';

import styles from './TeachingReflectionRelatedRecords.module.css';

export interface TeachingReflectionNextStepActions {
  create(reflectionId: string, values: TeachingReflectionNextStepValues): Promise<Task>;
  complete(id: string): Promise<Task>;
  wait(id: string): Promise<Task>;
  cancel(id: string): Promise<Task>;
  restore(id: string): Promise<Task>;
  reopen(id: string): Promise<Task>;
}

interface TeachingReflectionRelatedRecordsProps {
  detail: TeachingReflectionDetailReadModel;
  actions?: TeachingReflectionNextStepActions;
}

interface NextStepDraft {
  title: string;
  notes: string;
  scheduledDate: string;
  scheduledTime: string;
  dueDate: string;
  dueTime: string;
}

const defaultActions: TeachingReflectionNextStepActions = {
  create: (reflectionId, values) =>
    taskMutationService.createTeachingReflectionNextStep(reflectionId, values),
  complete: (id) => taskMutationService.complete(id),
  wait: (id) => taskMutationService.wait(id),
  cancel: (id) => taskMutationService.cancel(id),
  restore: (id) => taskMutationService.restore(id),
  reopen: (id) => taskMutationService.reopen(id),
};

function createDraft(): NextStepDraft {
  return {
    title: '',
    notes: '',
    scheduledDate: '',
    scheduledTime: '',
    dueDate: '',
    dueTime: '',
  };
}

function timeToMinute(value: string): number | undefined {
  if (!value) return undefined;
  const [hourText, minuteText] = value.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  return Number.isInteger(hour) && Number.isInteger(minute) ? hour * 60 + minute : undefined;
}

function formatMinute(value: number | undefined): string | null {
  if (value === undefined) return null;
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function statusLabel(status: TaskStatus): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'waiting':
      return 'Waiting';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
  }
}

function evidenceKindLabel(record: AssessmentEvidenceRecord): string {
  switch (record.kind) {
    case 'score':
      return 'Score';
    case 'proficiency':
      return 'Proficiency';
    case 'observation':
      return 'Observation';
  }
}

function evidenceValue(record: AssessmentEvidenceRecord): string {
  if (record.kind === 'score') {
    const numeric =
      record.score.value === undefined
        ? undefined
        : record.score.maximum === undefined
          ? String(record.score.value)
          : `${record.score.value} / ${record.score.maximum}`;
    return [record.score.label, numeric].filter(Boolean).join(' · ');
  }
  if (record.kind === 'proficiency') return record.proficiency.label;
  return record.observation.text;
}

function learnerLabel(item: TeachingReflectionEvidenceItemReadModel): string {
  if (!item.student) return 'Learner record unavailable';
  const name = item.student.preferredName || item.student.name;
  return item.student.status === 'archived' ? `${name} · archived learner` : name;
}

function taskTiming(task: Task): string[] {
  const values: string[] = [];
  if (task.scheduledDate) {
    const time = formatMinute(task.scheduledMinute);
    values.push(`Scheduled ${formatShortDate(task.scheduledDate)}${time ? ` at ${time}` : ''}`);
  }
  if (task.dueDate) {
    const time = formatMinute(task.dueMinute);
    values.push(`Due ${formatShortDate(task.dueDate)}${time ? ` at ${time}` : ''}`);
  }
  return values;
}

export function TeachingReflectionRelatedRecords({
  detail,
  actions = defaultActions,
}: TeachingReflectionRelatedRecordsProps) {
  const formId = useId();
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<NextStepDraft>(() => createDraft());
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const archived = detail.reflection.status === 'archived';
  const contextUnavailable = detail.source.context.state === 'unavailable';
  const canCreateNextStep = !archived && !contextUnavailable;

  function updateDraft<K extends keyof NextStepDraft>(key: K, value: NextStepDraft[K]): void {
    setDraft((current) => ({ ...current, [key]: value }));
    setError(null);
    setStatusMessage(null);
  }

  async function createNextStep(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (creating || !canCreateNextStep) return;
    setCreating(true);
    setError(null);
    setStatusMessage(null);
    try {
      await actions.create(detail.reflection.id, {
        title: draft.title,
        notes: draft.notes,
        scheduledDate: draft.scheduledDate,
        scheduledMinute: timeToMinute(draft.scheduledTime),
        dueDate: draft.dueDate,
        dueMinute: timeToMinute(draft.dueTime),
      });
      setDraft(createDraft());
      setFormOpen(false);
      setStatusMessage('Next Step added. It is available in Tasks and Personal Agenda.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Next Step could not be added.');
    } finally {
      setCreating(false);
    }
  }

  async function changeTask(
    task: Task,
    action: 'complete' | 'wait' | 'cancel' | 'restore' | 'reopen',
  ): Promise<void> {
    if (busyTaskId) return;
    setBusyTaskId(task.id);
    setError(null);
    setStatusMessage(null);
    try {
      await actions[action](task.id);
      const messages: Record<typeof action, string> = {
        complete: 'Next Step completed.',
        wait: 'Next Step moved to Waiting.',
        cancel: 'Next Step cancelled.',
        restore: 'Next Step restored to Active.',
        reopen: 'Next Step reopened.',
      };
      setStatusMessage(messages[action]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Next Step could not be updated.');
    } finally {
      setBusyTaskId(null);
    }
  }

  return (
    <section className={styles.relatedRecords} aria-labelledby="reflection-related-heading">
      <div className={styles.sectionHeading}>
        <div>
          <p className="page-eyebrow">Linked records</p>
          <h2 id="reflection-related-heading">Evidence and Next Steps</h2>
        </div>
        <span>Evidence stays learner-specific. Next Steps use the existing Task lifecycle.</span>
      </div>

      <section className={styles.relatedSection} aria-labelledby="reflection-evidence-heading">
        <div className={styles.relatedHeading}>
          <div>
            <h3 id="reflection-evidence-heading">Assessment Evidence</h3>
            <p>
              {detail.relatedEvidence.activeCount} active · {detail.relatedEvidence.archivedCount}{' '}
              archived
            </p>
          </div>
          <span className={styles.countBadge}>{detail.relatedEvidence.records.length}</span>
        </div>

        {detail.relatedEvidence.items.length ? (
          <ul className={styles.recordList}>
            {detail.relatedEvidence.items.map((item) => {
              const record = item.record;
              return (
                <li key={record.id}>
                  <article className={styles.evidenceCard}>
                    <div className={styles.cardHeading}>
                      <div>
                        <span className={styles.kindBadge}>{evidenceKindLabel(record)}</span>
                        <h4>{record.title}</h4>
                      </div>
                      <span className={styles.statusBadge} data-status={record.status}>
                        {record.status === 'active' ? 'Active' : 'Archived'}
                      </span>
                    </div>
                    <p className={styles.evidenceValue}>{evidenceValue(record)}</p>
                    <div className={styles.recordMeta}>
                      <span>
                        <UserRound aria-hidden="true" size={15} /> {learnerLabel(item)}
                      </span>
                      <span>
                        <CalendarClock aria-hidden="true" size={15} />{' '}
                        {formatLongDate(record.occurredOn)}
                      </span>
                      {record.standardIds.length ? (
                        <span>
                          {record.standardIds.length} linked Standard
                          {record.standardIds.length === 1 ? '' : 's'}
                        </span>
                      ) : null}
                    </div>
                    <div className={styles.cardActions}>
                      <a
                        className="button"
                        href={`#/learner-progress?schoolYear=${encodeURIComponent(detail.reflection.schoolYearId)}${
                          item.student ? `&student=${encodeURIComponent(item.student.id)}` : ''
                        }&evidence=${encodeURIComponent(record.id)}`}
                      >
                        Open Evidence
                      </a>
                      {item.student ? (
                        <a
                          className="button"
                          href={`#/learners?directory=students&student=${encodeURIComponent(item.student.id)}`}
                        >
                          Open learner record
                        </a>
                      ) : null}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={styles.emptyState}>
            No Assessment Evidence is linked to this Session. Classroom does not infer learner
            progress from the Reflection narrative.
          </p>
        )}
      </section>

      <section className={styles.relatedSection} aria-labelledby="reflection-next-steps-heading">
        <div className={styles.relatedHeading}>
          <div>
            <h3 id="reflection-next-steps-heading">Next Step Tasks</h3>
            <p>
              {detail.nextSteps.openCount} open · {detail.nextSteps.closedCount} completed or
              cancelled
            </p>
          </div>
          <div className={styles.headingActions}>
            <a className="button" href="#/tasks">
              <ListTodo aria-hidden="true" size={16} /> Open in Tasks
            </a>
            <button
              className="button button-primary"
              type="button"
              disabled={!canCreateNextStep}
              onClick={() => {
                setFormOpen((current) => !current);
                setError(null);
                setStatusMessage(null);
              }}
            >
              <Plus aria-hidden="true" size={16} /> {formOpen ? 'Close form' : 'Add Next Step'}
            </button>
          </div>
        </div>

        {archived ? (
          <p className={styles.guidance} role="status">
            Restore this Reflection before adding another Next Step. Existing Tasks keep their own
            lifecycle.
          </p>
        ) : contextUnavailable ? (
          <p className={styles.guidance} role="status">
            The source context is unavailable, so a new Next Step cannot be created. Existing Tasks
            remain available.
          </p>
        ) : null}

        {formOpen && canCreateNextStep ? (
          <form className={styles.nextStepForm} onSubmit={(event) => void createNextStep(event)}>
            <label htmlFor={`${formId}-title`}>
              <span>Next Step title</span>
              <input
                id={`${formId}-title`}
                className="input"
                value={draft.title}
                maxLength={240}
                required
                autoFocus
                onChange={(event) => updateDraft('title', event.target.value)}
              />
            </label>
            <label htmlFor={`${formId}-notes`}>
              <span>Notes</span>
              <textarea
                id={`${formId}-notes`}
                rows={3}
                value={draft.notes}
                maxLength={5000}
                onChange={(event) => updateDraft('notes', event.target.value)}
              />
            </label>
            <div className={styles.dateGrid}>
              <fieldset>
                <legend>Scheduled</legend>
                <label htmlFor={`${formId}-scheduled-date`}>
                  <span>Date</span>
                  <input
                    id={`${formId}-scheduled-date`}
                    className="input"
                    type="date"
                    value={draft.scheduledDate}
                    onChange={(event) => {
                      const value = event.target.value;
                      setDraft((current) => ({
                        ...current,
                        scheduledDate: value,
                        scheduledTime: value ? current.scheduledTime : '',
                      }));
                      setError(null);
                      setStatusMessage(null);
                    }}
                  />
                </label>
                <label htmlFor={`${formId}-scheduled-time`}>
                  <span>Time</span>
                  <input
                    id={`${formId}-scheduled-time`}
                    className="input"
                    type="time"
                    value={draft.scheduledTime}
                    disabled={!draft.scheduledDate}
                    onChange={(event) => updateDraft('scheduledTime', event.target.value)}
                  />
                </label>
              </fieldset>
              <fieldset>
                <legend>Due</legend>
                <label htmlFor={`${formId}-due-date`}>
                  <span>Date</span>
                  <input
                    id={`${formId}-due-date`}
                    className="input"
                    type="date"
                    value={draft.dueDate}
                    onChange={(event) => {
                      const value = event.target.value;
                      setDraft((current) => ({
                        ...current,
                        dueDate: value,
                        dueTime: value ? current.dueTime : '',
                      }));
                      setError(null);
                      setStatusMessage(null);
                    }}
                  />
                </label>
                <label htmlFor={`${formId}-due-time`}>
                  <span>Time</span>
                  <input
                    id={`${formId}-due-time`}
                    className="input"
                    type="time"
                    value={draft.dueTime}
                    disabled={!draft.dueDate}
                    onChange={(event) => updateDraft('dueTime', event.target.value)}
                  />
                </label>
              </fieldset>
            </div>
            <div className={styles.formActions}>
              <button className="button button-primary" type="submit" disabled={creating}>
                <Plus aria-hidden="true" size={16} /> {creating ? 'Adding…' : 'Add Next Step'}
              </button>
              <button
                className="button"
                type="button"
                disabled={creating}
                onClick={() => {
                  setFormOpen(false);
                  setDraft(createDraft());
                  setError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        {detail.nextSteps.tasks.length ? (
          <ul className={styles.recordList}>
            {detail.nextSteps.tasks.map((task) => {
              const timing = taskTiming(task);
              const busy = busyTaskId === task.id;
              return (
                <li key={task.id}>
                  <article
                    className={styles.taskCard}
                    aria-label={`${task.title}, ${statusLabel(task.status)}`}
                  >
                    <div className={styles.cardHeading}>
                      <div>
                        <span className={styles.taskStatus} data-status={task.status}>
                          {statusLabel(task.status)}
                        </span>
                        <h4>{task.title}</h4>
                      </div>
                    </div>
                    {task.notes ? <p className={styles.taskNotes}>{task.notes}</p> : null}
                    {timing.length ? (
                      <div className={styles.recordMeta}>
                        {timing.map((value) => (
                          <span key={value}>
                            <Clock3 aria-hidden="true" size={15} /> {value}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className={styles.unscheduled}>No scheduled or due date.</p>
                    )}
                    <div
                      className={styles.taskActions}
                      role="group"
                      aria-label={`Actions for ${task.title}`}
                    >
                      {task.status === 'active' || task.status === 'waiting' ? (
                        <button
                          className="button"
                          type="button"
                          disabled={busy}
                          onClick={() => void changeTask(task, 'complete')}
                        >
                          <Check aria-hidden="true" size={15} /> Complete
                        </button>
                      ) : null}
                      {task.status === 'active' ? (
                        <button
                          className="button"
                          type="button"
                          disabled={busy}
                          onClick={() => void changeTask(task, 'wait')}
                        >
                          <Hourglass aria-hidden="true" size={15} /> Move to Waiting
                        </button>
                      ) : null}
                      {task.status === 'active' || task.status === 'waiting' ? (
                        <button
                          className="button"
                          type="button"
                          disabled={busy}
                          onClick={() => void changeTask(task, 'cancel')}
                        >
                          <Ban aria-hidden="true" size={15} /> Cancel task
                        </button>
                      ) : null}
                      {task.status === 'waiting' || task.status === 'cancelled' ? (
                        <button
                          className="button"
                          type="button"
                          disabled={busy}
                          onClick={() => void changeTask(task, 'restore')}
                        >
                          <RotateCcw aria-hidden="true" size={15} /> Restore to Active
                        </button>
                      ) : null}
                      {task.status === 'completed' ? (
                        <button
                          className="button"
                          type="button"
                          disabled={busy}
                          onClick={() => void changeTask(task, 'reopen')}
                        >
                          <RotateCcw aria-hidden="true" size={15} /> Reopen task
                        </button>
                      ) : null}
                      {busy ? <span role="status">Updating…</span> : null}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={styles.emptyState}>No Next Step Tasks are linked to this Reflection.</p>
        )}
      </section>

      {statusMessage ? (
        <p className={styles.statusMessage} role="status">
          {statusMessage}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          <X aria-hidden="true" size={16} /> {error}
        </p>
      ) : null}
    </section>
  );
}

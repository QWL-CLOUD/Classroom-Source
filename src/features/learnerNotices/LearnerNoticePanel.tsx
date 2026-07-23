import {
  Archive,
  CheckCircle2,
  ClipboardList,
  Edit3,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';

import { classroomDb } from '@/data/db/ClassroomDatabase';
import type {
  LearnerContext,
  LearnerNotice,
  LearnerNoticeKind,
  LearnerServiceOccurrence,
} from '@/domain/models/entities';
import { CategoryAssignmentFields } from '@/features/categories/CategoryAssignmentFields';
import type { CategorySelectionMap } from '@/features/categories/categoryAssignmentSelection';
import { useCategorySelectionDraft } from '@/features/categories/useCategorySelectionDraft';
import { ReminderPanel } from '@/features/reminders/ReminderPanel';
import { formatShortDate, todayLocalDate } from '@/shared/dates/localDate';

import {
  learnerNoticeMutationService,
  type LearnerNoticeEditorValues,
} from './learnerNoticeMutationService';
import {
  learnerNoticeKindLabel,
  learnerNoticeStatusLabel,
  selectLearnerNoticeView,
  type LearnerNoticeView,
} from './learnerNoticeReadModel';
import { formatLearnerServiceRecurrence } from './learnerServiceRecurrence';
import styles from './LearnerNoticePanel.module.css';

const weekdayChoices = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
] as const;

interface NoticeFormState {
  kind: LearnerNoticeKind;
  title: string;
  details: string;
  noticeDate: string;
  serviceRepeats: boolean;
  serviceWeekdays: number[];
  serviceStartsOn: string;
  serviceEndsOn: string;
  serviceStartTime: string;
  serviceEndTime: string;
  createFollowUpTask: boolean;
  followUpScheduledDate: string;
}

interface NoticeFormProps {
  contextId: string;
  initial?: LearnerNotice;
  defaultDate?: string;
  submitLabel: string;
  busy: boolean;
  allowFollowUp: boolean;
  onCancel: () => void;
  onSubmit: (
    values: LearnerNoticeEditorValues & {
      contextId: string;
      createFollowUpTask?: boolean;
      followUpScheduledDate?: string;
    },
    categorySelections: CategorySelectionMap,
  ) => Promise<unknown>;
}

function minuteToInput(minute: number | undefined, fallback: string): string {
  if (minute === undefined) return fallback;
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(
    2,
    '0',
  )}`;
}

function inputToMinute(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

function initialFormState(initial?: LearnerNotice, defaultDate?: string): NoticeFormState {
  const recurrence = initial?.serviceRecurrence;
  const fallbackDate = defaultDate ?? todayLocalDate();
  return {
    kind: initial?.kind ?? 'ongoing-support',
    title: initial?.title ?? '',
    details: initial?.details ?? '',
    noticeDate: initial?.noticeDate ?? fallbackDate,
    serviceRepeats: Boolean(recurrence),
    serviceWeekdays: recurrence?.weekdays ?? [2],
    serviceStartsOn: recurrence?.startsOn ?? fallbackDate,
    serviceEndsOn: recurrence?.endsOn ?? '',
    serviceStartTime: minuteToInput(recurrence?.startMinute, '10:00'),
    serviceEndTime: minuteToInput(recurrence?.endMinute, '10:30'),
    createFollowUpTask: false,
    followUpScheduledDate: initial?.noticeDate ?? recurrence?.startsOn ?? fallbackDate,
  };
}

function NoticeForm({
  contextId,
  initial,
  defaultDate,
  submitLabel,
  busy,
  allowFollowUp,
  onCancel,
  onSubmit,
}: NoticeFormProps) {
  const id = useId();
  const [values, setValues] = useState(() => initialFormState(initial, defaultDate));
  const [error, setError] = useState<string | null>(null);
  const categoryDraft = useCategorySelectionDraft('learner-notice', initial?.id);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    try {
      const serviceRecurrence =
        values.kind === 'learner-service' && values.serviceRepeats
          ? {
              frequency: 'weekly' as const,
              weekdays: values.serviceWeekdays,
              startsOn: values.serviceStartsOn,
              endsOn: values.serviceEndsOn || undefined,
              startMinute: inputToMinute(values.serviceStartTime),
              endMinute: inputToMinute(values.serviceEndTime),
            }
          : undefined;
      await onSubmit(
        {
          contextId,
          kind: values.kind,
          title: values.title,
          details: values.details,
          noticeDate: values.kind === 'date-specific-notice' ? values.noticeDate : undefined,
          serviceRecurrence,
          createFollowUpTask: allowFollowUp ? values.createFollowUpTask : false,
          followUpScheduledDate:
            allowFollowUp && values.createFollowUpTask
              ? values.followUpScheduledDate || undefined
              : undefined,
        },
        categoryDraft.selections,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Learner notice could not be saved.');
    }
  }

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <div className={styles.formGrid}>
        <label htmlFor={`${id}-kind`}>
          <span>Record type</span>
          <select
            id={`${id}-kind`}
            value={values.kind}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                kind: event.target.value as LearnerNoticeKind,
              }))
            }
          >
            <option value="ongoing-support">Ongoing Support</option>
            <option value="date-specific-notice">Date-specific Notice</option>
            <option value="learner-service">Learner Service</option>
          </select>
        </label>

        {values.kind === 'date-specific-notice' ? (
          <label htmlFor={`${id}-notice-date`}>
            <span>Notice date</span>
            <input
              id={`${id}-notice-date`}
              type="date"
              value={values.noticeDate}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  noticeDate: event.target.value,
                }))
              }
              required
            />
          </label>
        ) : null}
      </div>

      {values.kind === 'learner-service' ? (
        <fieldset className={styles.recurrenceGroup}>
          <legend>Service schedule</legend>
          <label className={styles.checkboxLabel} htmlFor={`${id}-service-repeat`}>
            <input
              id={`${id}-service-repeat`}
              type="checkbox"
              checked={values.serviceRepeats}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  serviceRepeats: event.target.checked,
                }))
              }
            />
            <span>Repeat weekly</span>
          </label>

          {values.serviceRepeats ? (
            <>
              <fieldset className={styles.weekdayGroup}>
                <legend>Service days</legend>
                <div className={styles.weekdayGrid}>
                  {weekdayChoices.map((weekday) => (
                    <label className={styles.checkboxLabel} key={weekday.value}>
                      <input
                        type="checkbox"
                        checked={values.serviceWeekdays.includes(weekday.value)}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            serviceWeekdays: event.target.checked
                              ? [...current.serviceWeekdays, weekday.value].sort()
                              : current.serviceWeekdays.filter((value) => value !== weekday.value),
                          }))
                        }
                      />
                      <span>{weekday.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className={styles.formGrid}>
                <label htmlFor={`${id}-service-start-date`}>
                  <span>Starts</span>
                  <input
                    id={`${id}-service-start-date`}
                    type="date"
                    value={values.serviceStartsOn}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        serviceStartsOn: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <label htmlFor={`${id}-service-end-date`}>
                  <span>Ends</span>
                  <input
                    id={`${id}-service-end-date`}
                    type="date"
                    value={values.serviceEndsOn}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        serviceEndsOn: event.target.value,
                      }))
                    }
                  />
                </label>
                <label htmlFor={`${id}-service-start-time`}>
                  <span>Start time</span>
                  <input
                    id={`${id}-service-start-time`}
                    type="time"
                    value={values.serviceStartTime}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        serviceStartTime: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <label htmlFor={`${id}-service-end-time`}>
                  <span>End time</span>
                  <input
                    id={`${id}-service-end-time`}
                    type="time"
                    value={values.serviceEndTime}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        serviceEndTime: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
              </div>
            </>
          ) : (
            <p className={styles.recurrenceHint}>
              Without recurrence, this service keeps the existing open-ended behavior and appears in
              Students to Notice every day.
            </p>
          )}
        </fieldset>
      ) : null}

      <label htmlFor={`${id}-title`}>
        <span>Title</span>
        <input
          id={`${id}-title`}
          value={values.title}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              title: event.target.value,
            }))
          }
          required
        />
      </label>

      <label htmlFor={`${id}-details`}>
        <span>Details</span>
        <textarea
          id={`${id}-details`}
          rows={4}
          value={values.details}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              details: event.target.value,
            }))
          }
        />
      </label>

      {allowFollowUp ? (
        <div className={styles.followUpGroup}>
          <label className={styles.checkboxLabel} htmlFor={`${id}-follow-up`}>
            <input
              id={`${id}-follow-up`}
              type="checkbox"
              checked={values.createFollowUpTask}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  createFollowUpTask: event.target.checked,
                }))
              }
            />
            <span>Create a separate follow-up Task</span>
          </label>
          {values.createFollowUpTask ? (
            <label htmlFor={`${id}-follow-up-date`}>
              <span>Task scheduled date</span>
              <input
                id={`${id}-follow-up-date`}
                type="date"
                value={values.followUpScheduledDate}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    followUpScheduledDate: event.target.value,
                  }))
                }
              />
            </label>
          ) : null}
        </div>
      ) : null}

      <CategoryAssignmentFields
        snapshot={categoryDraft.snapshot}
        selectedSets={categoryDraft.selectedSets}
        disabled={busy}
        onToggle={categoryDraft.toggle}
      />

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.formActions}>
        <button
          className="button button-primary"
          type="submit"
          disabled={busy || !values.title.trim()}
        >
          {submitLabel}
        </button>
        <button className="button button-quiet" type="button" onClick={onCancel} disabled={busy}>
          <X size={15} aria-hidden="true" /> Cancel
        </button>
      </div>
    </form>
  );
}

function NoticeCard({
  notice,
  followUpCount,
  occurrences,
  onBusy,
}: {
  notice: LearnerNotice;
  followUpCount: number;
  occurrences: LearnerServiceOccurrence[];
  onBusy: (action: () => Promise<unknown>) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);

  async function checkDelete(): Promise<void> {
    const impact = await learnerNoticeMutationService.previewDelete(notice.id);
    if (!impact.canDelete) {
      const linked = [
        impact.reminders ? `${impact.reminders} reminder${impact.reminders === 1 ? '' : 's'}` : '',
        impact.followUpTasks
          ? `${impact.followUpTasks} follow-up task${impact.followUpTasks === 1 ? '' : 's'}`
          : '',
        impact.serviceOccurrences
          ? `${impact.serviceOccurrences} service occurrence${
              impact.serviceOccurrences === 1 ? '' : 's'
            }`
          : '',
      ].filter(Boolean);
      setDeleteMessage(`Delete is blocked: ${linked.join(' and ')} are linked.`);
      setConfirmingDelete(false);
      return;
    }
    setDeleteMessage(
      'No linked reminders, follow-up Tasks, or service occurrences were found. Confirm permanent deletion.',
    );
    setConfirmingDelete(true);
  }

  return (
    <li>
      <article className={styles.noticeCard} aria-label={`${notice.title} learner notice`}>
        {editing ? (
          <NoticeForm
            contextId={notice.contextId}
            initial={notice}
            submitLabel="Save notice"
            busy={false}
            allowFollowUp={false}
            onCancel={() => setEditing(false)}
            onSubmit={async (values, categorySelections) => {
              const saved = await onBusy(() =>
                learnerNoticeMutationService.update(notice.id, values, categorySelections),
              );
              if (saved) setEditing(false);
            }}
          />
        ) : (
          <>
            <div className={styles.cardHeading}>
              <div>
                <span className={styles.kindBadge}>{learnerNoticeKindLabel(notice.kind)}</span>
                <span className={styles.statusBadge} data-status={notice.status}>
                  {learnerNoticeStatusLabel(notice.status)}
                </span>
                <h3>{notice.title}</h3>
              </div>
              <button
                className={styles.iconButton}
                type="button"
                aria-label={`Edit ${notice.title}`}
                onClick={() => setEditing(true)}
              >
                <Edit3 size={16} aria-hidden="true" />
              </button>
            </div>

            {notice.noticeDate ? (
              <p className={styles.date}>For {formatShortDate(notice.noticeDate)}</p>
            ) : null}
            {notice.serviceRecurrence ? (
              <p className={styles.recurrenceSummary}>
                {formatLearnerServiceRecurrence(notice.serviceRecurrence)}
              </p>
            ) : null}
            {notice.details ? <p className={styles.details}>{notice.details}</p> : null}
            {followUpCount > 0 ? (
              <p className={styles.linkedTaskNote}>
                {followUpCount} linked follow-up Task
                {followUpCount === 1 ? '' : 's'} · <a href="#/tasks">Open Tasks</a>
              </p>
            ) : null}

            {occurrences.length > 0 ? (
              <details className={styles.occurrenceHistory}>
                <summary>Occurrence history ({occurrences.length})</summary>
                <ul>
                  {occurrences.map((occurrence) => (
                    <li key={occurrence.id}>
                      <span>
                        {formatShortDate(occurrence.date)} ·{' '}
                        {occurrence.status === 'completed' ? 'Completed' : 'Cancelled'}
                      </span>
                      <button
                        className="button button-quiet"
                        type="button"
                        onClick={() =>
                          void onBusy(() =>
                            learnerNoticeMutationService.restoreOccurrence(
                              notice.id,
                              occurrence.date,
                            ),
                          )
                        }
                      >
                        Restore occurrence
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            <ReminderPanel
              sourceType="learner-notice"
              sourceId={notice.id}
              sourceTitle={notice.title}
              defaultDate={
                notice.noticeDate ?? notice.serviceRecurrence?.startsOn ?? todayLocalDate()
              }
              defaultMinute={notice.serviceRecurrence?.startMinute ?? 9 * 60}
            />

            {deleteMessage ? (
              <p className={confirmingDelete ? styles.warning : styles.error} role="alert">
                {deleteMessage}
              </p>
            ) : null}

            <div className={styles.actions}>
              {notice.status === 'active' ? (
                <button
                  className="button"
                  type="button"
                  onClick={() => void onBusy(() => learnerNoticeMutationService.resolve(notice.id))}
                >
                  <CheckCircle2 size={15} aria-hidden="true" /> Resolve
                </button>
              ) : (
                <button
                  className="button"
                  type="button"
                  onClick={() => void onBusy(() => learnerNoticeMutationService.reopen(notice.id))}
                >
                  <RotateCcw size={15} aria-hidden="true" /> Reopen
                </button>
              )}

              {notice.status !== 'archived' ? (
                <button
                  className="button"
                  type="button"
                  onClick={() => void onBusy(() => learnerNoticeMutationService.archive(notice.id))}
                >
                  <Archive size={15} aria-hidden="true" /> Archive
                </button>
              ) : null}

              {!confirmingDelete ? (
                <button
                  className="button button-quiet"
                  type="button"
                  onClick={() => void checkDelete()}
                >
                  <Trash2 size={15} aria-hidden="true" /> Check delete safety
                </button>
              ) : (
                <div
                  className={styles.deleteConfirm}
                  role="group"
                  aria-label={`Delete ${notice.title}`}
                >
                  <button
                    className="button"
                    type="button"
                    onClick={() => {
                      setConfirmingDelete(false);
                      setDeleteMessage(null);
                    }}
                  >
                    Keep
                  </button>
                  <button
                    className="button"
                    type="button"
                    onClick={() =>
                      void onBusy(() => learnerNoticeMutationService.delete(notice.id))
                    }
                  >
                    Confirm delete
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </article>
    </li>
  );
}

export function LearnerNoticePanel({ context }: { context: LearnerContext }) {
  const [view, setView] = useState<LearnerNoticeView>('active');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const data = useLiveQuery(async () => {
    const [notices, tasks, occurrences] = await Promise.all([
      classroomDb.learnerNotices.where('contextId').equals(context.id).toArray(),
      classroomDb.tasks.filter((task) => task.linkedEntityType === 'learner-notice').toArray(),
      classroomDb.learnerServiceOccurrences.toArray(),
    ]);
    const noticeIds = new Set(notices.map((notice) => notice.id));
    return {
      notices,
      tasks,
      occurrences: occurrences
        .filter((occurrence) => noticeIds.has(occurrence.learnerNoticeId))
        .sort(
          (first, second) =>
            second.date.localeCompare(first.date) ||
            second.updatedAt.localeCompare(first.updatedAt),
        ),
    };
  }, [context.id]);

  const visible = useMemo(() => selectLearnerNoticeView(data?.notices ?? [], view), [data, view]);
  const counts = useMemo(
    () => ({
      active: (data?.notices ?? []).filter((notice) => notice.status === 'active').length,
      history: (data?.notices ?? []).filter((notice) => notice.status !== 'active').length,
    }),
    [data],
  );

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Learner notice action failed.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={`card ${styles.panel}`}
      role="region"
      aria-label={`Support and notices for ${context.name}`}
    >
      <div className={styles.heading}>
        <div>
          <p className="page-eyebrow">Learner support</p>
          <h2>Support & Notices</h2>
        </div>
        {context.status === 'active' && !creating ? (
          <button className="button button-primary" type="button" onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden="true" /> New record
          </button>
        ) : null}
      </div>

      <p className={styles.intro}>
        Ongoing Support, date-specific Notices, and Learner Services remain connected to this
        learner context.
      </p>

      {context.status === 'archived' ? (
        <p className={styles.warning} role="status">
          Restore this context before adding a new support or notice record.
        </p>
      ) : null}

      {creating ? (
        <NoticeForm
          contextId={context.id}
          defaultDate={todayLocalDate()}
          submitLabel="Create record"
          busy={busy}
          allowFollowUp
          onCancel={() => setCreating(false)}
          onSubmit={async (values, categorySelections) => {
            const saved = await run(() =>
              learnerNoticeMutationService.create(values, categorySelections),
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

      <div className={styles.tabs} role="tablist" aria-label="Learner support views">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'active'}
          onClick={() => setView('active')}
        >
          Active <span>{counts.active}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'history'}
          onClick={() => setView('history')}
        >
          History <span>{counts.history}</span>
        </button>
      </div>

      {data === undefined ? (
        <p className={styles.message}>Loading learner support records…</p>
      ) : visible.length === 0 ? (
        <div className={styles.empty} role="status">
          <ClipboardList size={24} aria-hidden="true" />
          <p>
            {view === 'active'
              ? 'No active support or notice records.'
              : 'No resolved or archived records.'}
          </p>
        </div>
      ) : (
        <ul
          className={styles.list}
          aria-label={`${
            view === 'active' ? 'Active' : 'History'
          } support and notices for ${context.name}`}
        >
          {visible.map((notice) => (
            <NoticeCard
              key={notice.id}
              notice={notice}
              followUpCount={
                (data.tasks ?? []).filter((task) => task.linkedEntityId === notice.id).length
              }
              occurrences={(data.occurrences ?? []).filter(
                (occurrence) => occurrence.learnerNoticeId === notice.id,
              )}
              onBusy={run}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

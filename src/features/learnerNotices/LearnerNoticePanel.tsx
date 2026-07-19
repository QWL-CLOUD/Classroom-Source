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
import type { LearnerContext, LearnerNotice, LearnerNoticeKind } from '@/domain/models/entities';
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
import styles from './LearnerNoticePanel.module.css';

interface NoticeFormState {
  kind: LearnerNoticeKind;
  title: string;
  details: string;
  noticeDate: string;
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
  ) => Promise<void>;
}

function initialFormState(initial?: LearnerNotice, defaultDate?: string): NoticeFormState {
  return {
    kind: initial?.kind ?? 'ongoing-support',
    title: initial?.title ?? '',
    details: initial?.details ?? '',
    noticeDate: initial?.noticeDate ?? defaultDate ?? '',
    createFollowUpTask: false,
    followUpScheduledDate: initial?.noticeDate ?? defaultDate ?? '',
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
  const [values, setValues] = useState<NoticeFormState>(() =>
    initialFormState(initial, defaultDate),
  );
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    try {
      await onSubmit({
        contextId,
        kind: values.kind,
        title: values.title,
        details: values.details,
        noticeDate: values.kind === 'date-specific-notice' ? values.noticeDate : undefined,
        createFollowUpTask: allowFollowUp ? values.createFollowUpTask : false,
        followUpScheduledDate:
          allowFollowUp && values.createFollowUpTask
            ? values.followUpScheduledDate || undefined
            : undefined,
      });
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
          <label htmlFor={`${id}-date`}>
            <span>Notice date</span>
            <input
              id={`${id}-date`}
              type="date"
              value={values.noticeDate}
              onChange={(event) =>
                setValues((current) => ({ ...current, noticeDate: event.target.value }))
              }
              required
            />
          </label>
        ) : null}
      </div>
      <label htmlFor={`${id}-title`}>
        <span>Title</span>
        <input
          id={`${id}-title`}
          value={values.title}
          maxLength={240}
          onChange={(event) => setValues((current) => ({ ...current, title: event.target.value }))}
          required
        />
      </label>
      <label htmlFor={`${id}-details`}>
        <span>Details</span>
        <textarea
          id={`${id}-details`}
          rows={4}
          value={values.details}
          maxLength={5000}
          onChange={(event) =>
            setValues((current) => ({ ...current, details: event.target.value }))
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
  onBusy,
}: {
  notice: LearnerNotice;
  followUpCount: number;
  onBusy: (action: () => Promise<unknown>) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);

  async function checkDelete(): Promise<void> {
    const impact = await learnerNoticeMutationService.previewDelete(notice.id);
    if (!impact.canDelete) {
      setDeleteMessage(
        `Delete is blocked: ${impact.reminders} reminder${impact.reminders === 1 ? '' : 's'} and ${impact.followUpTasks} follow-up task${impact.followUpTasks === 1 ? '' : 's'} are linked.`,
      );
      setConfirmingDelete(false);
      return;
    }
    setDeleteMessage(
      'No linked reminders or follow-up Tasks were found. Confirm permanent deletion.',
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
            onSubmit={async (values) => {
              const saved = await onBusy(() =>
                learnerNoticeMutationService.update(notice.id, values),
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
            {notice.details ? <p className={styles.details}>{notice.details}</p> : null}
            {followUpCount > 0 ? (
              <p className={styles.linkedTaskNote}>
                {followUpCount} linked follow-up Task{followUpCount === 1 ? '' : 's'} ·{' '}
                <a href="#/tasks">Open Tasks</a>
              </p>
            ) : null}

            <ReminderPanel
              sourceType="learner-notice"
              sourceId={notice.id}
              sourceTitle={notice.title}
              defaultDate={notice.noticeDate ?? todayLocalDate()}
              defaultMinute={9 * 60}
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
    const [notices, tasks] = await Promise.all([
      classroomDb.learnerNotices.where('contextId').equals(context.id).toArray(),
      classroomDb.tasks.filter((task) => task.linkedEntityType === 'learner-notice').toArray(),
    ]);
    return { notices, tasks };
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
          <h2>Support &amp; Notices</h2>
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
          onSubmit={async (values) => {
            const saved = await run(() => learnerNoticeMutationService.create(values));
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
          aria-label={`${view === 'active' ? 'Active' : 'History'} support and notices for ${context.name}`}
        >
          {visible.map((notice) => (
            <NoticeCard
              key={notice.id}
              notice={notice}
              followUpCount={
                (data.tasks ?? []).filter((task) => task.linkedEntityId === notice.id).length
              }
              onBusy={run}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

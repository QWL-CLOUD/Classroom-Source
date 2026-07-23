import { Ban, CheckCircle2, Plus } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';

import { classroomDb } from '@/data/db/ClassroomDatabase';
import type { LearnerContext } from '@/domain/models/entities';
import { formatShortDate } from '@/shared/dates/localDate';

import { learnerNoticeMutationService } from './learnerNoticeMutationService';
import { learnerNoticeKindLabel, selectTodayLearnerNotices } from './learnerNoticeReadModel';
import { formatLearnerServiceTime } from './learnerServiceRecurrence';
import styles from './TodayLearnerNoticeList.module.css';

export function TodayLearnerNoticeList({ selectedDate }: { selectedDate: string }) {
  const [contextId, setContextId] = useState('');
  const [title, setTitle] = useState('');
  const [createFollowUpTask, setCreateFollowUpTask] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const data = useLiveQuery(async () => {
    const [contexts, notices, occurrences] = await Promise.all([
      classroomDb.learnerContexts.where('status').equals('active').toArray(),
      classroomDb.learnerNotices.toArray(),
      classroomDb.learnerServiceOccurrences.toArray(),
    ]);
    const activeContextIds = new Set(contexts.map((context) => context.id));
    return {
      contexts: contexts.sort(
        (first, second) =>
          first.name.localeCompare(second.name) || first.id.localeCompare(second.id),
      ),
      notices: selectTodayLearnerNotices(
        notices.filter((notice) => activeContextIds.has(notice.contextId)),
        selectedDate,
        occurrences,
      ),
    };
  }, [selectedDate]);

  const contextById = useMemo(
    () => new Map((data?.contexts ?? []).map((context) => [context.id, context] as const)),
    [data?.contexts],
  );

  async function run(action: () => Promise<unknown>): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Learner notice action failed.');
    } finally {
      setBusy(false);
    }
  }

  async function addNotice(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!contextId || !title.trim() || busy) return;
    await run(async () => {
      await learnerNoticeMutationService.create({
        contextId,
        kind: 'date-specific-notice',
        title,
        noticeDate: selectedDate,
        createFollowUpTask,
        followUpScheduledDate: createFollowUpTask ? selectedDate : undefined,
      });
      setTitle('');
      setCreateFollowUpTask(false);
    });
  }

  if (!data) {
    return <p className={styles.message}>Loading learner notices…</p>;
  }

  return (
    <div className={styles.wrapper} role="region" aria-label="Students to notice workspace">
      {data.contexts.length > 0 ? (
        <form className={styles.quickForm} onSubmit={(event) => void addNotice(event)}>
          <label>
            <span>Learner context</span>
            <select
              value={contextId}
              onChange={(event) => setContextId(event.target.value)}
              required
            >
              <option value="">Choose a Class, Group, or Individual</option>
              {data.contexts.map((context: LearnerContext) => (
                <option key={context.id} value={context.id}>
                  {context.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Notice</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What should you notice today?"
              maxLength={240}
              required
            />
          </label>

          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={createFollowUpTask}
              onChange={(event) => setCreateFollowUpTask(event.target.checked)}
            />
            <span>Create a separate follow-up Task</span>
          </label>

          <button className="button" type="submit" disabled={busy || !contextId || !title.trim()}>
            <Plus size={16} aria-hidden="true" /> Add notice
          </button>
        </form>
      ) : (
        <p className={styles.message}>Add an active learner context before creating a notice.</p>
      )}

      <p className={styles.rule}>
        Today shows active Ongoing Support, recurring Learner Services scheduled for this date, and
        date-specific Notices for {formatShortDate(selectedDate)}.
      </p>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {data.notices.length === 0 ? (
        <p className={styles.message}>No active learner notices for this date.</p>
      ) : (
        <ul className={styles.list} aria-label={`Learner notices for ${selectedDate}`}>
          {data.notices.map((notice) => {
            const context = contextById.get(notice.contextId);
            const recurringService = notice.kind === 'learner-service' && notice.serviceRecurrence;
            return (
              <li key={notice.id}>
                <div>
                  <span>{learnerNoticeKindLabel(notice.kind)}</span>
                  <strong>{notice.title}</strong>
                  <small>{context?.name ?? 'Unavailable learner context'}</small>
                  {recurringService ? (
                    <small className={styles.serviceTime}>
                      {formatLearnerServiceTime(notice.serviceRecurrence!)}
                    </small>
                  ) : null}
                </div>

                <div className={styles.actions}>
                  {context ? (
                    <a
                      className="button button-quiet"
                      href={`#/learners?context=${encodeURIComponent(context.id)}&support=active`}
                    >
                      Open learner
                    </a>
                  ) : null}

                  {recurringService ? (
                    <>
                      <button
                        className="button"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            learnerNoticeMutationService.completeOccurrence(
                              notice.id,
                              selectedDate,
                            ),
                          )
                        }
                      >
                        <CheckCircle2 size={15} aria-hidden="true" /> Complete service
                      </button>
                      <button
                        className="button button-quiet"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            learnerNoticeMutationService.cancelOccurrence(notice.id, selectedDate),
                          )
                        }
                      >
                        <Ban size={15} aria-hidden="true" /> Cancel service
                      </button>
                      <button
                        className="button button-quiet"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(() => learnerNoticeMutationService.resolve(notice.id))
                        }
                      >
                        Resolve series
                      </button>
                    </>
                  ) : (
                    <button
                      className="button button-quiet"
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(() => learnerNoticeMutationService.resolve(notice.id))
                      }
                    >
                      <CheckCircle2 size={15} aria-hidden="true" /> Resolve
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

import {
  AlertTriangle,
  Archive,
  BookOpen,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Clock3,
  Layers3,
  Pencil,
  RotateCcw,
  Save,
  Trash2,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ZodError } from 'zod';

import type { LearnerContext } from '@/domain/models/entities';
import type { LearnerPlanningView } from '@/domain/readModels/learnerReadModels';
import {
  learnerContextDeleteImpactItems,
  learnerContextMutationService,
  type LearnerContextDeleteImpact,
} from '@/features/learners/learnerContextMutationService';
import type {
  LearnerLessonSeriesItem,
  LearnerPlanningItem,
} from '@/features/learners/learnerReadModel';
import { formatLessonSeriesPositionLabel } from '@/features/planning/lessonSeriesPresentation';
import { planningMutationService } from '@/features/planning/planningMutationService';
import {
  buildLearnersPageReadModel,
  getLearnerKindLabel,
} from '@/features/learners/learnerReadModel';
import { useLearnersReadModel } from '@/features/learners/useLearnersReadModel';
import { parseLocalDate, todayLocalDate } from '@/shared/dates/localDate';

import styles from './LearnersRoute.module.css';

const planningViewLabels: Record<LearnerPlanningView, string> = {
  upcoming: 'Upcoming',
  unscheduled: 'Unscheduled',
  completed: 'Completed',
  series: 'Series',
};

function isContextStatus(value: string | null): value is LearnerContext['status'] {
  return value === 'active' || value === 'archived';
}

function getContextMutationError(cause: unknown): string {
  if (cause instanceof ZodError) {
    return cause.issues[0]?.message ?? 'Check the learner context details.';
  }
  return cause instanceof Error ? cause.message : 'The learner context could not be updated.';
}

function isPlanningView(value: string | null): value is LearnerPlanningView {
  return (
    value === 'upcoming' || value === 'unscheduled' || value === 'completed' || value === 'series'
  );
}

function contextKindIcon(kind: LearnerContext['kind']): ReactNode {
  if (kind === 'class') return <Users aria-hidden="true" size={18} />;
  if (kind === 'group') return <Layers3 aria-hidden="true" size={18} />;
  return <UserRound aria-hidden="true" size={18} />;
}

function PlanningItemCard({ item }: { item: LearnerPlanningItem }) {
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function removePlan(): Promise<void> {
    if (deleting) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      setDeleteError(null);
      return;
    }

    setDeleting(true);
    setDeleteError(null);
    try {
      await planningMutationService.deletePlan(item.planId, { includeSessions: true });
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : 'The plan could not be deleted.');
      setDeleting(false);
    }
  }

  return (
    <li>
      <article className={styles.planningItem} aria-label={`${item.title}, ${item.stateLabel}`}>
        <div className={styles.itemHeading}>
          <div>
            <span className={styles.stateBadge}>{item.stateLabel}</span>
            <h3>{item.title}</h3>
          </div>
          <div className={styles.itemActions}>
            {item.weekHref ? (
              <a className="button" href={item.weekHref}>
                <CalendarDays aria-hidden="true" size={16} /> View in Week
              </a>
            ) : null}
            {item.calendarHref ? (
              <a className="button" href={item.calendarHref}>
                <CalendarDays aria-hidden="true" size={16} /> View in Calendar
              </a>
            ) : null}
            {item.scheduleHref ? (
              <a className="button button-primary" href={item.scheduleHref}>
                <CalendarPlus aria-hidden="true" size={16} /> Schedule
              </a>
            ) : null}
            {item.sessionHref ? (
              <a className="button" href={item.sessionHref}>
                <CalendarPlus aria-hidden="true" size={16} /> Manage session
              </a>
            ) : null}
            {item.editHref ? (
              <a className="button" href={item.editHref}>
                <Pencil aria-hidden="true" size={16} /> Edit plan
              </a>
            ) : null}
            <button
              className={deleteArmed ? styles.deleteConfirmButton : 'button'}
              type="button"
              disabled={deleting}
              onClick={() => void removePlan()}
            >
              <Trash2 aria-hidden="true" size={16} />
              {deleting
                ? 'Deleting…'
                : deleteArmed
                  ? item.sourceType === 'session'
                    ? 'Confirm delete plan and session'
                    : 'Confirm delete plan'
                  : 'Delete plan'}
            </button>
          </div>
        </div>

        {deleteArmed ? (
          <div className={styles.deleteNotice} role="alert">
            <strong>Delete “{item.title}”?</strong>
            <span>
              {item.sourceType === 'session'
                ? `Its ${item.stateLabel.toLowerCase()} session will also be removed from Today, Week, and Calendar.`
                : 'The unscheduled planning item will be removed.'}{' '}
              You can undo the entire deletion.
            </span>
            <button className="button" type="button" onClick={() => setDeleteArmed(false)}>
              Keep plan
            </button>
          </div>
        ) : null}

        {deleteError ? (
          <p className={styles.deleteError} role="alert">
            {deleteError}
          </p>
        ) : null}

        {item.subject ? <p className={styles.subject}>{item.subject}</p> : null}
        {item.seriesTitle && item.seriesPositionLabel ? (
          <p className={styles.seriesSummary}>
            <Layers3 aria-hidden="true" size={15} />
            <span>
              {formatLessonSeriesPositionLabel(item.seriesPositionLabel, item.seriesTitle)}
            </span>
          </p>
        ) : null}
        {item.contentSummary ? (
          <p className={styles.contentSummary}>
            <BookOpen aria-hidden="true" size={15} />
            <span>{item.contentSummary}</span>
            {item.contentSourceLabel ? <strong>{item.contentSourceLabel}</strong> : null}
          </p>
        ) : null}
        {item.dateLabel && item.timeLabel ? (
          <p className={styles.sessionTime}>
            <CalendarDays aria-hidden="true" size={15} />
            <span>{item.dateLabel}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={`${item.date}T00:00`}>{item.timeLabel}</time>
          </p>
        ) : (
          <p className={styles.unscheduledNote}>
            <BookOpen aria-hidden="true" size={15} /> No date or time assigned
          </p>
        )}
      </article>
    </li>
  );
}

function LessonSeriesCard({ item }: { item: LearnerLessonSeriesItem }) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rename(): Promise<void> {
    if (saving) return;
    if (!renaming) {
      setRenaming(true);
      setDeleteArmed(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await planningMutationService.renameLessonSeries(item.id, title);
      setRenaming(false);
      setSaving(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The lesson series could not be renamed.');
      setSaving(false);
    }
  }

  async function toggleArchive(): Promise<void> {
    if (saving) return;
    setSaving(true);
    setError(null);
    setDeleteArmed(false);
    try {
      if (item.lifecycleState === 'archived') {
        await planningMutationService.restoreLessonSeries(item.id);
      } else {
        await planningMutationService.archiveLessonSeries(item.id);
      }
      setSaving(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The lesson series could not be updated.');
      setSaving(false);
    }
  }

  async function remove(): Promise<void> {
    if (saving) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      setRenaming(false);
      setError(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await planningMutationService.deleteLessonSeries(item.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The lesson series could not be deleted.');
      setSaving(false);
    }
  }

  return (
    <li>
      <article
        className={styles.seriesItem}
        aria-label={`${item.title}, ${item.lifecycleState === 'archived' ? 'Archived' : 'Active'} lesson series`}
      >
        <div className={styles.itemHeading}>
          <div>
            <span className={styles.stateBadge}>
              {item.lifecycleState === 'archived' ? 'Archived' : 'Active'}
            </span>
            {renaming ? (
              <label className={styles.renameField}>
                <span>Series title</span>
                <input
                  value={title}
                  autoFocus
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setError(null);
                  }}
                />
              </label>
            ) : (
              <h3>{item.title}</h3>
            )}
          </div>
          <div className={styles.itemActions}>
            <button
              className="button"
              type="button"
              disabled={saving}
              onClick={() => void rename()}
            >
              {renaming ? (
                <Save aria-hidden="true" size={16} />
              ) : (
                <Pencil aria-hidden="true" size={16} />
              )}
              {renaming ? 'Save name' : 'Rename'}
            </button>
            {renaming ? (
              <button
                className="button"
                type="button"
                disabled={saving}
                onClick={() => {
                  setRenaming(false);
                  setTitle(item.title);
                  setError(null);
                }}
              >
                <X aria-hidden="true" size={16} /> Cancel
              </button>
            ) : null}
            <button
              className="button"
              type="button"
              disabled={saving}
              onClick={() => void toggleArchive()}
            >
              {item.lifecycleState === 'archived' ? (
                <RotateCcw aria-hidden="true" size={16} />
              ) : (
                <Archive aria-hidden="true" size={16} />
              )}
              {item.lifecycleState === 'archived' ? 'Restore' : 'Archive'}
            </button>
            <button
              className={deleteArmed ? styles.deleteConfirmButton : 'button'}
              type="button"
              disabled={saving}
              onClick={() => void remove()}
            >
              <Trash2 aria-hidden="true" size={16} />
              {deleteArmed ? 'Confirm delete series' : 'Delete series'}
            </button>
          </div>
        </div>

        {item.subject ? <p className={styles.subject}>{item.subject}</p> : null}
        <div className={styles.seriesMetrics} aria-label="Lesson series linked record counts">
          <span>{item.linkedPlanCount} Plans</span>
          <span>{item.unscheduledPlanCount} Unscheduled</span>
          <span>{item.scheduledSessionCount} Scheduled</span>
          <span>{item.completedSessionCount} Completed</span>
        </div>

        {deleteArmed ? (
          <div className={styles.deleteNotice} role="alert">
            <strong>Delete Series “{item.title}”?</strong>
            <span>
              {item.linkedPlanCount} linked Plan{item.linkedPlanCount === 1 ? '' : 's'} will become
              ungrouped. {item.scheduledSessionCount} scheduled and {item.completedSessionCount}{' '}
              completed Session
              {item.scheduledSessionCount + item.completedSessionCount === 1 ? '' : 's'} remain
              unchanged. Teaching history is preserved, and the whole action can be undone.
            </span>
            <button className="button" type="button" onClick={() => setDeleteArmed(false)}>
              Keep series
            </button>
          </div>
        ) : null}

        {error ? (
          <p className={styles.deleteError} role="alert">
            {error}
          </p>
        ) : null}
      </article>
    </li>
  );
}

function LearnerContextLifecycleCard({
  context,
  onStatusChanged,
  onDeleted,
}: {
  context: LearnerContext;
  onStatusChanged: (status: LearnerContext['status']) => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(() => ({
    name: context.name,
    preferredName: context.preferredName ?? '',
    notes: context.notes ?? '',
  }));
  const [saving, setSaving] = useState(false);
  const [deleteImpact, setDeleteImpact] = useState<LearnerContextDeleteImpact | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetDeleteState(): void {
    setDeleteImpact(null);
    setDeleteArmed(false);
  }

  async function saveDetails(): Promise<void> {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await learnerContextMutationService.update(context.id, values);
      setValues({
        name: updated.name,
        preferredName: updated.preferredName ?? '',
        notes: updated.notes ?? '',
      });
      setEditing(false);
      setSaving(false);
    } catch (cause) {
      setError(getContextMutationError(cause));
      setSaving(false);
    }
  }

  async function toggleArchive(): Promise<void> {
    if (saving) return;
    setSaving(true);
    setError(null);
    resetDeleteState();
    try {
      const updated =
        context.status === 'active'
          ? await learnerContextMutationService.archive(context.id)
          : await learnerContextMutationService.restore(context.id);
      setSaving(false);
      onStatusChanged(updated.status);
    } catch (cause) {
      setError(getContextMutationError(cause));
      setSaving(false);
    }
  }

  async function remove(): Promise<void> {
    if (saving) return;
    setError(null);
    if (!deleteImpact || !deleteImpact.canDelete) {
      try {
        const impact = await learnerContextMutationService.previewDelete(context.id);
        setDeleteImpact(impact);
        setDeleteArmed(impact.canDelete);
      } catch (cause) {
        setError(getContextMutationError(cause));
      }
      return;
    }
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }

    setSaving(true);
    try {
      await learnerContextMutationService.delete(context.id);
      onDeleted();
    } catch (cause) {
      setError(getContextMutationError(cause));
      setSaving(false);
    }
  }

  const blockingItems = deleteImpact ? learnerContextDeleteImpactItems(deleteImpact) : [];

  return (
    <section className={`card ${styles.contextSummary}`} aria-label={`${context.name} details`}>
      <div className={styles.contextSummaryHeader}>
        <div className={styles.contextIdentity}>
          <span className={styles.contextIconLarge}>{contextKindIcon(context.kind)}</span>
          <div>
            <div className={styles.contextTitleRow}>
              <p className="page-eyebrow">{getLearnerKindLabel(context.kind)} planning</p>
              <span
                className={`${styles.contextStatusBadge} ${
                  context.status === 'archived' ? styles.archivedBadge : ''
                }`}
              >
                {context.status === 'archived' ? 'Archived' : 'Active'}
              </span>
            </div>
            <h2>{context.name}</h2>
            {context.preferredName ? <p>Preferred name: {context.preferredName}</p> : null}
          </div>
        </div>
        <div className={styles.contextActions}>
          <button
            className="button"
            type="button"
            disabled={saving}
            onClick={() => {
              setEditing((current) => !current);
              setValues({
                name: context.name,
                preferredName: context.preferredName ?? '',
                notes: context.notes ?? '',
              });
              setError(null);
              resetDeleteState();
            }}
          >
            {editing ? <X aria-hidden="true" size={16} /> : <Pencil aria-hidden="true" size={16} />}
            {editing ? 'Cancel edit' : 'Edit details'}
          </button>
          <button
            className="button"
            type="button"
            disabled={saving}
            onClick={() => void toggleArchive()}
          >
            {context.status === 'archived' ? (
              <RotateCcw aria-hidden="true" size={16} />
            ) : (
              <Archive aria-hidden="true" size={16} />
            )}
            {context.status === 'archived' ? 'Restore' : 'Archive'}
          </button>
          <button
            className={deleteArmed ? styles.deleteConfirmButton : 'button'}
            type="button"
            disabled={saving}
            onClick={() => void remove()}
          >
            <Trash2 aria-hidden="true" size={16} />
            {saving
              ? 'Working…'
              : deleteArmed
                ? 'Confirm delete empty context'
                : deleteImpact && !deleteImpact.canDelete
                  ? 'Recheck delete safety'
                  : 'Check delete safety'}
          </button>
        </div>
      </div>

      {editing ? (
        <div className={styles.contextEditForm}>
          <label>
            <span>Name</span>
            <input
              value={values.name}
              autoFocus
              onChange={(event) => {
                setValues((current) => ({ ...current, name: event.target.value }));
                setError(null);
              }}
            />
          </label>
          <label>
            <span>Preferred name</span>
            <input
              value={values.preferredName}
              onChange={(event) => {
                setValues((current) => ({ ...current, preferredName: event.target.value }));
                setError(null);
              }}
            />
          </label>
          <label className={styles.contextNotesField}>
            <span>Notes</span>
            <textarea
              rows={4}
              value={values.notes}
              onChange={(event) => {
                setValues((current) => ({ ...current, notes: event.target.value }));
                setError(null);
              }}
            />
          </label>
          <div className={styles.contextEditActions}>
            <button
              className="button button-primary"
              type="button"
              disabled={saving}
              onClick={() => void saveDetails()}
            >
              <Save aria-hidden="true" size={16} /> {saving ? 'Saving…' : 'Save details'}
            </button>
          </div>
        </div>
      ) : context.notes ? (
        <p className={styles.contextNotes}>{context.notes}</p>
      ) : null}

      {context.status === 'archived' ? (
        <div className={styles.archivedNotice} role="status">
          <Archive aria-hidden="true" size={18} />
          <span>
            Historical Plans and Sessions remain visible. Restore this context before creating a new
            Plan or scheduling a new Session.
          </span>
        </div>
      ) : null}

      {deleteImpact ? (
        deleteImpact.canDelete ? (
          <div className={styles.deleteNotice} role="alert">
            <strong>
              Delete empty {getLearnerKindLabel(context.kind).toLowerCase()} “{context.name}”?
            </strong>
            <span>
              No linked records were found. Only this learner context will be removed, and the
              action can be undone.
            </span>
            <button
              className="button"
              type="button"
              onClick={() => {
                setDeleteImpact(null);
                setDeleteArmed(false);
              }}
            >
              Keep context
            </button>
          </div>
        ) : (
          <div className={styles.deleteBlockedNotice} role="alert">
            <strong>Delete is blocked to protect teaching history.</strong>
            <span>
              “{context.name}” has {deleteImpact.totalLinkedRecords} linked record
              {deleteImpact.totalLinkedRecords === 1 ? '' : 's'}. Archive the context instead;
              linked records will not be deleted or orphaned.
            </span>
            <div className={styles.linkedRecordCounts} aria-label="Linked record counts">
              {blockingItems.map((item) => (
                <span key={item.label}>
                  {item.count} {item.label}
                </span>
              ))}
            </div>
          </div>
        )
      ) : null}

      {error ? (
        <p className={styles.deleteError} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function emptyPlanningMessage(view: LearnerPlanningView): string {
  if (view === 'upcoming') return 'No upcoming sessions from this date.';
  if (view === 'completed') return 'No completed sessions have been recorded.';
  if (view === 'series') return 'No lesson series have been created for this learner context.';
  return 'No unscheduled lesson plans for this learner context.';
}

export function LearnersRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedContextId = searchParams.get('context') ?? undefined;
  const rawContextStatus = searchParams.get('status');
  const preferredContextStatus: LearnerContext['status'] = isContextStatus(rawContextStatus)
    ? rawContextStatus
    : 'active';
  const rawPlanningView = searchParams.get('planning');
  const planningView: LearnerPlanningView = isPlanningView(rawPlanningView)
    ? rawPlanningView
    : 'upcoming';
  const rawDate = searchParams.get('date');
  const anchorDate = parseLocalDate(rawDate) ? rawDate! : todayLocalDate();
  const state = useLearnersReadModel(requestedContextId, preferredContextStatus);
  const selectedRequestedContext =
    state.status === 'ready' && state.data.selectedContext?.id === requestedContextId
      ? state.data.selectedContext
      : null;
  const contextStatus: LearnerContext['status'] =
    selectedRequestedContext?.status ??
    (isContextStatus(rawContextStatus) ? rawContextStatus : 'active');

  useEffect(() => {
    if (!selectedRequestedContext || rawContextStatus === selectedRequestedContext.status) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('status', selectedRequestedContext.status);
    setSearchParams(nextParams, { replace: true });
  }, [rawContextStatus, searchParams, selectedRequestedContext, setSearchParams]);
  const model = useMemo(
    () =>
      state.status === 'ready'
        ? buildLearnersPageReadModel(state.data, anchorDate, contextStatus)
        : null,
    [anchorDate, contextStatus, state],
  );

  function updateSearchParam(name: string, value: string): void {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set(name, value);
    setSearchParams(nextParams);
  }

  function selectContext(context: LearnerContext): void {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('context', context.id);
    nextParams.set('status', context.status);
    setSearchParams(nextParams);
  }

  function selectContextStatus(status: LearnerContext['status']): void {
    const nextParams = new URLSearchParams(searchParams);
    const nextContext =
      state.status === 'ready'
        ? state.data.contexts.find((context) => context.status === status)
        : undefined;
    nextParams.set('status', status);
    if (nextContext) nextParams.set('context', nextContext.id);
    else nextParams.delete('context');
    setSearchParams(nextParams);
  }

  function keepSelectedContextInStatus(status: LearnerContext['status']): void {
    if (!model?.selectedContext) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('context', model.selectedContext.id);
    nextParams.set('status', status);
    setSearchParams(nextParams);
  }

  function clearDeletedContext(): void {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('context');
    nextParams.set('status', contextStatus);
    setSearchParams(nextParams);
  }

  const planningItems = model
    ? planningView === 'upcoming'
      ? model.upcomingItems
      : planningView === 'unscheduled'
        ? model.unscheduledItems
        : planningView === 'completed'
          ? model.completedItems
          : []
    : [];

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Organize</p>
          <h1 className="page-title">Learners</h1>
          <p className="page-subtitle">
            Classes, Groups, and Individuals share one planning system without a duplicate calendar.
          </p>
        </div>
        {model ? (
          <div className={styles.summary} aria-label="Learner context counts">
            <span>{model.contextCounts.class} Active Classes</span>
            <span>{model.contextCounts.group} Active Groups</span>
            <span>{model.contextCounts.individual} Active Individuals</span>
            <span>{model.contextStatusCounts.archived} Archived</span>
          </div>
        ) : null}
      </header>

      {state.status === 'loading' ? (
        <div className={`card ${styles.statePanel}`} role="status">
          <Clock3 aria-hidden="true" size={24} />
          <p>Loading learner contexts from the v20 database…</p>
        </div>
      ) : null}

      {state.status === 'error' ? (
        <div className={`card ${styles.errorPanel}`} role="alert">
          <AlertTriangle aria-hidden="true" size={24} />
          <div>
            <h2>Learners could not be loaded</h2>
            <p>{state.message}</p>
          </div>
        </div>
      ) : null}

      {state.status === 'ready' && model ? (
        state.data.contexts.length > 0 ? (
          <div className={styles.layout}>
            <section
              className={`card ${styles.contextPanel}`}
              role="region"
              aria-label="Learner contexts"
            >
              <div className={styles.contextPanelHeader}>
                <div>
                  <p className="page-eyebrow">
                    {contextStatus === 'active' ? 'Active contexts' : 'Archived contexts'}
                  </p>
                  <h2>{model.activeSchoolYearLabel}</h2>
                </div>
                <span>{model.contextStatusCounts[contextStatus]}</span>
              </div>

              <div className={styles.lifecycleTabs} role="group" aria-label="Context lifecycle">
                <button
                  className={contextStatus === 'active' ? styles.activeLifecycleTab : ''}
                  type="button"
                  aria-pressed={contextStatus === 'active'}
                  onClick={() => selectContextStatus('active')}
                >
                  Active <span>{model.contextStatusCounts.active}</span>
                </button>
                <button
                  className={contextStatus === 'archived' ? styles.activeLifecycleTab : ''}
                  type="button"
                  aria-pressed={contextStatus === 'archived'}
                  onClick={() => selectContextStatus('archived')}
                >
                  Archived <span>{model.contextStatusCounts.archived}</span>
                </button>
              </div>

              <div className={styles.contextGroups}>
                {model.contextGroups.map((group) => (
                  <section
                    key={`${contextStatus}-${group.kind}`}
                    aria-labelledby={`learner-${contextStatus}-${group.kind}-heading`}
                  >
                    <div className={styles.groupHeading}>
                      <h3 id={`learner-${contextStatus}-${group.kind}-heading`}>{group.label}</h3>
                      <span>{group.contexts.length}</span>
                    </div>
                    {group.contexts.length > 0 ? (
                      <ul className={styles.contextList}>
                        {group.contexts.map((context) => {
                          const selected = context.id === model.selectedContext?.id;
                          return (
                            <li key={context.id}>
                              <button
                                className={`${styles.contextButton} ${
                                  selected ? styles.selectedContext : ''
                                }`}
                                type="button"
                                aria-pressed={selected}
                                aria-label={`Open ${context.name} ${getLearnerKindLabel(
                                  context.kind,
                                ).toLowerCase()}`}
                                onClick={() => selectContext(context)}
                              >
                                <span className={styles.contextIcon}>
                                  {contextKindIcon(context.kind)}
                                </span>
                                <span>
                                  <strong>{context.name}</strong>
                                  <small>
                                    {getLearnerKindLabel(context.kind)}
                                    {context.status === 'archived' ? ' · Archived' : ''}
                                  </small>
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className={styles.emptyGroup}>
                        No {contextStatus} {group.label.toLowerCase()}.
                      </p>
                    )}
                  </section>
                ))}
              </div>
            </section>

            {model.selectedContext ? (
              <section
                className={styles.planningPanel}
                role="region"
                aria-label={`Planning for ${model.selectedContext.name}`}
              >
                <LearnerContextLifecycleCard
                  key={model.selectedContext.id}
                  context={model.selectedContext}
                  onStatusChanged={keepSelectedContextInStatus}
                  onDeleted={clearDeletedContext}
                />

                <section className={`card ${styles.planningWorkspace}`}>
                  <div className={styles.planningHeader}>
                    <div>
                      <p className="page-eyebrow">Planning</p>
                      <h2>{planningViewLabels[planningView]}</h2>
                    </div>
                    <div className={styles.planningActions}>
                      {planningView === 'upcoming' ? (
                        <div className={styles.dateControls}>
                          <label>
                            <span>From</span>
                            <input
                              className="input"
                              type="date"
                              value={anchorDate}
                              onChange={(event) => updateSearchParam('date', event.target.value)}
                            />
                          </label>
                          <button
                            className="button"
                            type="button"
                            onClick={() => updateSearchParam('date', todayLocalDate())}
                          >
                            Today
                          </button>
                        </div>
                      ) : null}
                      {model.selectedContext.status === 'active' ? (
                        <a
                          className="button button-primary"
                          href={`#/planning/edit?context=${encodeURIComponent(model.selectedContext.id)}`}
                        >
                          <CalendarPlus aria-hidden="true" size={16} /> New plan
                        </a>
                      ) : (
                        <span className={styles.archivedPlanRestriction}>
                          Restore this context to add a Plan.
                        </span>
                      )}
                    </div>
                  </div>

                  <div className={styles.tabs} role="tablist" aria-label="Learner planning views">
                    {(Object.keys(planningViewLabels) as LearnerPlanningView[]).map((view) => {
                      const count =
                        view === 'upcoming'
                          ? model.upcomingItems.length
                          : view === 'unscheduled'
                            ? model.unscheduledItems.length
                            : view === 'completed'
                              ? model.completedItems.length
                              : model.seriesItems.length;
                      return (
                        <button
                          key={view}
                          id={`learner-planning-tab-${view}`}
                          className={planningView === view ? styles.activeTab : ''}
                          type="button"
                          role="tab"
                          aria-selected={planningView === view}
                          aria-controls="learner-planning-panel"
                          onClick={() => updateSearchParam('planning', view)}
                        >
                          {planningViewLabels[view]} <span>{count}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div
                    id="learner-planning-panel"
                    className={styles.tabPanel}
                    role="tabpanel"
                    aria-labelledby={`learner-planning-tab-${planningView}`}
                  >
                    {planningView === 'series' && model.seriesItems.length > 0 ? (
                      <ul
                        className={styles.planningList}
                        aria-label={`Lesson series for ${model.selectedContext.name}`}
                      >
                        {model.seriesItems.map((item) => (
                          <LessonSeriesCard key={item.id} item={item} />
                        ))}
                      </ul>
                    ) : planningItems.length > 0 ? (
                      <ul
                        className={styles.planningList}
                        aria-label={`${planningViewLabels[planningView]} planning for ${model.selectedContext.name}`}
                      >
                        {planningItems.map((item) => (
                          <PlanningItemCard key={`${item.sourceType}:${item.id}`} item={item} />
                        ))}
                      </ul>
                    ) : (
                      <div className={styles.emptyPlanning} role="status">
                        {planningView === 'completed' ? (
                          <CheckCircle2 aria-hidden="true" size={28} />
                        ) : planningView === 'series' ? (
                          <Layers3 aria-hidden="true" size={28} />
                        ) : planningView === 'upcoming' ? (
                          <CalendarDays aria-hidden="true" size={28} />
                        ) : (
                          <BookOpen aria-hidden="true" size={28} />
                        )}
                        <div>
                          <h3>{emptyPlanningMessage(planningView)}</h3>
                          <p>
                            Planning records will appear here when they are connected to this
                            context.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              </section>
            ) : (
              <div className={`card ${styles.emptyLearners}`} role="status">
                <Archive aria-hidden="true" size={30} />
                <div>
                  <h2>No {contextStatus} learner contexts</h2>
                  <p>
                    {contextStatus === 'active'
                      ? 'Restore an archived context or import an active Class, Group, or Individual.'
                      : 'Archived Classes, Groups, and Individuals will remain available here with their history.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className={`card ${styles.emptyLearners}`} role="status">
            <Users aria-hidden="true" size={30} />
            <div>
              <h2>No {contextStatus} learner contexts</h2>
              <p>
                {contextStatus === 'active'
                  ? 'Migrated Classes, Groups, and Individuals will appear here when an active school year contains learner contexts.'
                  : 'Archived Classes, Groups, and Individuals will remain available here with their history.'}
              </p>
            </div>
          </div>
        )
      ) : null}
    </section>
  );
}

import {
  AlertTriangle,
  Archive,
  BookOpen,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Layers3,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ZodError } from 'zod';

import type { LearnerContext } from '@/domain/models/entities';
import { LearnerNoticePanel } from '@/features/learnerNotices/LearnerNoticePanel';
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
import { useSchoolYears } from '@/features/schoolYears/useSchoolYears';
import { parseLocalDate, todayLocalDate } from '@/shared/dates/localDate';
import { useDismissibleDetailsMenu } from '@/shared/ui/useDismissibleDetailsMenu';

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

function LearnerContextCreatePanel({
  kind,
  schoolYearId,
  schoolYearLabel,
  onCreated,
  onCancel,
}: {
  kind: LearnerContext['kind'];
  schoolYearId: string;
  schoolYearLabel: string;
  onCreated: (context: LearnerContext) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const kindLabel = getLearnerKindLabel(kind);

  useEffect(() => {
    nameRef.current?.focus();
  }, [kind]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const created = await learnerContextMutationService.create({
        kind,
        schoolYearId,
        name,
        preferredName: kind === 'individual' ? preferredName : undefined,
        notes,
      });
      onCreated(created);
    } catch (cause) {
      setError(getContextMutationError(cause));
      setSaving(false);
    }
  }

  return (
    <section className={`card ${styles.createPanel}`} aria-label={`Add ${kindLabel}`}>
      <div className={styles.createPanelHeading}>
        <div>
          <p className="page-eyebrow">Add new</p>
          <h2>Add {kindLabel}</h2>
          <p>
            Create an active {kindLabel.toLowerCase()} in {schoolYearLabel}. You can undo the whole
            action.
          </p>
        </div>
        <button className="button" type="button" disabled={saving} onClick={onCancel}>
          <X aria-hidden="true" size={16} /> Cancel
        </button>
      </div>

      <form className={styles.createForm} onSubmit={(event) => void submit(event)}>
        <label>
          <span>Name *</span>
          <input
            ref={nameRef}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            placeholder={
              kind === 'individual'
                ? 'e.g. Anna Wang'
                : kind === 'group'
                  ? 'e.g. Grade 3 Reading Group'
                  : 'e.g. Grade 3 Class'
            }
          />
        </label>
        {kind === 'individual' ? (
          <label>
            <span>Preferred name</span>
            <input
              value={preferredName}
              onChange={(event) => {
                setPreferredName(event.target.value);
                setError(null);
              }}
              placeholder="e.g. Anna"
            />
          </label>
        ) : null}
        <label className={styles.createNotesField}>
          <span>Notes</span>
          <textarea
            rows={3}
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
              setError(null);
            }}
            placeholder="Optional context notes"
          />
        </label>
        {error ? (
          <p className={styles.createError} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.createActions}>
          <button className="button" type="button" disabled={saving} onClick={onCancel}>
            Cancel
          </button>
          <button className="button button-primary" type="submit" disabled={saving}>
            <Plus aria-hidden="true" size={16} /> {saving ? 'Adding…' : `Add ${kindLabel}`}
          </button>
        </div>
      </form>
    </section>
  );
}

function LearnerAddMenu({
  disabled,
  onSelect,
  label = 'Add',
}: {
  disabled: boolean;
  onSelect: (kind: LearnerContext['kind']) => void;
  label?: string;
}) {
  const menu = useDismissibleDetailsMenu({ preferredPlacement: 'auto' });

  function select(kind: LearnerContext['kind']): void {
    if (disabled) return;
    menu.close();
    onSelect(kind);
  }

  if (disabled) {
    return (
      <a className="button" href="#/settings#school-years">
        Manage school years
      </a>
    );
  }

  return (
    <details
      ref={menu.rootRef}
      className={styles.addMenu}
      onToggle={menu.onToggle}
      onKeyDown={menu.onKeyDown}
    >
      <summary
        ref={menu.summaryRef}
        className="button button-primary"
        aria-label="Add learner context"
      >
        <Plus aria-hidden="true" size={17} /> {label}
        <ChevronDown aria-hidden="true" size={15} />
      </summary>
      <div
        ref={menu.panelRef}
        className={styles.addMenuPanel}
        role="group"
        aria-label="Add learner context options"
      >
        <button type="button" onClick={() => select('individual')}>
          <UserRound aria-hidden="true" size={17} />
          <span>
            <strong>Add Individual</strong>
            <small>Create a new learner</small>
          </span>
        </button>
        <button type="button" onClick={() => select('group')}>
          <Layers3 aria-hidden="true" size={17} />
          <span>
            <strong>Add Group</strong>
            <small>Create a new group</small>
          </span>
        </button>
        <button type="button" onClick={() => select('class')}>
          <Users aria-hidden="true" size={17} />
          <span>
            <strong>Add Class</strong>
            <small>Create a new class</small>
          </span>
        </button>
      </div>
    </details>
  );
}

function LearnerContextMoreMenu({
  onSupport,
  onDetails,
}: {
  onSupport: () => void;
  onDetails: () => void;
}) {
  const menu = useDismissibleDetailsMenu({ preferredPlacement: 'auto' });

  function run(action: () => void): void {
    menu.close();
    action();
  }

  return (
    <details
      ref={menu.rootRef}
      className={styles.contextMoreMenu}
      onToggle={menu.onToggle}
      onKeyDown={menu.onKeyDown}
    >
      <summary ref={menu.summaryRef} className="button">
        <MoreHorizontal aria-hidden="true" size={16} /> More
        <ChevronDown aria-hidden="true" size={14} />
      </summary>
      <div ref={menu.panelRef} role="group" aria-label="More learner actions">
        <button type="button" onClick={() => run(onSupport)}>
          Open support &amp; notices
        </button>
        <button type="button" onClick={() => run(onDetails)}>
          Manage details &amp; lifecycle
        </button>
      </div>
    </details>
  );
}

function LearnerDirectoryMoreMenu({
  context,
  onPlanning,
  onSupport,
  onDetails,
}: {
  context: LearnerContext;
  onPlanning: () => void;
  onSupport: () => void;
  onDetails: () => void;
}) {
  const menu = useDismissibleDetailsMenu({ preferredPlacement: 'auto' });

  function run(action: () => void): void {
    menu.close();
    action();
  }

  return (
    <details
      ref={menu.rootRef}
      className={styles.directoryMoreMenu}
      onToggle={menu.onToggle}
      onKeyDown={menu.onKeyDown}
    >
      <summary
        ref={menu.summaryRef}
        aria-label={`More actions for ${context.name}`}
        title={`More actions for ${context.name}`}
      >
        <MoreHorizontal aria-hidden="true" size={18} />
      </summary>
      <div ref={menu.panelRef} role="group" aria-label={`Actions for ${context.name}`}>
        <button type="button" onClick={() => run(onPlanning)}>
          Open planning
        </button>
        <button type="button" onClick={() => run(onSupport)}>
          Open support &amp; notices
        </button>
        <button type="button" onClick={() => run(onDetails)}>
          Manage details &amp; lifecycle
        </button>
      </div>
    </details>
  );
}

function LearnerContextLifecycleCard({
  context,
  editRequest,
  onStatusChanged,
  onDeleted,
}: {
  context: LearnerContext;
  editRequest: number;
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
  const handledEditRequest = useRef(0);
  const [deleteImpact, setDeleteImpact] = useState<LearnerContextDeleteImpact | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetDeleteState(): void {
    setDeleteImpact(null);
    setDeleteArmed(false);
  }

  function openEditor(): void {
    setEditing(true);
    setValues({
      name: context.name,
      preferredName: context.preferredName ?? '',
      notes: context.notes ?? '',
    });
    setError(null);
    resetDeleteState();
  }

  useEffect(() => {
    if (editRequest <= handledEditRequest.current) return;
    handledEditRequest.current = editRequest;
    setEditing(true);
    setValues({
      name: context.name,
      preferredName: context.preferredName ?? '',
      notes: context.notes ?? '',
    });
    setError(null);
    setDeleteImpact(null);
    setDeleteArmed(false);
  }, [context.name, context.notes, context.preferredName, editRequest]);

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
        <div>
          <p className="page-eyebrow">Details</p>
          <h2>Context details</h2>
          <p className={styles.detailsIntro}>
            Update identity and notes, or manage the context lifecycle without changing teaching
            history.
          </p>
        </div>
        <div className={styles.contextActions}>
          <button
            className="button"
            type="button"
            disabled={saving}
            onClick={() => {
              if (editing) {
                setEditing(false);
                setError(null);
              } else {
                openEditor();
              }
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

      <dl className={styles.contextFacts}>
        <div>
          <dt>Type</dt>
          <dd>{getLearnerKindLabel(context.kind)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{context.status === 'active' ? 'Active' : 'Archived'}</dd>
        </div>
        {context.preferredName ? (
          <div>
            <dt>Preferred name</dt>
            <dd>{context.preferredName}</dd>
          </div>
        ) : null}
      </dl>

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
      ) : (
        <p className={styles.contextNotesEmpty}>No notes have been added.</p>
      )}

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

type LearnerWorkspaceView = 'planning' | 'support' | 'details';
type LearnerDirectoryKind = 'all' | LearnerContext['kind'];

function isWorkspaceView(value: string | null): value is LearnerWorkspaceView {
  return value === 'planning' || value === 'support' || value === 'details';
}

function contextMatchesQuery(context: LearnerContext, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase('en');
  if (!normalized) return true;
  return [context.name, context.preferredName, context.notes]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLocaleLowerCase('en').includes(normalized));
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
  const rawWorkspaceView = searchParams.get('workspace');
  const workspaceView: LearnerWorkspaceView = isWorkspaceView(rawWorkspaceView)
    ? rawWorkspaceView
    : searchParams.has('support')
      ? 'support'
      : 'planning';
  const rawDate = searchParams.get('date');
  const anchorDate = parseLocalDate(rawDate) ? rawDate! : todayLocalDate();
  const requestedSchoolYearId = searchParams.get('schoolYear') ?? undefined;
  const schoolYearsState = useSchoolYears();
  const state = useLearnersReadModel(
    requestedContextId,
    preferredContextStatus,
    requestedSchoolYearId,
  );
  const [directoryQuery, setDirectoryQuery] = useState('');
  const [directoryKind, setDirectoryKind] = useState<LearnerDirectoryKind>('all');
  const [createKind, setCreateKind] = useState<LearnerContext['kind'] | null>(null);
  const [editRequest, setEditRequest] = useState(0);
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

  function selectSchoolYear(schoolYearId: string): void {
    setEditRequest(0);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('schoolYear', schoolYearId);
    nextParams.delete('context');
    nextParams.set('status', 'active');
    nextParams.set('workspace', 'planning');
    setCreateKind(null);
    setSearchParams(nextParams);
  }

  function selectContext(context: LearnerContext): void {
    setEditRequest(0);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('context', context.id);
    nextParams.set('status', context.status);
    setSearchParams(nextParams);
  }

  function openContextWorkspace(context: LearnerContext, view: LearnerWorkspaceView): void {
    setEditRequest(0);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('context', context.id);
    nextParams.set('status', context.status);
    nextParams.set('workspace', view);
    setSearchParams(nextParams);
  }

  function selectContextStatus(status: LearnerContext['status']): void {
    setEditRequest(0);
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

  function selectWorkspace(view: LearnerWorkspaceView): void {
    updateSearchParam('workspace', view);
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
    nextParams.set('workspace', 'planning');
    setSearchParams(nextParams);
  }

  function handleCreated(context: LearnerContext): void {
    setCreateKind(null);
    setDirectoryKind(context.kind);
    setDirectoryQuery('');
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('context', context.id);
    nextParams.set('status', 'active');
    nextParams.set('workspace', 'planning');
    setSearchParams(nextParams);
  }

  function editSelectedContext(): void {
    selectWorkspace('details');
    setEditRequest((current) => current + 1);
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

  const selectedSchoolYear = state.status === 'ready' ? state.data.activeSchoolYear : null;
  const canCreate = Boolean(selectedSchoolYear && selectedSchoolYear.lifecycleState !== 'archived');
  const filteredContextGroups = model
    ? model.contextGroups
        .filter((group) => directoryKind === 'all' || group.kind === directoryKind)
        .map((group) => ({
          ...group,
          contexts: group.contexts.filter((context) =>
            contextMatchesQuery(context, directoryQuery),
          ),
        }))
    : [];
  const filteredContextCount = filteredContextGroups.reduce(
    (total, group) => total + group.contexts.length,
    0,
  );

  return (
    <section className={styles.learnersPage}>
      <header className={styles.pageHeader}>
        <div>
          <p className="page-eyebrow">Workspace</p>
          <h1>Learners</h1>
          <p>Find a Class, Group, or Individual, then work in Planning, Support, or Details.</p>
        </div>
        <div className={styles.headerTools}>
          {schoolYearsState.status === 'ready' && schoolYearsState.data.items.length > 0 ? (
            <label className={styles.schoolYearPicker}>
              <span>School year</span>
              <select
                value={
                  state.status === 'ready'
                    ? (state.data.activeSchoolYear?.id ?? requestedSchoolYearId ?? '')
                    : (requestedSchoolYearId ?? '')
                }
                onChange={(event) => selectSchoolYear(event.target.value)}
              >
                {schoolYearsState.data.items.map(({ schoolYear }) => (
                  <option key={schoolYear.id} value={schoolYear.id}>
                    {schoolYear.label}
                    {schoolYear.active ? ' · Active' : ''}
                    {schoolYear.lifecycleState === 'archived' ? ' · Archived' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <LearnerAddMenu disabled={!canCreate} onSelect={setCreateKind} />
        </div>
      </header>

      {createKind && selectedSchoolYear ? (
        <LearnerContextCreatePanel
          key={`${createKind}:${selectedSchoolYear.id}`}
          kind={createKind}
          schoolYearId={selectedSchoolYear.id}
          schoolYearLabel={selectedSchoolYear.label}
          onCreated={handleCreated}
          onCancel={() => setCreateKind(null)}
        />
      ) : null}

      {state.status === 'loading' ? (
        <div className={`card ${styles.statePanel}`} role="status">
          <Clock3 aria-hidden="true" size={24} />
          <p>Loading learner contexts…</p>
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
        <>
          {model.selectedContext ? (
            <div
              className={styles.mobileContextSummary}
              role="region"
              aria-label="Selected learner context"
            >
              <div className={styles.mobileSelectedContext}>
                <span className={styles.contextIconLarge}>
                  {contextKindIcon(model.selectedContext.kind)}
                </span>
                <span>
                  <strong>{model.selectedContext.name}</strong>
                  <small>
                    {getLearnerKindLabel(model.selectedContext.kind)} ·{' '}
                    {model.selectedContext.status === 'active' ? 'Active' : 'Archived'}
                  </small>
                </span>
              </div>
              <div className={styles.mobileSelectedActions}>
                <details className={styles.mobileContextPicker}>
                  <summary className="button">Change learner</summary>
                  <div className={styles.mobilePickerPanel}>
                    <div
                      className={styles.lifecycleTabs}
                      role="group"
                      aria-label="Context lifecycle"
                    >
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
                    <label className={styles.mobileContextSelect}>
                      <span>Class, Group, or Individual</span>
                      <select
                        value={model.selectedContext.id}
                        onChange={(event) => {
                          const context = state.data.contexts.find(
                            (candidate) => candidate.id === event.target.value,
                          );
                          if (context) selectContext(context);
                        }}
                      >
                        {model.contextGroups.flatMap((group) =>
                          group.contexts.map((context) => (
                            <option key={context.id} value={context.id}>
                              {context.name} · {group.label.replace(/s$/, '')}
                            </option>
                          )),
                        )}
                      </select>
                    </label>
                  </div>
                </details>
                {model.selectedContext.status === 'active' ? (
                  <a
                    className="button button-primary"
                    href={`#/planning/edit?context=${encodeURIComponent(model.selectedContext.id)}`}
                  >
                    <CalendarPlus aria-hidden="true" size={16} /> New plan
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className={styles.layout}>
            <section
              className={`card ${styles.contextPanel}`}
              role="region"
              aria-label="Learner contexts"
            >
              <div className={styles.directoryHeader}>
                <div>
                  <p className="page-eyebrow">Learners directory</p>
                  <h2>{model.activeSchoolYearLabel}</h2>
                </div>
                <span>{model.contextStatusCounts[contextStatus]}</span>
              </div>

              <label className={styles.directorySearch}>
                <Search aria-hidden="true" size={17} />
                <span className={styles.visuallyHidden}>Search learners</span>
                <input
                  type="search"
                  value={directoryQuery}
                  placeholder="Search learners…"
                  onChange={(event) => setDirectoryQuery(event.target.value)}
                />
              </label>

              <div className={styles.kindFilters} role="group" aria-label="Learner type">
                {(
                  [
                    ['all', 'All'],
                    ['individual', 'Individuals'],
                    ['group', 'Groups'],
                    ['class', 'Classes'],
                  ] as const
                ).map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={directoryKind === kind}
                    className={directoryKind === kind ? styles.activeKindFilter : ''}
                    onClick={() => setDirectoryKind(kind)}
                  >
                    {label}
                  </button>
                ))}
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
                {filteredContextGroups.map((group) => (
                  <section
                    key={`${contextStatus}-${group.kind}`}
                    aria-labelledby={`learner-${contextStatus}-${group.kind}-heading`}
                  >
                    <div className={styles.groupHeading}>
                      <h3 id={`learner-${contextStatus}-${group.kind}-heading`}>{group.label}</h3>
                      <div>
                        <span>{group.contexts.length}</span>
                        {contextStatus === 'active' && canCreate ? (
                          <button
                            type="button"
                            aria-label={`Add ${getLearnerKindLabel(group.kind)}`}
                            onClick={() => setCreateKind(group.kind)}
                          >
                            <Plus aria-hidden="true" size={15} /> Add
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {group.contexts.length > 0 ? (
                      <ul className={styles.contextList}>
                        {group.contexts.map((context) => {
                          const selected = context.id === model.selectedContext?.id;
                          return (
                            <li key={context.id} className={styles.contextListItem}>
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
                                    {context.preferredName
                                      ? ` · ${context.preferredName}`
                                      : context.status === 'archived'
                                        ? ' · Archived'
                                        : ''}
                                  </small>
                                </span>
                              </button>
                              <LearnerDirectoryMoreMenu
                                context={context}
                                onPlanning={() => openContextWorkspace(context, 'planning')}
                                onSupport={() => openContextWorkspace(context, 'support')}
                                onDetails={() => openContextWorkspace(context, 'details')}
                              />
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className={styles.emptyGroup}>
                        No matching {contextStatus} {group.label.toLowerCase()}.
                      </p>
                    )}
                  </section>
                ))}
                {filteredContextCount === 0 ? (
                  <p className={styles.directoryEmpty} role="status">
                    No learner contexts match these filters.
                  </p>
                ) : null}
              </div>
            </section>

            {model.selectedContext ? (
              <section
                className={styles.planningPanel}
                role="region"
                aria-label={`Planning for ${model.selectedContext.name}`}
              >
                <section className={`card ${styles.selectedContextHeader}`}>
                  <div className={styles.contextIdentity}>
                    <span className={styles.contextIconLarge}>
                      {contextKindIcon(model.selectedContext.kind)}
                    </span>
                    <div>
                      <div className={styles.contextTitleRow}>
                        <h2>{model.selectedContext.name}</h2>
                        <span
                          className={`${styles.contextStatusBadge} ${
                            model.selectedContext.status === 'archived' ? styles.archivedBadge : ''
                          }`}
                        >
                          {model.selectedContext.status === 'archived' ? 'Archived' : 'Active'}
                        </span>
                      </div>
                      <p>
                        {getLearnerKindLabel(model.selectedContext.kind)}
                        {model.selectedContext.preferredName
                          ? ` · Preferred name: ${model.selectedContext.preferredName}`
                          : ''}
                      </p>
                    </div>
                  </div>
                  <div className={styles.selectedContextActions}>
                    {model.selectedContext.status === 'active' ? (
                      <a
                        className="button button-primary"
                        href={`#/planning/edit?context=${encodeURIComponent(model.selectedContext.id)}`}
                      >
                        <CalendarPlus aria-hidden="true" size={16} /> New plan
                      </a>
                    ) : null}
                    <button className="button" type="button" onClick={editSelectedContext}>
                      <Pencil aria-hidden="true" size={16} /> Edit
                    </button>
                    <LearnerContextMoreMenu
                      onSupport={() => selectWorkspace('support')}
                      onDetails={() => selectWorkspace('details')}
                    />
                  </div>
                </section>

                <div className={styles.workspaceTabs} role="tablist" aria-label="Learner workspace">
                  {(
                    [
                      ['planning', 'Planning'],
                      ['support', 'Support & Notices'],
                      ['details', 'Details'],
                    ] as const
                  ).map(([view, label]) => (
                    <button
                      key={view}
                      id={`learner-workspace-tab-${view}`}
                      type="button"
                      role="tab"
                      aria-selected={workspaceView === view}
                      aria-controls={`learner-workspace-panel-${view}`}
                      className={workspaceView === view ? styles.activeWorkspaceTab : ''}
                      onClick={() => selectWorkspace(view)}
                    >
                      {view === 'planning' ? (
                        <CalendarDays aria-hidden="true" size={17} />
                      ) : view === 'support' ? (
                        <BookOpen aria-hidden="true" size={17} />
                      ) : (
                        <Pencil aria-hidden="true" size={17} />
                      )}
                      {label}
                    </button>
                  ))}
                </div>

                <section
                  id="learner-workspace-panel-planning"
                  hidden={workspaceView !== 'planning'}
                  className={`card ${styles.planningWorkspace}`}
                  role="tabpanel"
                  aria-labelledby="learner-workspace-tab-planning"
                >
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
                      {model.selectedContext.status === 'archived' ? (
                        <span className={styles.archivedPlanRestriction}>
                          Restore this context to add a Plan.
                        </span>
                      ) : null}
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

                <div
                  id="learner-workspace-panel-support"
                  hidden={workspaceView !== 'support'}
                  role="tabpanel"
                  aria-labelledby="learner-workspace-tab-support"
                >
                  <LearnerNoticePanel context={model.selectedContext} />
                </div>

                <div
                  id="learner-workspace-panel-details"
                  hidden={workspaceView !== 'details'}
                  role="tabpanel"
                  aria-labelledby="learner-workspace-tab-details"
                >
                  <LearnerContextLifecycleCard
                    key={model.selectedContext.id}
                    context={model.selectedContext}
                    editRequest={editRequest}
                    onStatusChanged={keepSelectedContextInStatus}
                    onDeleted={clearDeletedContext}
                  />
                </div>
              </section>
            ) : (
              <div className={`card ${styles.emptyLearners}`}>
                <Users aria-hidden="true" size={30} />
                <div>
                  <h2>No {contextStatus} learner contexts</h2>
                  <p>
                    {contextStatus === 'active'
                      ? 'Add an Individual, Group, or Class to begin planning and support work.'
                      : 'Archived Classes, Groups, and Individuals remain available with their history.'}
                  </p>
                  {contextStatus === 'active' && canCreate ? (
                    <div className={styles.emptyAddActions}>
                      <button
                        className="button"
                        type="button"
                        onClick={() => setCreateKind('individual')}
                      >
                        <UserRound aria-hidden="true" size={16} /> Add Individual
                      </button>
                      <button
                        className="button"
                        type="button"
                        onClick={() => setCreateKind('group')}
                      >
                        <Layers3 aria-hidden="true" size={16} /> Add Group
                      </button>
                      <button
                        className="button"
                        type="button"
                        onClick={() => setCreateKind('class')}
                      >
                        <Users aria-hidden="true" size={16} /> Add Class
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

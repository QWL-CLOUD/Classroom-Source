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
import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { LearnerContext } from '@/domain/models/entities';
import type { LearnerPlanningView } from '@/domain/readModels/learnerReadModels';
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

function emptyPlanningMessage(view: LearnerPlanningView): string {
  if (view === 'upcoming') return 'No upcoming sessions from this date.';
  if (view === 'completed') return 'No completed sessions have been recorded.';
  if (view === 'series') return 'No lesson series have been created for this learner context.';
  return 'No unscheduled lesson plans for this learner context.';
}

export function LearnersRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedContextId = searchParams.get('context') ?? undefined;
  const rawPlanningView = searchParams.get('planning');
  const planningView: LearnerPlanningView = isPlanningView(rawPlanningView)
    ? rawPlanningView
    : 'upcoming';
  const rawDate = searchParams.get('date');
  const anchorDate = parseLocalDate(rawDate) ? rawDate! : todayLocalDate();
  const state = useLearnersReadModel(requestedContextId);
  const model = useMemo(
    () => (state.status === 'ready' ? buildLearnersPageReadModel(state.data, anchorDate) : null),
    [anchorDate, state],
  );

  function updateSearchParam(name: string, value: string): void {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set(name, value);
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
            <span>{model.contextCounts.class} Classes</span>
            <span>{model.contextCounts.group} Groups</span>
            <span>{model.contextCounts.individual} Individuals</span>
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
        model.selectedContext ? (
          <div className={styles.layout}>
            <section
              className={`card ${styles.contextPanel}`}
              role="region"
              aria-label="Learner contexts"
            >
              <div className={styles.contextPanelHeader}>
                <div>
                  <p className="page-eyebrow">Active contexts</p>
                  <h2>{model.activeSchoolYearLabel}</h2>
                </div>
                <span>{state.data.contexts.length}</span>
              </div>

              <div className={styles.contextGroups}>
                {model.contextGroups.map((group) => (
                  <section key={group.kind} aria-labelledby={`learner-${group.kind}-heading`}>
                    <div className={styles.groupHeading}>
                      <h3 id={`learner-${group.kind}-heading`}>{group.label}</h3>
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
                                onClick={() => updateSearchParam('context', context.id)}
                              >
                                <span className={styles.contextIcon}>
                                  {contextKindIcon(context.kind)}
                                </span>
                                <span>
                                  <strong>{context.name}</strong>
                                  <small>{getLearnerKindLabel(context.kind)}</small>
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className={styles.emptyGroup}>No active {group.label.toLowerCase()}.</p>
                    )}
                  </section>
                ))}
              </div>
            </section>

            <section
              className={styles.planningPanel}
              role="region"
              aria-label={`Planning for ${model.selectedContext.name}`}
            >
              <section className={`card ${styles.contextSummary}`}>
                <div className={styles.contextIdentity}>
                  <span className={styles.contextIconLarge}>
                    {contextKindIcon(model.selectedContext.kind)}
                  </span>
                  <div>
                    <p className="page-eyebrow">
                      {getLearnerKindLabel(model.selectedContext.kind)} planning
                    </p>
                    <h2>{model.selectedContext.name}</h2>
                    {model.selectedContext.preferredName ? (
                      <p>Preferred name: {model.selectedContext.preferredName}</p>
                    ) : null}
                  </div>
                </div>
                {model.selectedContext.notes ? (
                  <p className={styles.contextNotes}>{model.selectedContext.notes}</p>
                ) : null}
              </section>

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
                    <a
                      className="button button-primary"
                      href={`#/planning/edit?context=${encodeURIComponent(model.selectedContext.id)}`}
                    >
                      <CalendarPlus aria-hidden="true" size={16} /> New plan
                    </a>
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
                          Planning records will appear here when they are connected to this context.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </section>
          </div>
        ) : (
          <div className={`card ${styles.emptyLearners}`} role="status">
            <Users aria-hidden="true" size={30} />
            <div>
              <h2>No active learner contexts</h2>
              <p>
                Migrated Classes, Groups, and Individuals will appear here when an active school
                year contains learner contexts.
              </p>
            </div>
          </div>
        )
      ) : null}
    </section>
  );
}

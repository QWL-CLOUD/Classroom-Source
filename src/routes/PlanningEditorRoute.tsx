import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarPlus,
  ListOrdered,
  Save,
  Trash2,
  Users,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ZodError } from 'zod';

import { classroomDb } from '@/data/db/ClassroomDatabase';
import {
  learnerContextSchema,
  lessonPlanSchema,
  lessonSeriesSchema,
  scheduleBlockSchema,
  schoolYearSchema,
  sessionOccurrenceSchema,
  type LearnerContext,
  type LessonPlan,
  type LessonSeries,
  type ScheduleBlock,
  type SessionOccurrence,
} from '@/domain/models/entities';
import { LessonFlowEditor } from '@/features/planning/LessonFlowEditor';
import { formatLessonSeriesPositionLabel } from '@/features/planning/lessonSeriesPresentation';
import {
  buildPlanningSurfaceHref,
  buildSessionEditorHref,
  parsePlanningReturnTarget,
  type PlanningReturnTarget,
} from '@/features/planning/planningNavigation';
import {
  createLessonPlanEditorValues,
  toLessonPlanEditorValues,
  type LessonContentEditorValues,
  type LessonPlanEditorValues,
} from '@/features/planning/planningEditorModel';
import {
  planningMutationService,
  type PlanningMutationService,
} from '@/features/planning/planningMutationService';

import { formatLongDate, parseLocalDate, todayLocalDate } from '@/shared/dates/localDate';

import styles from './PlanningEditorRoute.module.css';

interface PlanningEditorSnapshot {
  contexts: LearnerContext[];
  context: LearnerContext | null;
  plan: LessonPlan | null;
  sessions: SessionOccurrence[];
  contextSessions: SessionOccurrence[];
  scheduleBlocks: ScheduleBlock[];
  lessonSeries: LessonSeries[];
  seriesPlans: LessonPlan[];
}

function getErrorMessage(cause: unknown): string {
  if (cause instanceof ZodError) {
    return cause.issues[0]?.message ?? 'Check the planning details.';
  }
  return cause instanceof Error ? cause.message : 'The planning item could not be saved.';
}

function learnerHref(
  contextId: string,
  view: 'upcoming' | 'unscheduled' | 'completed',
  date?: string,
): string {
  const params = new URLSearchParams({ context: contextId, planning: view });
  if (date) params.set('date', date);
  return `#/learners?${params.toString()}`;
}

function PlanningEditorForm({
  snapshot,
  initialDate,
  returnTo,
  service = planningMutationService,
}: {
  snapshot: PlanningEditorSnapshot;
  initialDate: string;
  returnTo: PlanningReturnTarget;
  service?: PlanningMutationService;
}) {
  const { context, plan, sessions, contextSessions, scheduleBlocks, lessonSeries, seriesPlans } =
    snapshot;
  const [values, setValues] = useState<LessonPlanEditorValues>(() =>
    plan
      ? toLessonPlanEditorValues(plan)
      : createLessonPlanEditorValues(
          scheduleBlocks.find((block) => block.planningEnabled)?.id ?? '',
        ),
  );
  const [saving, setSaving] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeSession = sessions.find(
    (session) => session.deliveryState === 'scheduled' || session.deliveryState === 'completed',
  );
  const learnerView =
    activeSession?.deliveryState === 'completed'
      ? 'completed'
      : activeSession
        ? 'upcoming'
        : 'unscheduled';
  const learnerDate = learnerView === 'upcoming' ? activeSession?.date : undefined;
  const [returnDate, setReturnDate] = useState<string | undefined>(() => learnerDate);
  const learnerReturnDate = learnerView === 'upcoming' ? returnDate : undefined;
  if (!context) return null;
  const selectedContext = context;
  const surfaceDate = activeSession?.date ?? initialDate;
  const backHref =
    returnTo === 'learners'
      ? learnerHref(selectedContext.id, learnerView, learnerReturnDate)
      : buildPlanningSurfaceHref({
          returnTo,
          date: surfaceDate,
          contextId: selectedContext.id,
          focusSessionId: activeSession?.id,
        });

  const seriesChoice =
    values.seriesMode === 'new'
      ? '__new__'
      : values.seriesMode === 'existing'
        ? values.seriesId
        : '';
  const currentSeries = plan?.seriesId
    ? (lessonSeries.find((series) => series.id === plan.seriesId) ?? null)
    : null;
  const currentSeriesPlans = currentSeries
    ? seriesPlans
        .filter((candidate) => candidate.seriesId === currentSeries.id)
        .sort(
          (first, second) =>
            (first.sequence ?? Number.MAX_SAFE_INTEGER) -
              (second.sequence ?? Number.MAX_SAFE_INTEGER) ||
            first.createdAt.localeCompare(second.createdAt) ||
            first.id.localeCompare(second.id),
        )
    : [];
  const currentSeriesIndex = plan
    ? currentSeriesPlans.findIndex((candidate) => candidate.id === plan.id)
    : -1;

  function update<K extends keyof LessonPlanEditorValues>(
    key: K,
    value: LessonPlanEditorValues[K],
  ): void {
    setValues((current) => ({ ...current, [key]: value }));
    setError(null);
    setDeleteArmed(false);
  }

  function updateSeriesChoice(value: string): void {
    if (value === '__new__') {
      setValues((current) => ({ ...current, seriesMode: 'new', seriesId: '' }));
    } else if (value) {
      setValues((current) => ({
        ...current,
        seriesMode: 'existing',
        seriesId: value,
        newSeriesTitle: '',
      }));
    } else {
      setValues((current) => ({
        ...current,
        seriesMode: 'none',
        seriesId: '',
        newSeriesTitle: '',
      }));
    }
    setError(null);
    setDeleteArmed(false);
  }

  async function moveWithinSeries(direction: 'earlier' | 'later'): Promise<void> {
    if (!plan || saving) return;
    const targetIndex = direction === 'earlier' ? currentSeriesIndex - 1 : currentSeriesIndex + 1;
    const targetPlan = currentSeriesPlans[targetIndex];
    const targetSession = targetPlan
      ? contextSessions.find(
          (session) =>
            session.lessonPlanId === targetPlan.id && session.deliveryState === 'scheduled',
        )
      : undefined;
    const earliestAffectedDate = [activeSession?.date, targetSession?.date]
      .filter((date): date is string => Boolean(date))
      .sort()[0];
    setSaving(true);
    setError(null);
    try {
      await service.movePlanWithinSeries(plan.id, direction);
      if (earliestAffectedDate) setReturnDate(earliestAffectedDate);
      setSaving(false);
    } catch (cause) {
      setError(getErrorMessage(cause));
      setSaving(false);
    }
  }

  async function save(scheduleAfterSave: boolean): Promise<void> {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = plan
        ? await service.updatePlan(plan.id, values)
        : await service.createPlan(selectedContext.id, values);
      if (scheduleAfterSave) {
        window.location.hash = buildSessionEditorHref({
          planId: saved.id,
          date: initialDate,
          returnTo,
        });
      } else {
        window.location.hash = learnerHref(selectedContext.id, learnerView, learnerReturnDate);
      }
    } catch (cause) {
      setError(getErrorMessage(cause));
      setSaving(false);
    }
  }

  async function remove(): Promise<void> {
    if (!plan || saving) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await service.deletePlan(plan.id, { includeSessions: true });
      window.location.hash =
        returnTo === 'learners'
          ? learnerHref(selectedContext.id, 'unscheduled')
          : buildPlanningSurfaceHref({
              returnTo,
              date: surfaceDate,
              contextId: selectedContext.id,
            });
    } catch (cause) {
      setError(getErrorMessage(cause));
      setSaving(false);
    }
  }

  return (
    <section className={`card ${styles.editor}`} aria-label="Planning item editor">
      <div className={styles.editorHeader}>
        <div>
          <p className="page-eyebrow">Planning item</p>
          <h2>{plan ? 'Edit plan' : 'New plan'}</h2>
          <p>{selectedContext.name}</p>
        </div>
        <a className="button" href={backHref}>
          <ArrowLeft aria-hidden="true" size={17} />
          {returnTo === 'learners'
            ? 'Back to Learners'
            : `Back to ${returnTo === 'today' ? 'Today' : returnTo === 'week' ? 'Week' : 'Calendar'}`}
        </a>
      </div>

      <div className={styles.formGrid}>
        <label className={styles.fullWidth}>
          <span>Title</span>
          <input
            value={values.title}
            autoFocus
            onChange={(event) => update('title', event.target.value)}
          />
        </label>

        <label>
          <span>Subject</span>
          <input
            value={values.subject}
            onChange={(event) => update('subject', event.target.value)}
          />
        </label>

        <label>
          <span>Planning state</span>
          <select
            value={values.workflowState}
            onChange={(event) =>
              update('workflowState', event.target.value as LessonPlanEditorValues['workflowState'])
            }
          >
            <option value="draft">Draft</option>
            <option value="ready">Ready</option>
          </select>
        </label>

        <label className={styles.fullWidth}>
          <span>Lesson series</span>
          <select value={seriesChoice} onChange={(event) => updateSeriesChoice(event.target.value)}>
            <option value="">No series</option>
            {lessonSeries.map((series) => (
              <option key={series.id} value={series.id}>
                {series.title}
              </option>
            ))}
            <option value="__new__">Create a new series…</option>
          </select>
        </label>

        {values.seriesMode === 'new' ? (
          <label className={styles.fullWidth}>
            <span>New series title</span>
            <input
              value={values.newSeriesTitle}
              onChange={(event) => update('newSeriesTitle', event.target.value)}
              placeholder="For example, Fractions Unit"
            />
          </label>
        ) : null}

        <label>
          <span>Preferred schedule block</span>
          <select
            value={values.preferredScheduleBlockId}
            onChange={(event) => update('preferredScheduleBlockId', event.target.value)}
          >
            <option value="">Choose when scheduling</option>
            {scheduleBlocks.map((block) => (
              <option key={block.id} value={block.id}>
                {block.title}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Duration in minutes</span>
          <input
            inputMode="numeric"
            value={values.durationMinutes}
            onChange={(event) => update('durationMinutes', event.target.value)}
          />
        </label>
      </div>

      <LessonFlowEditor
        idPrefix="planning-item"
        values={{
          learningTarget: values.learningTarget,
          notes: values.notes,
          lessonFlow: values.lessonFlow,
        }}
        disabled={saving}
        onChange={(content: LessonContentEditorValues) => {
          setValues((current) => ({ ...current, ...content }));
          setError(null);
          setDeleteArmed(false);
        }}
      />

      {currentSeries && currentSeriesIndex >= 0 ? (
        <section className={styles.seriesPosition} aria-label="Lesson series position">
          <div>
            <ListOrdered aria-hidden="true" size={18} />
            <p>
              <span>
                {formatLessonSeriesPositionLabel(
                  `Lesson ${currentSeriesIndex + 1} of ${currentSeriesPlans.length}`,
                  currentSeries.title,
                )}
              </span>
            </p>
          </div>
          <div className={styles.seriesActions}>
            <button
              className="button"
              type="button"
              disabled={saving || currentSeriesIndex === 0}
              onClick={() => void moveWithinSeries('earlier')}
            >
              <ArrowUp aria-hidden="true" size={16} /> Move earlier
            </button>
            <button
              className="button"
              type="button"
              disabled={saving || currentSeriesIndex === currentSeriesPlans.length - 1}
              onClick={() => void moveWithinSeries('later')}
            >
              <ArrowDown aria-hidden="true" size={16} /> Move later
            </button>
          </div>
        </section>
      ) : null}

      {activeSession ? (
        <p className={styles.notice} role="status">
          This plan already has a {activeSession.deliveryState} session. Manage that session before
          scheduling another occurrence.
        </p>
      ) : null}

      {deleteArmed && plan ? (
        <div className={styles.deleteImpact} role="alert">
          <Trash2 aria-hidden="true" size={18} />
          <div>
            <strong>Delete “{plan.title}”?</strong>
            <p>
              {sessions.length > 0
                ? `This also removes ${sessions.length} linked session${sessions.length === 1 ? '' : 's'} from Today, Week, Calendar, and Learners.`
                : 'This removes the planning item from Learners.'}{' '}
              The entire deletion can be undone.
            </p>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className={styles.errorMessage} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.actions}>
        <button
          className="button button-primary"
          type="button"
          disabled={saving}
          onClick={() => void save(false)}
        >
          <Save aria-hidden="true" size={17} /> {saving ? 'Saving…' : 'Save plan'}
        </button>
        {!activeSession ? (
          <button
            className="button"
            type="button"
            disabled={saving}
            onClick={() => void save(true)}
          >
            <CalendarPlus aria-hidden="true" size={17} /> Save and schedule
          </button>
        ) : (
          <a
            className="button"
            href={`#/planning/session?session=${encodeURIComponent(activeSession.id)}&date=${surfaceDate}${returnTo === 'learners' ? '' : `&return=${returnTo}`}`}
          >
            <CalendarPlus aria-hidden="true" size={17} /> Manage session
          </a>
        )}
        {plan ? (
          <button
            className={deleteArmed ? styles.dangerButton : 'button'}
            type="button"
            disabled={saving}
            onClick={() => void remove()}
          >
            <Trash2 aria-hidden="true" size={17} />
            {deleteArmed
              ? sessions.length > 0
                ? 'Confirm delete plan and sessions'
                : 'Confirm delete plan'
              : 'Delete plan'}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function PlanningContextPicker({
  contexts,
  date,
  onSelect,
  returnTo,
}: {
  contexts: LearnerContext[];
  date: string;
  onSelect: (contextId: string) => void;
  returnTo: PlanningReturnTarget;
}) {
  const [contextId, setContextId] = useState(contexts[0]?.id ?? '');

  return (
    <section className={`card ${styles.contextPicker}`} aria-labelledby="planning-context-heading">
      <div>
        <Users aria-hidden="true" size={22} />
        <div>
          <p className="page-eyebrow">Planning destination</p>
          <h2 id="planning-context-heading">Choose who this lesson is for</h2>
          <p>
            {returnTo === 'learners'
              ? 'Select a Class, Group, or Individual before creating the planning item.'
              : `The session date will start on ${formatLongDate(date)} if you choose Save and schedule.`}
          </p>
        </div>
      </div>
      <label>
        <span>Learner context</span>
        <select value={contextId} onChange={(event) => setContextId(event.target.value)}>
          {contexts.map((context) => (
            <option key={context.id} value={context.id}>
              {context.name} ·{' '}
              {context.kind === 'class'
                ? 'Class'
                : context.kind === 'group'
                  ? 'Group'
                  : 'Individual'}
            </option>
          ))}
        </select>
      </label>
      <button
        className="button button-primary"
        type="button"
        disabled={!contextId}
        onClick={() => onSelect(contextId)}
      >
        Continue to plan
      </button>
    </section>
  );
}

export function PlanningEditorRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedContextId = searchParams.get('context');
  const planId = searchParams.get('plan');
  const requestedDate = searchParams.get('date');
  const initialDate = parseLocalDate(requestedDate) ? requestedDate! : todayLocalDate();
  const returnTo = parsePlanningReturnTarget(searchParams.get('return'));

  const snapshot = useLiveQuery(async (): Promise<PlanningEditorSnapshot> => {
    const activeSchoolYearIds = new Set(
      (await classroomDb.schoolYears.toArray())
        .map((value) => schoolYearSchema.parse(value))
        .filter((value) => value.active)
        .map((value) => value.id),
    );
    const contexts = (await classroomDb.learnerContexts.toArray())
      .map((value) => learnerContextSchema.parse(value))
      .filter(
        (value) =>
          value.status === 'active' &&
          (activeSchoolYearIds.size === 0 || activeSchoolYearIds.has(value.schoolYearId)),
      )
      .sort(
        (first, second) =>
          first.kind.localeCompare(second.kind) ||
          first.name.localeCompare(second.name) ||
          first.id.localeCompare(second.id),
      );
    const planValue = planId ? await classroomDb.lessonPlans.get(planId) : undefined;
    const plan = planValue ? lessonPlanSchema.parse(planValue) : null;
    const contextId = plan?.contextId ?? requestedContextId;
    const contextValue = contextId ? await classroomDb.learnerContexts.get(contextId) : undefined;
    const context = contextValue ? learnerContextSchema.parse(contextValue) : null;
    const sessions = plan
      ? (await classroomDb.sessionOccurrences.where('lessonPlanId').equals(plan.id).toArray()).map(
          (value) => sessionOccurrenceSchema.parse(value),
        )
      : [];
    const scheduleBlocks = (await classroomDb.scheduleBlocks.toArray())
      .map((value) => scheduleBlockSchema.parse(value))
      .filter(
        (block) =>
          !block.archivedAt &&
          block.kind === 'teachable' &&
          (block.planningEnabled || block.id === plan?.preferredScheduleBlockId) &&
          (!context || !block.contextId || block.contextId === context.id),
      )
      .sort(
        (first, second) =>
          first.startMinute - second.startMinute || first.title.localeCompare(second.title),
      );
    const lessonSeries = contextId
      ? (await classroomDb.lessonSeries.where('contextId').equals(contextId).toArray())
          .map((value) => lessonSeriesSchema.parse(value))
          .sort(
            (first, second) =>
              first.title.localeCompare(second.title) || first.id.localeCompare(second.id),
          )
      : [];
    const seriesPlans = contextId
      ? (await classroomDb.lessonPlans.where('contextId').equals(contextId).toArray()).map(
          (value) => lessonPlanSchema.parse(value),
        )
      : [];
    const contextSessions = contextId
      ? (await classroomDb.sessionOccurrences.where('contextId').equals(contextId).toArray()).map(
          (value) => sessionOccurrenceSchema.parse(value),
        )
      : [];

    return {
      contexts,
      context,
      plan,
      sessions,
      contextSessions,
      scheduleBlocks,
      lessonSeries,
      seriesPlans,
    };
  }, [planId, requestedContextId]);

  if (snapshot === undefined) {
    return (
      <div className={`card ${styles.statePanel}`} role="status">
        Loading planning item…
      </div>
    );
  }

  if ((planId && !snapshot.plan) || (requestedContextId && !snapshot.context)) {
    return (
      <div className={`card ${styles.errorPanel}`} role="alert">
        <h1>Planning item unavailable</h1>
        <p>The requested learner context or lesson plan could not be found.</p>
        <a className="button" href="#/learners">
          Back to Learners
        </a>
      </div>
    );
  }

  function selectContext(contextId: string): void {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('context', contextId);
    setSearchParams(nextParams);
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Phase 3C-4</p>
          <h1>Planning</h1>
          <p>
            Create reusable teaching content, then keep it unscheduled or place it on{' '}
            {formatLongDate(initialDate)}.
          </p>
        </div>
      </header>

      {!snapshot.context ? (
        snapshot.contexts.length > 0 ? (
          <PlanningContextPicker
            contexts={snapshot.contexts}
            date={initialDate}
            returnTo={returnTo}
            onSelect={selectContext}
          />
        ) : (
          <div className={`card ${styles.errorPanel}`} role="alert">
            <h2>No active learner contexts</h2>
            <p>Create or import a Class, Group, or Individual before adding a lesson plan.</p>
            <a className="button" href="#/learners">
              Back to Learners
            </a>
          </div>
        )
      ) : (
        <PlanningEditorForm
          key={snapshot.plan?.id ?? `new-${snapshot.context.id}-${initialDate}`}
          snapshot={snapshot}
          initialDate={initialDate}
          returnTo={returnTo}
        />
      )}
    </section>
  );
}

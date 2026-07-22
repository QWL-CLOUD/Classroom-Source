import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarPlus,
  Clock3,
  ListOrdered,
  Save,
  Trash2,
  Users,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ZodError } from 'zod';

import { classroomDb } from '@/data/db/ClassroomDatabase';
import {
  learnerContextSchema,
  lessonPlanSchema,
  lessonSeriesSchema,
  scheduleBlockSchema,
  scheduleExceptionSchema,
  schoolYearSchema,
  sessionOccurrenceSchema,
  type LearnerContext,
  type LessonPlan,
  type LessonSeries,
  type ScheduleBlock,
  type ScheduleException,
  type SessionOccurrence,
} from '@/domain/models/entities';
import { formatCalendarMinute } from '@/features/calendar/calendarReadModel';
import { CategoryAssignmentFields } from '@/features/categories/CategoryAssignmentFields';
import { useCategorySelectionDraft } from '@/features/categories/useCategorySelectionDraft';
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
  type LessonPlanEditorValues,
} from '@/features/planning/planningEditorModel';
import { resolveScheduleOccurrence } from '@/features/scheduleExceptions/scheduleOccurrenceResolver';
import {
  planningMutationService,
  type PlanningMutationService,
} from '@/features/planning/planningMutationService';

import { formatLongDate, parseLocalDate, todayLocalDate } from '@/shared/dates/localDate';
import { EditorActionMenu } from '@/shared/ui/EditorActionMenu';

import styles from './PlanningEditorRoute.module.css';

interface PlanningScheduleOccurrence {
  block: ScheduleBlock;
  date: string;
  adjusted: boolean;
}

interface PlanningEditorSnapshot {
  contexts: LearnerContext[];
  context: LearnerContext | null;
  plan: LessonPlan | null;
  sessions: SessionOccurrence[];
  contextSessions: SessionOccurrence[];
  scheduleBlocks: ScheduleBlock[];
  lessonSeries: LessonSeries[];
  seriesPlans: LessonPlan[];
  planningOccurrence: PlanningScheduleOccurrence | null;
  planningOccurrenceError: string | null;
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
  onChangeContext,
}: {
  snapshot: PlanningEditorSnapshot;
  initialDate: string;
  returnTo: PlanningReturnTarget;
  service?: PlanningMutationService;
  onChangeContext?: () => void;
}) {
  const {
    context,
    plan,
    sessions,
    contextSessions,
    scheduleBlocks,
    lessonSeries,
    seriesPlans,
    planningOccurrence,
  } = snapshot;
  const [values, setValues] = useState<LessonPlanEditorValues>(() =>
    plan
      ? toLessonPlanEditorValues(plan)
      : createLessonPlanEditorValues(
          planningOccurrence?.block.id ??
            scheduleBlocks.find((block) => block.planningEnabled)?.id ??
            '',
        ),
  );
  const latestValuesRef = useRef(values);
  // Every form mutation must go through applyValues(), which updates this ref
  // synchronously before React renders. Assigning from `values` during render
  // can let an older concurrent render replace a newer draft just before Save.
  const [saving, setSaving] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const categoryDraft = useCategorySelectionDraft('lesson-plan', plan?.id);
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
  const surfaceDate = activeSession?.date ?? planningOccurrence?.date ?? initialDate;
  const occurrenceFocusId = planningOccurrence
    ? `schedule-block:${planningOccurrence.block.id}:${planningOccurrence.date}`
    : undefined;
  const backHref =
    returnTo === 'learners'
      ? learnerHref(selectedContext.id, learnerView, learnerReturnDate)
      : buildPlanningSurfaceHref({
          returnTo,
          date: surfaceDate,
          contextId: selectedContext.id,
          focusSessionId: activeSession?.id,
          focusOccurrenceId: occurrenceFocusId,
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
  const assignableLessonSeries = lessonSeries.filter(
    (series) => series.lifecycleState === 'active' || series.id === currentSeries?.id,
  );
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

  function applyValues(
    update: LessonPlanEditorValues | ((current: LessonPlanEditorValues) => LessonPlanEditorValues),
  ): void {
    const nextValues = typeof update === 'function' ? update(latestValuesRef.current) : update;
    latestValuesRef.current = nextValues;
    setValues(nextValues);
    setError(null);
    setDeleteArmed(false);
  }

  function update<K extends keyof LessonPlanEditorValues>(
    key: K,
    value: LessonPlanEditorValues[K],
  ): void {
    applyValues((current) => ({ ...current, [key]: value }));
  }

  function updateSeriesChoice(value: string): void {
    if (value === '__new__') {
      applyValues({ ...latestValuesRef.current, seriesMode: 'new', seriesId: '' });
    } else if (value) {
      applyValues({
        ...latestValuesRef.current,
        seriesMode: 'existing',
        seriesId: value,
        newSeriesTitle: '',
      });
    } else {
      applyValues({
        ...latestValuesRef.current,
        seriesMode: 'none',
        seriesId: '',
        newSeriesTitle: '',
      });
    }
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
      const currentValues = latestValuesRef.current;
      if (planningOccurrence && !plan) {
        const result = await service.createPlanForScheduleOccurrence(
          selectedContext.id,
          currentValues,
          {
            scheduleBlockId: planningOccurrence.block.id,
            date: planningOccurrence.date,
          },
          categoryDraft.selections,
        );
        if (!result.created) {
          const params = new URLSearchParams({
            plan: result.plan.id,
            date: planningOccurrence.date,
            return: returnTo,
            block: planningOccurrence.block.id,
          });
          window.location.hash = `#/planning/edit?${params.toString()}`;
          return;
        }
        window.location.hash = buildPlanningSurfaceHref({
          returnTo,
          date: result.session.date,
          contextId: selectedContext.id,
          learnerView: 'upcoming',
          focusOccurrenceId: occurrenceFocusId,
          focusSessionId: result.session.id,
        });
        return;
      }

      const saved = plan
        ? await service.updatePlan(plan.id, currentValues, categoryDraft.selections)
        : await service.createPlan(selectedContext.id, currentValues, categoryDraft.selections);
      if (scheduleAfterSave) {
        window.location.hash = buildSessionEditorHref({
          planId: saved.id,
          date: initialDate,
          returnTo,
        });
      } else if (returnTo === 'learners') {
        window.location.hash = learnerHref(selectedContext.id, learnerView, learnerReturnDate);
      } else {
        window.location.hash = buildPlanningSurfaceHref({
          returnTo,
          date: surfaceDate,
          contextId: selectedContext.id,
          focusSessionId: activeSession?.id,
          focusOccurrenceId: occurrenceFocusId,
        });
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
              focusOccurrenceId: occurrenceFocusId,
            });
    } catch (cause) {
      setError(getErrorMessage(cause));
      setSaving(false);
    }
  }

  return (
    <section className={styles.editor} aria-label="Planning item editor">
      <div className={styles.editorHeader}>
        <div>
          <p className="page-eyebrow">Planning item</p>
          <h1>{plan ? 'Edit plan' : 'New plan'}</h1>
          <p>{selectedContext.name}</p>
        </div>
        <a className="button" href={backHref}>
          <ArrowLeft aria-hidden="true" size={17} />
          {returnTo === 'learners'
            ? 'Back to Learners'
            : `Back to ${returnTo === 'today' ? 'Today' : returnTo === 'week' ? 'Week' : 'Calendar'}`}
        </a>
      </div>

      {planningOccurrence ? (
        <section
          className={styles.occurrenceSummary}
          aria-label={`Planning ${planningOccurrence.block.title} on ${planningOccurrence.date}`}
        >
          <Clock3 aria-hidden="true" size={20} />
          <div>
            <strong>{planningOccurrence.block.title}</strong>
            <span>
              {formatLongDate(planningOccurrence.date)} ·{' '}
              {formatCalendarMinute(planningOccurrence.block.startMinute)}–
              {formatCalendarMinute(planningOccurrence.block.endMinute)}
              {planningOccurrence.adjusted ? ' · Adjusted occurrence' : ''}
            </span>
            <p>
              This Schedule Block supplies the occurrence date and time. The selected learner
              context owns the Plan and Session.
            </p>
          </div>
          {onChangeContext ? (
            <button className="button" type="button" disabled={saving} onClick={onChangeContext}>
              Change context
            </button>
          ) : null}
        </section>
      ) : null}

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
            {assignableLessonSeries.map((series) => (
              <option key={series.id} value={series.id}>
                {series.title}
                {series.lifecycleState === 'archived' ? ' (Archived)' : ''}
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
            disabled={Boolean(planningOccurrence)}
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

      <CategoryAssignmentFields
        snapshot={categoryDraft.snapshot}
        selectedSets={categoryDraft.selectedSets}
        disabled={saving}
        onToggle={categoryDraft.toggle}
      />

      <LessonFlowEditor
        idPrefix="planning-item"
        values={{
          learningTarget: values.learningTarget,
          notes: values.notes,
          lessonFlow: values.lessonFlow,
        }}
        disabled={saving}
        onChange={(updateContent) => {
          applyValues((current) => {
            const content = updateContent({
              learningTarget: current.learningTarget,
              notes: current.notes,
              lessonFlow: current.lessonFlow,
            });
            return { ...current, ...content };
          });
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

      <div
        className={`editor-action-bar ${styles.actions}`}
        role="group"
        aria-label="Editor actions"
      >
        <button
          className="button button-primary"
          type="button"
          disabled={saving}
          onClick={() => void save(false)}
        >
          <Save aria-hidden="true" size={17} />{' '}
          {saving ? 'Saving…' : planningOccurrence && !plan ? 'Save plan to block' : 'Save plan'}
        </button>
        {!planningOccurrence && !activeSession ? (
          <button
            className="button"
            type="button"
            disabled={saving}
            onClick={() => void save(true)}
          >
            <CalendarPlus aria-hidden="true" size={17} /> Save and schedule
          </button>
        ) : activeSession ? (
          <a
            className="button"
            href={`#/planning/session?session=${encodeURIComponent(activeSession.id)}&date=${surfaceDate}${returnTo === 'learners' ? '' : `&return=${returnTo}`}`}
          >
            <CalendarPlus aria-hidden="true" size={17} /> Manage session
          </a>
        ) : null}
        {plan ? (
          <EditorActionMenu>
            <button
              className={deleteArmed ? 'button button-danger' : 'button'}
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
          </EditorActionMenu>
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
  planningOccurrence,
  suggestedContextId,
}: {
  contexts: LearnerContext[];
  date: string;
  onSelect: (contextId: string) => Promise<void> | void;
  returnTo: PlanningReturnTarget;
  planningOccurrence?: PlanningScheduleOccurrence | null;
  suggestedContextId?: string;
}) {
  const initialContextId = contexts.some((context) => context.id === suggestedContextId)
    ? suggestedContextId!
    : (contexts[0]?.id ?? '');
  const [contextId, setContextId] = useState(initialContextId);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function continueToPlan(): Promise<void> {
    if (!contextId || selecting) return;
    setSelecting(true);
    setError(null);
    try {
      await onSelect(contextId);
    } catch (cause) {
      setError(getErrorMessage(cause));
      setSelecting(false);
    }
  }

  return (
    <section className={`card ${styles.contextPicker}`} aria-labelledby="planning-context-heading">
      <div>
        <Users aria-hidden="true" size={22} />
        <div>
          <p className="page-eyebrow">Planning destination</p>
          <h1 id="planning-context-heading">Choose who this lesson is for</h1>
          <p>
            {planningOccurrence
              ? 'The Schedule Block suggests a context when available, but you may choose any active Class, Group, or Individual.'
              : returnTo === 'learners'
                ? 'Select a Class, Group, or Individual before creating the planning item.'
                : `The session date will start on ${formatLongDate(date)} if you choose Save and schedule.`}
          </p>
        </div>
      </div>

      {planningOccurrence ? (
        <div className={styles.contextOccurrence} aria-label="Selected schedule occurrence">
          <Clock3 aria-hidden="true" size={18} />
          <div>
            <strong>{planningOccurrence.block.title}</strong>
            <span>
              {formatLongDate(planningOccurrence.date)} ·{' '}
              {formatCalendarMinute(planningOccurrence.block.startMinute)}–
              {formatCalendarMinute(planningOccurrence.block.endMinute)}
            </span>
          </div>
        </div>
      ) : null}

      <label>
        <span>Learner context</span>
        <select
          value={contextId}
          disabled={selecting}
          onChange={(event) => {
            setContextId(event.target.value);
            setError(null);
          }}
        >
          {contexts.map((context) => (
            <option key={context.id} value={context.id}>
              {context.name} ·{' '}
              {context.kind === 'class'
                ? 'Class'
                : context.kind === 'group'
                  ? 'Group'
                  : 'Individual'}
              {context.id === suggestedContextId ? ' · Suggested' : ''}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <p className={styles.errorMessage} role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="button button-primary"
        type="button"
        disabled={!contextId || selecting}
        onClick={() => void continueToPlan()}
      >
        {selecting ? 'Opening plan…' : 'Continue to plan'}
      </button>
    </section>
  );
}

export function PlanningEditorRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedContextId = searchParams.get('context');
  const planId = searchParams.get('plan');
  const requestedBlockId = searchParams.get('block');
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
    const allScheduleBlocks = (await classroomDb.scheduleBlocks.toArray()).map((value) =>
      scheduleBlockSchema.parse(value),
    );
    let planningOccurrence: PlanningScheduleOccurrence | null = null;
    let planningOccurrenceError: string | null = null;
    if (requestedBlockId) {
      const sourceBlock = allScheduleBlocks.find((block) => block.id === requestedBlockId);
      if (!sourceBlock) {
        planningOccurrenceError = 'The selected Schedule Block no longer exists.';
      } else if (
        sourceBlock.archivedAt ||
        sourceBlock.kind !== 'teachable' ||
        !sourceBlock.planningEnabled
      ) {
        planningOccurrenceError = 'This Schedule Block is not eligible for lesson planning.';
      } else {
        const exceptionValues = await classroomDb.scheduleExceptions
          .where('date')
          .equals(initialDate)
          .toArray();
        const exceptions: ScheduleException[] = exceptionValues.map((value) =>
          scheduleExceptionSchema.parse(value),
        );
        try {
          const resolved = resolveScheduleOccurrence(sourceBlock, initialDate, exceptions);
          if (!resolved) {
            planningOccurrenceError = 'This Schedule Block does not occur on the selected date.';
          } else {
            planningOccurrence = {
              block: resolved.block,
              date: initialDate,
              adjusted: resolved.adjusted,
            };
          }
        } catch (cause) {
          planningOccurrenceError = getErrorMessage(cause);
        }
      }
    }
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
    const scheduleBlocks = allScheduleBlocks
      .filter(
        (block) =>
          !block.archivedAt &&
          block.kind === 'teachable' &&
          (block.planningEnabled ||
            block.id === plan?.preferredScheduleBlockId ||
            block.id === planningOccurrence?.block.id) &&
          (!context ||
            !block.contextId ||
            block.contextId === context.id ||
            block.id === planningOccurrence?.block.id),
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
      planningOccurrence,
      planningOccurrenceError,
    };
  }, [initialDate, planId, requestedBlockId, requestedContextId]);

  if (snapshot === undefined) {
    return (
      <div className={`card ${styles.statePanel}`} role="status">
        Loading planning item…
      </div>
    );
  }

  const readySnapshot = snapshot;

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

  if (requestedBlockId && snapshot.planningOccurrenceError) {
    const backHref = buildPlanningSurfaceHref({
      returnTo,
      date: initialDate,
      contextId: snapshot.context?.id ?? '',
      focusOccurrenceId: `schedule-block:${requestedBlockId}:${initialDate}`,
    });
    return (
      <div className={`card ${styles.errorPanel}`} role="alert">
        <h1>Schedule occurrence unavailable</h1>
        <p>{snapshot.planningOccurrenceError}</p>
        <a className="button" href={backHref}>
          Back to {returnTo === 'today' ? 'Today' : returnTo === 'week' ? 'Week' : 'Calendar'}
        </a>
      </div>
    );
  }

  if (!planId && snapshot.context?.status === 'archived') {
    return (
      <div className={`card ${styles.errorPanel}`} role="alert">
        <h1>Restore this learner context</h1>
        <p>Archived Classes, Groups, and Individuals cannot receive a new lesson plan.</p>
        <a
          className="button"
          href={`#/learners?context=${encodeURIComponent(snapshot.context.id)}&status=archived`}
        >
          Manage archived context
        </a>
      </div>
    );
  }

  async function selectContext(contextId: string): Promise<void> {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('context', contextId);
    nextParams.delete('plan');

    const planningOccurrence = readySnapshot.planningOccurrence;
    if (planningOccurrence) {
      const matchingSessions = (
        await classroomDb.sessionOccurrences.where('contextId').equals(contextId).toArray()
      )
        .map((value) => sessionOccurrenceSchema.parse(value))
        .filter(
          (session) =>
            session.scheduleBlockId === planningOccurrence.block.id &&
            session.date === planningOccurrence.date &&
            session.deliveryState !== 'cancelled',
        )
        .sort((first, second) => first.id.localeCompare(second.id));
      if (matchingSessions.length > 1) {
        throw new Error(
          'Multiple sessions already use this schedule occurrence and learner context.',
        );
      }
      if (matchingSessions[0]) {
        nextParams.set('plan', matchingSessions[0].lessonPlanId);
      }
    }

    setSearchParams(nextParams);
  }

  function changeContext(): void {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('context');
    nextParams.delete('plan');
    setSearchParams(nextParams);
  }

  return (
    <section className="page">
      {!snapshot.context ? (
        snapshot.contexts.length > 0 ? (
          <PlanningContextPicker
            contexts={snapshot.contexts}
            date={initialDate}
            returnTo={returnTo}
            planningOccurrence={snapshot.planningOccurrence}
            suggestedContextId={snapshot.planningOccurrence?.block.contextId}
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
          key={
            snapshot.plan?.id ??
            `new-${snapshot.context.id}-${initialDate}-${snapshot.planningOccurrence?.block.id ?? 'free'}`
          }
          snapshot={snapshot}
          initialDate={initialDate}
          returnTo={returnTo}
          onChangeContext={snapshot.planningOccurrence ? changeContext : undefined}
        />
      )}
    </section>
  );
}

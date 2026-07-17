import { ArrowLeft, CalendarPlus, Save, Trash2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ZodError } from 'zod';

import { classroomDb } from '@/data/db/ClassroomDatabase';
import {
  learnerContextSchema,
  lessonPlanSchema,
  scheduleBlockSchema,
  sessionOccurrenceSchema,
  type LearnerContext,
  type LessonPlan,
  type ScheduleBlock,
  type SessionOccurrence,
} from '@/domain/models/entities';
import { LessonFlowEditor } from '@/features/planning/LessonFlowEditor';
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

import styles from './PlanningEditorRoute.module.css';

interface PlanningEditorSnapshot {
  context: LearnerContext | null;
  plan: LessonPlan | null;
  sessions: SessionOccurrence[];
  scheduleBlocks: ScheduleBlock[];
}

function getErrorMessage(cause: unknown): string {
  if (cause instanceof ZodError) {
    return cause.issues[0]?.message ?? 'Check the planning details.';
  }
  return cause instanceof Error ? cause.message : 'The planning item could not be saved.';
}

function learnerHref(contextId: string, view: 'upcoming' | 'unscheduled' | 'completed'): string {
  return `#/learners?context=${encodeURIComponent(contextId)}&planning=${view}`;
}

function PlanningEditorForm({
  snapshot,
  service = planningMutationService,
}: {
  snapshot: PlanningEditorSnapshot;
  service?: PlanningMutationService;
}) {
  const navigate = useNavigate();
  const { context, plan, sessions, scheduleBlocks } = snapshot;
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

  if (!context) return null;
  const selectedContext = context;

  const activeSession = sessions.find(
    (session) => session.deliveryState === 'scheduled' || session.deliveryState === 'completed',
  );
  const learnerView =
    activeSession?.deliveryState === 'completed'
      ? 'completed'
      : activeSession
        ? 'upcoming'
        : 'unscheduled';

  function update<K extends keyof LessonPlanEditorValues>(
    key: K,
    value: LessonPlanEditorValues[K],
  ): void {
    setValues((current) => ({ ...current, [key]: value }));
    setError(null);
    setDeleteArmed(false);
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
        navigate(`/planning/session?plan=${encodeURIComponent(saved.id)}`);
      } else {
        window.location.hash = learnerHref(selectedContext.id, learnerView);
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
      await service.deletePlan(plan.id);
      window.location.hash = learnerHref(selectedContext.id, 'unscheduled');
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
        <a className="button" href={learnerHref(selectedContext.id, learnerView)}>
          <ArrowLeft aria-hidden="true" size={17} /> Back to Learners
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

      {activeSession ? (
        <p className={styles.notice} role="status">
          This plan already has a {activeSession.deliveryState} session. Manage that session before
          scheduling another occurrence.
        </p>
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
            href={`#/planning/session?session=${encodeURIComponent(activeSession.id)}`}
          >
            <CalendarPlus aria-hidden="true" size={17} /> Manage session
          </a>
        )}
        {plan ? (
          <button
            className={deleteArmed ? styles.dangerButton : 'button'}
            type="button"
            disabled={saving || sessions.length > 0}
            title={
              sessions.length > 0 ? 'Unschedule the session before deleting this plan.' : undefined
            }
            onClick={() => void remove()}
          >
            <Trash2 aria-hidden="true" size={17} />
            {deleteArmed ? 'Confirm delete' : 'Delete plan'}
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function PlanningEditorRoute() {
  const [searchParams] = useSearchParams();
  const requestedContextId = searchParams.get('context');
  const planId = searchParams.get('plan');

  const snapshot = useLiveQuery(async (): Promise<PlanningEditorSnapshot> => {
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

    return { context, plan, sessions, scheduleBlocks };
  }, [planId, requestedContextId]);

  if (snapshot === undefined) {
    return (
      <div className={`card ${styles.statePanel}`} role="status">
        Loading planning item…
      </div>
    );
  }

  if (!snapshot.context || (planId && !snapshot.plan)) {
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

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Phase 3C</p>
          <h1>Planning</h1>
          <p>Create reusable teaching content before assigning a date and time.</p>
        </div>
      </header>
      <PlanningEditorForm
        key={snapshot.plan?.id ?? `new-${snapshot.context.id}`}
        snapshot={snapshot}
      />
    </section>
  );
}

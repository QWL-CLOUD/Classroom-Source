import { ArrowLeft, CheckCircle2, RotateCcw, Save, Undo2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { minuteToTime } from '@/features/editing/calendarEventEditorModel';
import {
  createSessionEditorValues,
  toSessionEditorValues,
  type SessionEditorValues,
} from '@/features/planning/planningEditorModel';
import {
  planningMutationService,
  type PlanningMutationService,
} from '@/features/planning/planningMutationService';
import { resolveScheduleOccurrence } from '@/features/scheduleExceptions/scheduleOccurrenceResolver';
import { useScheduleExceptionsForRange } from '@/features/scheduleExceptions/useScheduleExceptionsForRange';
import { formatCalendarMinute } from '@/features/calendar/calendarReadModel';
import { formatLongDate, parseLocalDate, todayLocalDate } from '@/shared/dates/localDate';

import styles from './SessionEditorRoute.module.css';

interface SessionEditorSnapshot {
  context: LearnerContext | null;
  plan: LessonPlan | null;
  session: SessionOccurrence | null;
  scheduleBlocks: ScheduleBlock[];
}

function getErrorMessage(cause: unknown): string {
  if (cause instanceof ZodError) {
    return cause.issues[0]?.message ?? 'Check the session details.';
  }
  return cause instanceof Error ? cause.message : 'The session could not be saved.';
}

function learnerHref(contextId: string, view: 'upcoming' | 'unscheduled' | 'completed'): string {
  return `#/learners?context=${encodeURIComponent(contextId)}&planning=${view}`;
}

function SessionEditorForm({
  snapshot,
  initialDate,
  service = planningMutationService,
}: {
  snapshot: SessionEditorSnapshot;
  initialDate: string;
  service?: PlanningMutationService;
}) {
  const { context, plan, session, scheduleBlocks } = snapshot;
  const defaultBlockId = session?.scheduleBlockId ?? plan?.preferredScheduleBlockId ?? '';
  const defaultBlock = scheduleBlocks.find((block) => block.id === defaultBlockId);
  const [values, setValues] = useState<SessionEditorValues>(() =>
    session
      ? toSessionEditorValues(session)
      : createSessionEditorValues(
          initialDate,
          defaultBlockId,
          defaultBlock?.startMinute ?? 540,
          defaultBlock?.endMinute ??
            (defaultBlock?.startMinute !== undefined
              ? defaultBlock.startMinute + (plan?.durationMinutes ?? 60)
              : 600),
        ),
  );
  const [saving, setSaving] = useState(false);
  const [unscheduleArmed, setUnscheduleArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exceptionDate = parseLocalDate(values.date) ? values.date : initialDate;
  const scheduleExceptions = useScheduleExceptionsForRange(exceptionDate, exceptionDate);

  const selectedBlock = useMemo(
    () => scheduleBlocks.find((block) => block.id === values.scheduleBlockId),
    [scheduleBlocks, values.scheduleBlockId],
  );
  const occurrenceResolution = useMemo(() => {
    if (!selectedBlock || !scheduleExceptions || !parseLocalDate(values.date)) {
      return { occurrence: null, error: null };
    }

    try {
      return {
        occurrence: resolveScheduleOccurrence(selectedBlock, values.date, scheduleExceptions),
        error: null,
      };
    } catch (cause) {
      return { occurrence: null, error: getErrorMessage(cause) };
    }
  }, [scheduleExceptions, selectedBlock, values.date]);
  const resolvedOccurrence = occurrenceResolution.occurrence;

  useEffect(() => {
    if (!resolvedOccurrence) return;
    setValues((current) => ({
      ...current,
      startTime: minuteToTime(resolvedOccurrence.block.startMinute),
      endTime: minuteToTime(resolvedOccurrence.block.endMinute),
    }));
  }, [resolvedOccurrence]);

  if (!context || !plan) return null;
  const selectedContext = context;
  const selectedPlan = plan;

  function update<K extends keyof SessionEditorValues>(
    key: K,
    value: SessionEditorValues[K],
  ): void {
    setValues((current) => ({ ...current, [key]: value }));
    setError(null);
    setUnscheduleArmed(false);
  }

  async function save(): Promise<void> {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = session
        ? await service.updateSession(session.id, values)
        : await service.schedulePlan(selectedPlan.id, values);
      window.location.hash = learnerHref(saved.contextId, 'upcoming');
    } catch (cause) {
      setError(getErrorMessage(cause));
      setSaving(false);
    }
  }

  async function changeCompletion(): Promise<void> {
    if (!session || saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated =
        session.deliveryState === 'completed'
          ? await service.reopenSession(session.id)
          : await service.completeSession(session.id);
      window.location.hash = learnerHref(
        updated.contextId,
        updated.deliveryState === 'completed' ? 'completed' : 'upcoming',
      );
    } catch (cause) {
      setError(getErrorMessage(cause));
      setSaving(false);
    }
  }

  async function unschedule(): Promise<void> {
    if (!session || saving) return;
    if (!unscheduleArmed) {
      setUnscheduleArmed(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await service.unscheduleSession(session.id);
      window.location.hash = learnerHref(selectedContext.id, 'unscheduled');
    } catch (cause) {
      setError(getErrorMessage(cause));
      setSaving(false);
    }
  }

  const backView =
    session?.deliveryState === 'completed' ? 'completed' : session ? 'upcoming' : 'unscheduled';

  return (
    <section className={`card ${styles.editor}`} aria-label="Session editor">
      <div className={styles.editorHeader}>
        <div>
          <p className="page-eyebrow">Scheduled session</p>
          <h2>{selectedPlan.title}</h2>
          <p>{selectedContext.name}</p>
        </div>
        <a className="button" href={learnerHref(selectedContext.id, backView)}>
          <ArrowLeft aria-hidden="true" size={17} /> Back to Learners
        </a>
      </div>

      {session ? (
        <div className={styles.statusStrip} role="status">
          <strong>{session.deliveryState === 'completed' ? 'Completed' : 'Scheduled'}</strong>
          <span>{formatLongDate(session.date)}</span>
          <span>
            {formatCalendarMinute(session.startMinute)}–{formatCalendarMinute(session.endMinute)}
          </span>
        </div>
      ) : null}

      <div className={styles.formGrid}>
        <label>
          <span>Date</span>
          <input
            type="date"
            value={values.date}
            onChange={(event) => update('date', event.target.value)}
          />
        </label>

        <label>
          <span>Schedule block</span>
          <select
            value={values.scheduleBlockId}
            onChange={(event) => update('scheduleBlockId', event.target.value)}
          >
            <option value="">Manual time</option>
            {scheduleBlocks.map((block) => (
              <option key={block.id} value={block.id}>
                {block.title}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Start time</span>
          <input
            type="time"
            value={values.startTime}
            disabled={Boolean(values.scheduleBlockId)}
            onChange={(event) => update('startTime', event.target.value)}
          />
        </label>

        <label>
          <span>End time</span>
          <input
            type="time"
            value={values.endTime}
            disabled={Boolean(values.scheduleBlockId)}
            onChange={(event) => update('endTime', event.target.value)}
          />
        </label>
      </div>

      {selectedBlock ? (
        resolvedOccurrence ? (
          <p className={styles.inheritanceNote}>
            Time inherited from {resolvedOccurrence.block.title} on {formatLongDate(values.date)}:{' '}
            {formatCalendarMinute(resolvedOccurrence.block.startMinute)}–
            {formatCalendarMinute(resolvedOccurrence.block.endMinute)}.
          </p>
        ) : (
          <p className={styles.warning} role="alert">
            {occurrenceResolution.error ??
              'This schedule block does not occur on the selected date. Choose another date, another block, or Manual time.'}
          </p>
        )
      ) : (
        <p className={styles.inheritanceNote}>
          Manual sessions keep the date and time entered here without changing the recurring
          schedule.
        </p>
      )}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.actions}>
        <button
          className="button button-primary"
          type="button"
          disabled={saving || Boolean(selectedBlock && !resolvedOccurrence)}
          onClick={() => void save()}
        >
          <Save aria-hidden="true" size={17} />{' '}
          {saving ? 'Saving…' : session ? 'Save session' : 'Schedule session'}
        </button>

        {session ? (
          <button
            className="button"
            type="button"
            disabled={saving}
            onClick={() => void changeCompletion()}
          >
            {session.deliveryState === 'completed' ? (
              <RotateCcw aria-hidden="true" size={17} />
            ) : (
              <CheckCircle2 aria-hidden="true" size={17} />
            )}
            {session.deliveryState === 'completed' ? 'Reopen session' : 'Mark complete'}
          </button>
        ) : null}

        {session ? (
          <button
            className={unscheduleArmed ? styles.dangerButton : 'button'}
            type="button"
            disabled={saving}
            onClick={() => void unschedule()}
          >
            <Undo2 aria-hidden="true" size={17} />
            {unscheduleArmed ? 'Confirm unschedule' : 'Return to Unscheduled'}
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function SessionEditorRoute() {
  const [searchParams] = useSearchParams();
  const planId = searchParams.get('plan');
  const sessionId = searchParams.get('session');
  const requestedDate = searchParams.get('date');
  const initialDate = parseLocalDate(requestedDate) ? requestedDate! : todayLocalDate();

  const snapshot = useLiveQuery(async (): Promise<SessionEditorSnapshot> => {
    const sessionValue = sessionId
      ? await classroomDb.sessionOccurrences.get(sessionId)
      : undefined;
    const session = sessionValue ? sessionOccurrenceSchema.parse(sessionValue) : null;
    const resolvedPlanId = session?.lessonPlanId ?? planId;
    const planValue = resolvedPlanId
      ? await classroomDb.lessonPlans.get(resolvedPlanId)
      : undefined;
    const plan = planValue ? lessonPlanSchema.parse(planValue) : null;
    const contextValue = plan ? await classroomDb.learnerContexts.get(plan.contextId) : undefined;
    const context = contextValue ? learnerContextSchema.parse(contextValue) : null;
    const scheduleBlocks = (await classroomDb.scheduleBlocks.toArray())
      .map((value) => scheduleBlockSchema.parse(value))
      .filter(
        (block) =>
          !block.archivedAt &&
          block.kind === 'teachable' &&
          (block.planningEnabled ||
            block.id === plan?.preferredScheduleBlockId ||
            block.id === session?.scheduleBlockId) &&
          (!context || !block.contextId || block.contextId === context.id),
      )
      .sort(
        (first, second) =>
          first.startMinute - second.startMinute || first.title.localeCompare(second.title),
      );

    return { context, plan, session, scheduleBlocks };
  }, [planId, sessionId]);

  if (snapshot === undefined) {
    return (
      <div className={`card ${styles.statePanel}`} role="status">
        Loading session…
      </div>
    );
  }

  if (!snapshot.context || !snapshot.plan || (sessionId && !snapshot.session)) {
    return (
      <div className={`card ${styles.errorPanel}`} role="alert">
        <h1>Session unavailable</h1>
        <p>The requested plan, session, or learner context could not be found.</p>
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
          <h1>Session</h1>
          <p>Assign a date and time, then keep completion synchronized across Classroom.</p>
        </div>
      </header>
      <SessionEditorForm
        key={snapshot.session?.id ?? `new-${snapshot.plan.id}`}
        snapshot={snapshot}
        initialDate={initialDate}
      />
    </section>
  );
}

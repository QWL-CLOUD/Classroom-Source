import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  FastForward,
  RefreshCcw,
  RotateCcw,
  Save,
  Undo2,
  X,
} from 'lucide-react';
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
import { formatCalendarMinute } from '@/features/calendar/calendarReadModel';
import { minuteToTime } from '@/features/editing/calendarEventEditorModel';
import { LessonFlowEditor, LessonFlowPreview } from '@/features/planning/LessonFlowEditor';
import {
  buildPlanningSurfaceHref,
  parsePlanningReturnTarget,
  type PlanningReturnTarget,
} from '@/features/planning/planningNavigation';
import {
  createLessonContentEditorValues,
  createSessionEditorValues,
  resolveSessionLessonContent,
  toSessionEditorValues,
  type LessonContentEditorValues,
  type SessionEditorValues,
} from '@/features/planning/planningEditorModel';
import {
  planningMutationService,
  type PlanningMutationService,
} from '@/features/planning/planningMutationService';
import type { SeriesBumpPreview } from '@/features/planning/seriesBumpPlanner';
import { resolveScheduleOccurrence } from '@/features/scheduleExceptions/scheduleOccurrenceResolver';
import { useScheduleExceptionsForRange } from '@/features/scheduleExceptions/useScheduleExceptionsForRange';
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

function SessionEditorForm({
  snapshot,
  initialDate,
  returnTo,
  service = planningMutationService,
}: {
  snapshot: SessionEditorSnapshot;
  initialDate: string;
  returnTo: PlanningReturnTarget;
  service?: PlanningMutationService;
}) {
  const { context, plan, session, scheduleBlocks } = snapshot;
  const defaultBlockId = session?.scheduleBlockId ?? plan?.preferredScheduleBlockId ?? '';
  const defaultBlock = scheduleBlocks.find((block) => block.id === defaultBlockId);
  const [values, setValues] = useState<SessionEditorValues>(() => {
    if (!plan) {
      return createSessionEditorValues(
        initialDate,
        defaultBlockId,
        defaultBlock?.startMinute ?? 540,
        defaultBlock?.endMinute ?? 600,
      );
    }
    return session
      ? toSessionEditorValues(session, plan)
      : createSessionEditorValues(
          initialDate,
          defaultBlockId,
          defaultBlock?.startMinute ?? 540,
          defaultBlock?.endMinute ??
            (defaultBlock?.startMinute !== undefined
              ? defaultBlock.startMinute + (plan.durationMinutes ?? 60)
              : 600),
          plan,
        );
  });
  const [saving, setSaving] = useState(false);
  const [bumpLoading, setBumpLoading] = useState(false);
  const [bumpPreview, setBumpPreview] = useState<SeriesBumpPreview | null>(null);
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
  const inheritedContent = resolveSessionLessonContent(selectedPlan).content;

  function returnHref(options: {
    date: string;
    sessionId?: string;
    learnerView: 'upcoming' | 'unscheduled' | 'completed';
  }): string {
    return buildPlanningSurfaceHref({
      returnTo,
      date: options.date,
      contextId: selectedContext.id,
      learnerView: options.learnerView,
      focusSessionId: options.sessionId,
    });
  }

  function update<K extends keyof SessionEditorValues>(
    key: K,
    value: SessionEditorValues[K],
  ): void {
    setValues((current) => ({ ...current, [key]: value }));
    setError(null);
    setBumpPreview(null);
    setUnscheduleArmed(false);
  }

  function updateContent(content: LessonContentEditorValues): void {
    setValues((current) => ({ ...current, ...content }));
    setError(null);
    setBumpPreview(null);
    setUnscheduleArmed(false);
  }

  function customizeContent(): void {
    setValues((current) => ({
      ...current,
      contentMode: 'custom',
      ...createLessonContentEditorValues(inheritedContent),
    }));
    setError(null);
  }

  function restoreInheritedContent(): void {
    setValues((current) => ({
      ...current,
      contentMode: 'inherit',
      ...createLessonContentEditorValues(inheritedContent),
    }));
    setError(null);
  }

  async function save(): Promise<void> {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = session
        ? await service.updateSession(session.id, values)
        : await service.schedulePlan(selectedPlan.id, values);
      window.location.hash = returnHref({
        date: saved.date,
        sessionId: saved.id,
        learnerView: 'upcoming',
      });
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
      window.location.hash = returnHref({
        date: updated.date,
        sessionId: updated.id,
        learnerView: updated.deliveryState === 'completed' ? 'completed' : 'upcoming',
      });
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
      window.location.hash = returnHref({
        date: session.date,
        learnerView: 'unscheduled',
      });
    } catch (cause) {
      setError(getErrorMessage(cause));
      setSaving(false);
    }
  }

  async function previewBump(): Promise<void> {
    if (!session || saving || bumpLoading) return;
    setBumpLoading(true);
    setError(null);
    try {
      setBumpPreview(await service.previewSeriesBump(session.id));
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setBumpLoading(false);
    }
  }

  async function confirmBump(): Promise<void> {
    if (!session || !bumpPreview || !bumpPreview.canCommit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const committed = await service.bumpSeries(session.id, bumpPreview.previewToken);
      const selectedMove = committed.items.find((item) => item.sessionId === session.id);
      window.location.hash = returnHref({
        date: selectedMove?.toDate ?? session.date,
        sessionId: session.id,
        learnerView: 'upcoming',
      });
    } catch (cause) {
      setError(getErrorMessage(cause));
      setSaving(false);
      setBumpPreview(null);
    }
  }

  const bumpBlock = session?.scheduleBlockId
    ? scheduleBlocks.find((block) => block.id === session.scheduleBlockId)
    : undefined;
  const hasUnsavedScheduleChanges = Boolean(
    session &&
    (values.date !== session.date ||
      values.scheduleBlockId !== (session.scheduleBlockId ?? '') ||
      values.startTime !== minuteToTime(session.startMinute) ||
      values.endTime !== minuteToTime(session.endMinute)),
  );
  const bumpUnavailableReason = !session
    ? null
    : session.deliveryState !== 'scheduled'
      ? 'Completed sessions cannot start a Bump.'
      : hasUnsavedScheduleChanges
        ? 'Save this Session date and time before previewing Bump.'
        : !selectedPlan.seriesId
          ? 'Assign this plan to a Lesson Series before using Bump.'
          : !session.scheduleBlockId
            ? 'Attach this session to a Schedule Block before using Bump.'
            : !bumpBlock?.bumpEnabled
              ? 'Enable Bump on this Schedule Block before shifting the lesson series.'
              : null;

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
        <a
          className="button"
          href={returnHref({
            date: session?.date ?? initialDate,
            sessionId: session?.id,
            learnerView: backView,
          })}
        >
          <ArrowLeft aria-hidden="true" size={17} />
          {returnTo === 'learners'
            ? 'Back to Learners'
            : `Back to ${returnTo === 'today' ? 'Today' : returnTo === 'week' ? 'Week' : 'Calendar'}`}
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

      <section className={styles.schedulingSection} aria-labelledby="session-schedule-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className="page-eyebrow">Schedule</p>
            <h3 id="session-schedule-heading">Date and time</h3>
          </div>
        </div>

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
      </section>

      {session ? (
        <section className={styles.bumpSection} aria-labelledby="series-bump-heading">
          <div className={styles.bumpHeader}>
            <div>
              <p className="page-eyebrow">Lesson Series</p>
              <h3 id="series-bump-heading">Bump this lesson forward</h3>
              <p>
                Preview one-occurrence shifts for this Session and later scheduled lessons in the
                same Series. Nothing changes until you confirm.
              </p>
            </div>
            {!bumpPreview ? (
              <button
                className="button"
                type="button"
                disabled={saving || bumpLoading || Boolean(bumpUnavailableReason)}
                onClick={() => void previewBump()}
              >
                <FastForward aria-hidden="true" size={16} />
                {bumpLoading ? 'Building preview…' : 'Preview bump'}
              </button>
            ) : null}
          </div>

          {bumpUnavailableReason ? (
            <p className={styles.bumpUnavailable}>{bumpUnavailableReason}</p>
          ) : null}

          {bumpPreview ? (
            <div className={styles.bumpPreview} role="region" aria-label="Bump preview">
              <div className={styles.bumpPreviewHeading}>
                <div>
                  <strong>{bumpPreview.seriesTitle}</strong>
                  <span>
                    {bumpPreview.items.length}{' '}
                    {bumpPreview.items.length === 1 ? 'session' : 'sessions'} affected
                  </span>
                </div>
                <button
                  className="button"
                  type="button"
                  disabled={saving}
                  onClick={() => setBumpPreview(null)}
                >
                  <X aria-hidden="true" size={16} /> Cancel preview
                </button>
              </div>

              <ol className={styles.bumpList}>
                {bumpPreview.items.map((item) => (
                  <li key={item.sessionId}>
                    <div>
                      <strong>
                        Lesson {item.seriesPosition}: {item.planTitle}
                      </strong>
                      {item.adjustedOccurrence ? <span>Adjusted occurrence</span> : null}
                    </div>
                    <p>
                      {formatLongDate(item.fromDate)} · {formatCalendarMinute(item.fromStartMinute)}
                      –{formatCalendarMinute(item.fromEndMinute)}
                    </p>
                    <p className={styles.bumpTarget}>
                      → {formatLongDate(item.toDate)} · {formatCalendarMinute(item.toStartMinute)}–
                      {formatCalendarMinute(item.toEndMinute)}
                    </p>
                  </li>
                ))}
              </ol>

              {bumpPreview.blockingIssues.length > 0 ? (
                <div className={styles.bumpIssues} role="alert">
                  <AlertTriangle aria-hidden="true" size={18} />
                  <div>
                    <strong>Bump cannot be committed</strong>
                    <ul>
                      {bumpPreview.blockingIssues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <p className={styles.bumpReady} role="status">
                  Preview ready. The entire shift will be saved as one undoable change.
                </p>
              )}

              <button
                className="button button-primary"
                type="button"
                disabled={saving || !bumpPreview.canCommit}
                onClick={() => void confirmBump()}
              >
                <FastForward aria-hidden="true" size={16} />
                {saving ? 'Bumping…' : 'Confirm bump'}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className={styles.contentSection} aria-labelledby="session-content-heading">
        <div className={styles.contentHeader}>
          <div>
            <p className="page-eyebrow">Teaching content</p>
            <h3 id="session-content-heading">Session lesson flow</h3>
            <p>
              {values.contentMode === 'inherit'
                ? 'Inherited from the planning item. Plan edits continue to flow into this session.'
                : 'Customized for this occurrence. Future plan edits will not replace these details.'}
            </p>
          </div>
          {values.contentMode === 'inherit' ? (
            <button className="button" type="button" disabled={saving} onClick={customizeContent}>
              <Copy aria-hidden="true" size={16} /> Customize this session
            </button>
          ) : (
            <button
              className="button"
              type="button"
              disabled={saving}
              onClick={restoreInheritedContent}
            >
              <RefreshCcw aria-hidden="true" size={16} /> Use plan content
            </button>
          )}
        </div>

        <div className={styles.contentSourceBadge} role="status">
          {values.contentMode === 'inherit'
            ? 'Plan content · live inheritance'
            : 'Session override'}
        </div>

        {values.contentMode === 'inherit' ? (
          <LessonFlowPreview content={inheritedContent} />
        ) : (
          <LessonFlowEditor
            idPrefix="session-content"
            values={{
              learningTarget: values.learningTarget,
              notes: values.notes,
              lessonFlow: values.lessonFlow,
            }}
            disabled={saving}
            onChange={updateContent}
          />
        )}
      </section>

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
  const returnTo = parsePlanningReturnTarget(searchParams.get('return'));

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
          <p>Schedule the lesson, inherit its teaching flow, or customize this occurrence.</p>
        </div>
      </header>
      <SessionEditorForm
        key={snapshot.session?.id ?? `new-${snapshot.plan.id}`}
        snapshot={snapshot}
        initialDate={initialDate}
        returnTo={returnTo}
      />
    </section>
  );
}

import { Activity, Archive, ArrowLeft, RotateCcw, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ZodError } from 'zod';

import type {
  LearnerContext,
  LessonPlan,
  SchoolYear,
  SessionOccurrence,
  TeachingReflectionRecord,
} from '@/domain/models/entities';
import { formatCalendarMinute } from '@/features/calendar/calendarReadModel';
import {
  buildLearnerProgressEntryHref,
  type LearnerProgressReturnState,
} from '@/features/learnerProgress/learnerProgressNavigation';
import type { PlanningReturnTarget } from '@/features/planning/planningNavigation';
import type { TeachingReviewReturnState } from '@/features/teachingReview/teachingReviewNavigation';
import { formatLongDate } from '@/shared/dates/localDate';
import { EditorActionMenu } from '@/shared/ui/EditorActionMenu';

import {
  buildTeachingReflectionSessionHref,
  createTeachingReflectionEditorValues,
  parseTeachingReflectionEditorValues,
  presentTeachingReflectionSourceWarning,
  toTeachingReflectionEditorValues,
  type TeachingReflectionEditorValues,
} from './teachingReflectionEditorModel';
import {
  teachingReflectionMutationService,
  type TeachingReflectionValues,
} from './teachingReflectionMutationService';
import { TeachingReflectionRelatedRecords } from './TeachingReflectionRelatedRecords';
import type { TeachingReflectionDetailReadModel } from './teachingReflectionReadModel';

import styles from './TeachingReflectionEditor.module.css';

export interface TeachingReflectionCreateSource {
  schoolYear: SchoolYear;
  context: LearnerContext;
  lessonPlan: LessonPlan;
  sessionOccurrence: SessionOccurrence;
}

export interface TeachingReflectionEditorActions {
  create(
    sessionOccurrenceId: string,
    values: TeachingReflectionValues,
  ): Promise<TeachingReflectionRecord>;
  update(id: string, values: TeachingReflectionValues): Promise<TeachingReflectionRecord>;
  archive(id: string): Promise<TeachingReflectionRecord>;
  restore(id: string): Promise<TeachingReflectionRecord>;
}

interface TeachingReflectionEditorProps {
  sessionOccurrenceId: string;
  returnTo: PlanningReturnTarget;
  reviewReturn?: TeachingReviewReturnState;
  progressReturn?: LearnerProgressReturnState;
  detail?: TeachingReflectionDetailReadModel;
  createSource?: TeachingReflectionCreateSource;
  service?: TeachingReflectionEditorActions;
  onSaved?: (reflection: TeachingReflectionRecord) => void;
  onStatusChanged?: (reflection: TeachingReflectionRecord) => void;
}

function getErrorMessage(cause: unknown): string {
  if (cause instanceof ZodError) {
    return cause.issues[0]?.message ?? 'Check the reflection notes.';
  }
  return cause instanceof Error ? cause.message : 'The Teaching Reflection could not be saved.';
}

function contextKindLabel(kind: LearnerContext['kind']): string {
  switch (kind) {
    case 'class':
      return 'Class';
    case 'group':
      return 'Group';
    case 'individual':
      return 'Individual';
  }
}

export function TeachingReflectionEditor({
  sessionOccurrenceId,
  returnTo,
  reviewReturn,
  progressReturn,
  detail,
  createSource,
  service = teachingReflectionMutationService,
  onSaved,
  onStatusChanged,
}: TeachingReflectionEditorProps) {
  const reflection = detail?.reflection;
  const [values, setValues] = useState<TeachingReflectionEditorValues>(() =>
    reflection
      ? toTeachingReflectionEditorValues(reflection)
      : createTeachingReflectionEditorValues(),
  );
  const [saving, setSaving] = useState(false);
  const [archiveArmed, setArchiveArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    setValues(
      reflection
        ? toTeachingReflectionEditorValues(reflection)
        : createTeachingReflectionEditorValues(),
    );
    setArchiveArmed(false);
    setError(null);
  }, [reflection]);

  const sourceContextName =
    detail?.source.context.current?.name ??
    detail?.source.context.snapshot.name ??
    createSource?.context.name ??
    'Unavailable context';
  const sourceContextKind =
    detail?.source.context.current?.kind ??
    detail?.source.context.snapshot.kind ??
    createSource?.context.kind;
  const sourcePlanTitle =
    detail?.source.lessonPlan.current?.title ??
    detail?.source.lessonPlan.snapshot.title ??
    createSource?.lessonPlan.title ??
    'Unavailable Lesson Plan';
  const sourceSession = detail?.source.sessionOccurrence.current ?? createSource?.sessionOccurrence;
  const sourceSessionSnapshot =
    detail?.source.sessionOccurrence.snapshot ??
    (createSource
      ? {
          date: createSource.sessionOccurrence.date,
          startMinute: createSource.sessionOccurrence.startMinute,
          endMinute: createSource.sessionOccurrence.endMinute,
        }
      : undefined);
  const schoolYearLabel =
    detail?.source.schoolYear.current?.label ?? createSource?.schoolYear.label ?? 'Unavailable';
  const schoolYearId = detail?.source.schoolYear.current?.id ?? createSource?.schoolYear.id;
  const archived = reflection?.status === 'archived';

  function update<K extends keyof TeachingReflectionEditorValues>(
    key: K,
    value: TeachingReflectionEditorValues[K],
  ): void {
    setValues((current) => ({ ...current, [key]: value }));
    setError(null);
    setStatusMessage(null);
    setArchiveArmed(false);
  }

  async function save(): Promise<void> {
    if (saving || archived) return;
    setSaving(true);
    setError(null);
    setStatusMessage(null);
    try {
      const parsed = parseTeachingReflectionEditorValues(values);
      const saved = reflection
        ? await service.update(reflection.id, parsed)
        : await service.create(sessionOccurrenceId, parsed);
      setValues(toTeachingReflectionEditorValues(saved));
      setStatusMessage(reflection ? 'Teaching Reflection saved.' : 'Teaching Reflection added.');
      onSaved?.(saved);
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(): Promise<void> {
    if (!reflection || saving) return;
    if (!archived && !archiveArmed) {
      setArchiveArmed(true);
      setStatusMessage(null);
      return;
    }

    setSaving(true);
    setError(null);
    setStatusMessage(null);
    try {
      const updated = archived
        ? await service.restore(reflection.id)
        : await service.archive(reflection.id);
      setArchiveArmed(false);
      setStatusMessage(
        archived ? 'Teaching Reflection restored.' : 'Teaching Reflection archived.',
      );
      onStatusChanged?.(updated);
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.editor} aria-labelledby="teaching-reflection-heading">
      <header className={styles.editorHeader}>
        <div>
          <p className="page-eyebrow">Reflect</p>
          <h1 id="teaching-reflection-heading">Teaching Reflection</h1>
          <p>
            <strong>{sourcePlanTitle}</strong> · {sourceContextName}
          </p>
        </div>
        <div className={styles.actions}>
          {schoolYearId ? (
            <a
              className="button"
              href={buildLearnerProgressEntryHref({
                schoolYearId,
                sessionId: sessionOccurrenceId,
              })}
            >
              <Activity aria-hidden="true" size={17} /> Session Evidence
            </a>
          ) : null}
          <a
            className="button"
            href={buildTeachingReflectionSessionHref(
              sessionOccurrenceId,
              returnTo,
              reviewReturn,
              progressReturn,
            )}
          >
            <ArrowLeft aria-hidden="true" size={17} />
            Back to Session
          </a>
        </div>
      </header>

      <section className={styles.sourceCard} aria-labelledby="reflection-source-heading">
        <div className={styles.sourceHeading}>
          <div>
            <p className="page-eyebrow">Source record</p>
            <h2 id="reflection-source-heading">Completed Session</h2>
          </div>
          <span className={archived ? styles.archivedBadge : styles.activeBadge}>
            {archived ? 'Archived Reflection' : reflection ? 'Active Reflection' : 'New Reflection'}
          </span>
        </div>
        <dl className={styles.sourceGrid}>
          <div>
            <dt>Date</dt>
            <dd>
              {sourceSessionSnapshot ? formatLongDate(sourceSessionSnapshot.date) : 'Unavailable'}
            </dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>
              {sourceSessionSnapshot
                ? `${formatCalendarMinute(sourceSessionSnapshot.startMinute)}–${formatCalendarMinute(sourceSessionSnapshot.endMinute)}`
                : 'Unavailable'}
            </dd>
          </div>
          <div>
            <dt>Context</dt>
            <dd>
              {sourceContextKind ? `${contextKindLabel(sourceContextKind)} · ` : ''}
              {sourceContextName}
            </dd>
          </div>
          <div>
            <dt>School Year</dt>
            <dd>{schoolYearLabel}</dd>
          </div>
          <div>
            <dt>Current Session state</dt>
            <dd>
              {sourceSession?.deliveryState ??
                detail?.source.sessionOccurrence.state ??
                'Unavailable'}
            </dd>
          </div>
        </dl>
      </section>

      {detail?.source.warnings.length ? (
        <section
          className={styles.warningPanel}
          aria-labelledby="reflection-source-warning-heading"
        >
          <h2 id="reflection-source-warning-heading">Source record notes</h2>
          <ul>
            {detail.source.warnings.map((warning) => (
              <li key={warning}>{presentTeachingReflectionSourceWarning(warning)}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className={styles.interpretationNote}>
        Reflection notes are the teacher&apos;s interpretation. Classroom stores and links them but
        does not score teaching quality, infer learner mastery, or validate the conclusions.
      </p>

      <section className={styles.formSection} aria-labelledby="reflection-notes-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className="page-eyebrow">Narrative</p>
            <h2 id="reflection-notes-heading">What should be remembered?</h2>
          </div>
          <span>Enter at least one note. Each field supports up to 10,000 characters.</span>
        </div>

        <label>
          <span>What worked?</span>
          <textarea
            rows={6}
            value={values.whatWorked}
            disabled={archived || saving}
            maxLength={10_000}
            onChange={(event) => update('whatWorked', event.target.value)}
          />
        </label>

        <label>
          <span>What would you adjust?</span>
          <textarea
            rows={6}
            value={values.whatToAdjust}
            disabled={archived || saving}
            maxLength={10_000}
            onChange={(event) => update('whatToAdjust', event.target.value)}
          />
        </label>

        <label>
          <span>Additional notes</span>
          <textarea
            rows={6}
            value={values.additionalNotes}
            disabled={archived || saving}
            maxLength={10_000}
            onChange={(event) => update('additionalNotes', event.target.value)}
          />
        </label>
      </section>

      {detail ? <TeachingReflectionRelatedRecords detail={detail} /> : null}

      {archived ? (
        <p className={styles.archivedNotice} role="status">
          This Reflection is archived. Restore it before editing its narrative fields.
        </p>
      ) : null}

      {statusMessage ? (
        <p className={styles.statusMessage} role="status">
          {statusMessage}
        </p>
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div
        className={`editor-action-bar ${styles.actions}`}
        role="group"
        aria-label="Reflection actions"
      >
        <button
          className="button button-primary"
          type="button"
          disabled={saving || archived}
          onClick={() => void save()}
        >
          <Save aria-hidden="true" size={17} />
          {saving ? 'Saving…' : reflection ? 'Save reflection' : 'Add reflection'}
        </button>

        {reflection ? (
          <EditorActionMenu>
            <button
              className={!archived && archiveArmed ? 'button button-danger' : 'button'}
              type="button"
              disabled={saving}
              onClick={() => void changeStatus()}
            >
              {archived ? (
                <RotateCcw aria-hidden="true" size={17} />
              ) : (
                <Archive aria-hidden="true" size={17} />
              )}
              {archived
                ? 'Restore reflection'
                : archiveArmed
                  ? 'Confirm archive'
                  : 'Archive reflection'}
            </button>
          </EditorActionMenu>
        ) : null}
      </div>
    </section>
  );
}

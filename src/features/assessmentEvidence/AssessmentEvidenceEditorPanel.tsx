import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { ZodError } from 'zod';

import type { AssessmentEvidenceRecord, LibraryCatalogItem } from '@/domain/models/entities';
import type { LearnerProgressSnapshot } from '@/features/learnerProgress/learnerProgressReadModel';
import { formatShortDate } from '@/shared/dates/localDate';

import {
  assessmentEvidenceDraftToValues,
  createAssessmentEvidenceEditorDraft,
  type AssessmentEvidenceDraftDefaults,
  type AssessmentEvidenceEditorDraft,
  type AssessmentEvidenceEditorKind,
} from './assessmentEvidenceEditorModel';
import {
  assessmentEvidenceMutationService,
  type AssessmentEvidenceMutationService,
} from './assessmentEvidenceMutationService';

import styles from './AssessmentEvidenceEditorPanel.module.css';

interface AssessmentEvidenceEditorPanelProps {
  snapshot: LearnerProgressSnapshot;
  existing?: AssessmentEvidenceRecord;
  defaults?: AssessmentEvidenceDraftDefaults;
  service?: AssessmentEvidenceMutationService;
  onSaved: (record: AssessmentEvidenceRecord) => void;
  onCancel: () => void;
}

function errorMessage(error: unknown): string {
  if (error instanceof ZodError) return error.issues[0]?.message ?? 'Check the Evidence details.';
  return error instanceof Error ? error.message : 'The Evidence record could not be saved.';
}

function studentName(name: string, preferredName?: string): string {
  return preferredName?.trim() || name;
}

function assessmentLabel(item: LibraryCatalogItem): string {
  if (item.catalogType !== 'assessment') return item.title;
  return item.status === 'archived' ? `${item.title} · Archived` : item.title;
}

function updateDraft<K extends keyof AssessmentEvidenceEditorDraft>(
  setter: Dispatch<SetStateAction<AssessmentEvidenceEditorDraft>>,
  key: K,
  value: AssessmentEvidenceEditorDraft[K],
): void {
  setter((current) => ({ ...current, [key]: value }));
}

export function AssessmentEvidenceEditorPanel({
  snapshot,
  existing,
  defaults,
  service = assessmentEvidenceMutationService,
  onSaved,
  onCancel,
}: AssessmentEvidenceEditorPanelProps) {
  const [draft, setDraft] = useState<AssessmentEvidenceEditorDraft>(() =>
    createAssessmentEvidenceEditorDraft(snapshot.schoolYear, existing, defaults),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contextsById = useMemo(
    () => new Map(snapshot.contexts.map((context) => [context.id, context])),
    [snapshot.contexts],
  );
  const contexts = snapshot.contexts
    .filter(
      (context) =>
        context.schoolYearId === snapshot.schoolYear.id || context.id === existing?.contextId,
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

  const plans = snapshot.lessonPlans
    .filter((plan) => {
      if (plan.id === existing?.lessonPlanId) return true;
      const context = contextsById.get(plan.contextId);
      if (!context || context.schoolYearId !== snapshot.schoolYear.id) return false;
      return !draft.contextId || plan.contextId === draft.contextId;
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }));

  const sessions = snapshot.sessions
    .filter((session) => {
      if (session.id === existing?.sessionOccurrenceId) return true;
      const context = contextsById.get(session.contextId);
      if (!context || context.schoolYearId !== snapshot.schoolYear.id) return false;
      if (draft.lessonPlanId && session.lessonPlanId !== draft.lessonPlanId) return false;
      if (draft.contextId && session.contextId !== draft.contextId) return false;
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.startMinute - b.startMinute);

  const assessments = snapshot.libraryItems
    .filter((item) => item.catalogType === 'assessment')
    .sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }));
  const standards = [...snapshot.standards].sort(
    (a, b) =>
      a.code.localeCompare(b.code, 'en', { sensitivity: 'base' }) ||
      a.statement.localeCompare(b.statement, 'en', { sensitivity: 'base' }),
  );

  const missingContext =
    existing?.contextId && !snapshot.contexts.some((context) => context.id === existing.contextId)
      ? existing.sourceSnapshots?.context
      : undefined;
  const missingPlan =
    existing?.lessonPlanId &&
    !snapshot.lessonPlans.some((plan) => plan.id === existing.lessonPlanId)
      ? existing.sourceSnapshots?.lessonPlan
      : undefined;
  const missingSession =
    existing?.sessionOccurrenceId &&
    !snapshot.sessions.some((session) => session.id === existing.sessionOccurrenceId)
      ? existing.sourceSnapshots?.sessionOccurrence
      : undefined;
  const missingAssessment =
    existing?.assessmentId &&
    !snapshot.libraryItems.some((item) => item.id === existing.assessmentId)
      ? existing.sourceSnapshots?.assessment
      : undefined;
  const currentStandardIds = new Set(snapshot.standards.map((standard) => standard.id));
  const missingStandards = (existing?.sourceSnapshots?.standards ?? []).filter(
    (standard) =>
      existing?.standardIds.includes(standard.standardId) &&
      !currentStandardIds.has(standard.standardId),
  );

  function changeKind(kind: AssessmentEvidenceEditorKind): void {
    setDraft((current) => ({ ...current, kind }));
    setError(null);
  }

  function changeContext(value: string): void {
    setDraft((current) => ({
      ...current,
      contextId: value,
      lessonPlanId:
        current.lessonPlanId &&
        snapshot.lessonPlans.some(
          (plan) => plan.id === current.lessonPlanId && (!value || plan.contextId === value),
        )
          ? current.lessonPlanId
          : '',
      sessionOccurrenceId: '',
    }));
    setError(null);
  }

  function changePlan(value: string): void {
    setDraft((current) => ({ ...current, lessonPlanId: value, sessionOccurrenceId: '' }));
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const values = assessmentEvidenceDraftToValues(draft, snapshot.schoolYear.id);
      const saved = existing
        ? await service.update(existing.id, values)
        : await service.create(values);
      onSaved(saved);
    } catch (cause) {
      setError(errorMessage(cause));
      setSaving(false);
    }
  }

  return (
    <section
      className={`card ${styles.editor}`}
      aria-labelledby="assessment-evidence-editor-heading"
      id="assessment-evidence-editor"
      tabIndex={-1}
    >
      <header className={styles.header}>
        <div>
          <p className="page-eyebrow">Assessment Evidence</p>
          <h2 id="assessment-evidence-editor-heading">
            {existing ? 'Edit Evidence' : 'Add Evidence'}
          </h2>
          <p>
            Record teacher-controlled Evidence. Classroom stores the selected kind as entered and
            does not derive a grade, mastery level, learner rank, or growth score.
          </p>
        </div>
        <button className="button" type="button" disabled={saving} onClick={onCancel}>
          Cancel
        </button>
      </header>

      <form className={styles.form} onSubmit={(event) => void submit(event)}>
        <div className={styles.grid}>
          <label>
            Learner
            <select
              className="select"
              required
              value={draft.studentId}
              onChange={(event) => updateDraft(setDraft, 'studentId', event.currentTarget.value)}
            >
              <option value="">Select learner</option>
              {snapshot.students.map((student) => (
                <option key={student.id} value={student.id}>
                  {studentName(student.name, student.preferredName)}
                  {student.status === 'archived' ? ' · Archived' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Evidence date
            <input
              className="input"
              type="date"
              required
              min={snapshot.schoolYear.startsOn}
              max={snapshot.schoolYear.endsOn}
              value={draft.occurredOn}
              onChange={(event) => updateDraft(setDraft, 'occurredOn', event.currentTarget.value)}
            />
          </label>
          <label className={styles.fullWidth}>
            Title
            <input
              className="input"
              required
              maxLength={240}
              value={draft.title}
              onChange={(event) => updateDraft(setDraft, 'title', event.currentTarget.value)}
            />
          </label>
          <label>
            Evidence kind
            <select
              className="select"
              value={draft.kind}
              onChange={(event) =>
                changeKind(event.currentTarget.value as AssessmentEvidenceEditorKind)
              }
            >
              <option value="score">Score</option>
              <option value="proficiency">Proficiency</option>
              <option value="observation">Observation</option>
            </select>
          </label>
          <label>
            Context · optional
            <select
              className="select"
              value={draft.contextId}
              onChange={(event) => changeContext(event.currentTarget.value)}
            >
              <option value="">Not linked</option>
              {missingContext && existing?.contextId ? (
                <option value={existing.contextId}>
                  Historical snapshot · {missingContext.name}
                </option>
              ) : null}
              {contexts.map((context) => (
                <option key={context.id} value={context.id}>
                  {context.name}
                  {context.status === 'archived' ? ' · Archived' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Lesson Plan · optional
            <select
              className="select"
              value={draft.lessonPlanId}
              onChange={(event) => changePlan(event.currentTarget.value)}
            >
              <option value="">Not linked</option>
              {missingPlan && existing?.lessonPlanId ? (
                <option value={existing.lessonPlanId}>
                  Historical snapshot · {missingPlan.title}
                </option>
              ) : null}
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.title}
                  {plan.workflowState === 'archived' ? ' · Archived' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Session · optional
            <select
              className="select"
              value={draft.sessionOccurrenceId}
              onChange={(event) =>
                updateDraft(setDraft, 'sessionOccurrenceId', event.currentTarget.value)
              }
            >
              <option value="">Not linked</option>
              {missingSession && existing?.sessionOccurrenceId ? (
                <option value={existing.sessionOccurrenceId}>
                  Historical snapshot · {formatShortDate(missingSession.date)}
                </option>
              ) : null}
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {formatShortDate(session.date)} · {session.deliveryState}
                </option>
              ))}
            </select>
          </label>
          <label>
            Library Assessment · optional
            <select
              className="select"
              value={draft.assessmentId}
              onChange={(event) => updateDraft(setDraft, 'assessmentId', event.currentTarget.value)}
            >
              <option value="">Not linked</option>
              {missingAssessment && existing?.assessmentId ? (
                <option value={existing.assessmentId}>
                  Historical snapshot · {missingAssessment.title}
                </option>
              ) : null}
              {assessments.map((assessment) => (
                <option key={assessment.id} value={assessment.id}>
                  {assessmentLabel(assessment)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <section className={styles.kindFields} aria-label={`${draft.kind} Evidence fields`}>
          {draft.kind === 'score' ? (
            <div className={styles.kindGrid}>
              <label>
                Score value
                <input
                  className="input"
                  type="number"
                  step="any"
                  value={draft.scoreValue}
                  onChange={(event) =>
                    updateDraft(setDraft, 'scoreValue', event.currentTarget.value)
                  }
                />
              </label>
              <label>
                Maximum
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="any"
                  value={draft.scoreMaximum}
                  onChange={(event) =>
                    updateDraft(setDraft, 'scoreMaximum', event.currentTarget.value)
                  }
                />
              </label>
              <label>
                Score label · optional
                <input
                  className="input"
                  maxLength={120}
                  value={draft.scoreLabel}
                  onChange={(event) =>
                    updateDraft(setDraft, 'scoreLabel', event.currentTarget.value)
                  }
                />
              </label>
            </div>
          ) : draft.kind === 'proficiency' ? (
            <div className={styles.grid}>
              <label>
                Proficiency label
                <input
                  className="input"
                  required
                  maxLength={120}
                  value={draft.proficiencyLabel}
                  onChange={(event) =>
                    updateDraft(setDraft, 'proficiencyLabel', event.currentTarget.value)
                  }
                />
              </label>
              <label>
                Level id · optional
                <input
                  className="input"
                  value={draft.proficiencyLevelId}
                  onChange={(event) =>
                    updateDraft(setDraft, 'proficiencyLevelId', event.currentTarget.value)
                  }
                />
              </label>
              <label>
                Rank · optional
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="1"
                  value={draft.proficiencyRank}
                  onChange={(event) =>
                    updateDraft(setDraft, 'proficiencyRank', event.currentTarget.value)
                  }
                />
              </label>
              <label>
                Scale key · optional
                <input
                  className="input"
                  maxLength={120}
                  value={draft.proficiencyScaleKey}
                  onChange={(event) =>
                    updateDraft(setDraft, 'proficiencyScaleKey', event.currentTarget.value)
                  }
                />
              </label>
              <label className={styles.fullWidth}>
                Scale label · optional
                <input
                  className="input"
                  maxLength={240}
                  value={draft.proficiencyScaleLabel}
                  onChange={(event) =>
                    updateDraft(setDraft, 'proficiencyScaleLabel', event.currentTarget.value)
                  }
                />
              </label>
            </div>
          ) : (
            <label>
              Teacher observation
              <textarea
                className="input"
                required
                rows={5}
                maxLength={10000}
                value={draft.observationText}
                onChange={(event) =>
                  updateDraft(setDraft, 'observationText', event.currentTarget.value)
                }
              />
            </label>
          )}
        </section>

        <section className={styles.section} aria-labelledby="evidence-standards-editor-heading">
          <div>
            <h3 id="evidence-standards-editor-heading">Standards · optional</h3>
            <p>
              Select only Standards explicitly supported by this Evidence. Multiple selection does
              not imply mastery.
            </p>
          </div>
          <label>
            Linked Standards
            <select
              aria-label="Linked Standards"
              className={`select ${styles.standardsSelect}`}
              multiple
              value={draft.standardIds}
              onChange={(event) =>
                updateDraft(
                  setDraft,
                  'standardIds',
                  Array.from(event.currentTarget.selectedOptions, (option) => option.value),
                )
              }
            >
              {missingStandards.map((standard) => (
                <option key={standard.standardId} value={standard.standardId}>
                  Historical snapshot · {standard.code} · {standard.statement}
                </option>
              ))}
              {standards.map((standard) => (
                <option key={standard.id} value={standard.id}>
                  {standard.code} · {standard.statement}
                  {standard.status === 'archived' ? ' · Archived' : ''}
                </option>
              ))}
            </select>
          </label>
        </section>

        <label className={`${styles.fullWidth} ${styles.notesField}`}>
          Notes · optional
          <textarea
            className={`input ${styles.notesTextarea}`}
            rows={4}
            maxLength={5000}
            value={draft.notes}
            onChange={(event) => updateDraft(setDraft, 'notes', event.currentTarget.value)}
          />
        </label>

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <p className={styles.status}>
          Evidence date must stay inside {snapshot.schoolYear.label} (
          {formatShortDate(snapshot.schoolYear.startsOn)}–
          {formatShortDate(snapshot.schoolYear.endsOn)}).
        </p>

        <div className={styles.actions}>
          <button className="button" type="button" disabled={saving} onClick={onCancel}>
            Cancel
          </button>
          <button className="button button-primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : existing ? 'Save Evidence' : 'Add Evidence'}
          </button>
        </div>
      </form>
    </section>
  );
}

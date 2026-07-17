import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';

import type { LessonContent, LessonFlowPhase } from '@/domain/models/entities';
import {
  createLessonFlowStepEditorValues,
  lessonFlowDurationMinutes,
  lessonFlowPhaseLabels,
  type LessonContentEditorValues,
  type LessonFlowStepEditorValues,
} from '@/features/planning/planningEditorModel';

import styles from './LessonFlowEditor.module.css';

interface LessonFlowEditorProps {
  values: LessonContentEditorValues;
  onChange: (values: LessonContentEditorValues) => void;
  disabled?: boolean;
  idPrefix: string;
}

function updateStep(
  steps: readonly LessonFlowStepEditorValues[],
  index: number,
  update: Partial<LessonFlowStepEditorValues>,
): LessonFlowStepEditorValues[] {
  return steps.map((step, stepIndex) => (stepIndex === index ? { ...step, ...update } : step));
}

function moveStep(
  steps: readonly LessonFlowStepEditorValues[],
  index: number,
  direction: -1 | 1,
): LessonFlowStepEditorValues[] {
  const target = index + direction;
  if (target < 0 || target >= steps.length) return [...steps];
  const next = [...steps];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export function LessonFlowEditor({
  values,
  onChange,
  disabled = false,
  idPrefix,
}: LessonFlowEditorProps) {
  const parsedDurations = values.lessonFlow.map((step) => ({
    ...step,
    durationMinutes: step.durationMinutes ? Number(step.durationMinutes) : undefined,
  }));
  const totalMinutes = lessonFlowDurationMinutes(parsedDurations);

  function updateContent<K extends keyof LessonContentEditorValues>(
    key: K,
    value: LessonContentEditorValues[K],
  ): void {
    onChange({ ...values, [key]: value });
  }

  return (
    <section className={styles.editor} aria-label="Lesson flow editor">
      <div className={styles.sectionHeading}>
        <div>
          <p className="page-eyebrow">Teaching content</p>
          <h3>Lesson flow</h3>
          <p>
            {values.lessonFlow.length} {values.lessonFlow.length === 1 ? 'step' : 'steps'}
            {totalMinutes > 0 ? ` · ${totalMinutes} min` : ''}
          </p>
        </div>
        <button
          className="button"
          type="button"
          disabled={disabled}
          onClick={() =>
            updateContent('lessonFlow', [...values.lessonFlow, createLessonFlowStepEditorValues()])
          }
        >
          <Plus aria-hidden="true" size={16} /> Add step
        </button>
      </div>

      <div className={styles.contentGrid}>
        <label className={styles.fullWidth} htmlFor={`${idPrefix}-learning-target`}>
          <span>Learning target</span>
          <textarea
            id={`${idPrefix}-learning-target`}
            rows={3}
            disabled={disabled}
            value={values.learningTarget}
            onChange={(event) => updateContent('learningTarget', event.target.value)}
          />
        </label>

        <label className={styles.fullWidth} htmlFor={`${idPrefix}-content-notes`}>
          <span>Plan notes</span>
          <textarea
            id={`${idPrefix}-content-notes`}
            rows={4}
            disabled={disabled}
            value={values.notes}
            onChange={(event) => updateContent('notes', event.target.value)}
          />
        </label>
      </div>

      {values.lessonFlow.length > 0 ? (
        <ol className={styles.stepList}>
          {values.lessonFlow.map((step, index) => {
            const stepPrefix = `${idPrefix}-step-${step.id}`;
            return (
              <li key={step.id} className={styles.stepCard}>
                <div className={styles.stepHeader}>
                  <div>
                    <span className={styles.stepNumber}>Step {index + 1}</span>
                    <strong>{step.title.trim() || 'Untitled step'}</strong>
                  </div>
                  <div className={styles.stepActions}>
                    <button
                      className={styles.iconButton}
                      type="button"
                      disabled={disabled || index === 0}
                      aria-label={`Move step ${index + 1} up`}
                      onClick={() =>
                        updateContent('lessonFlow', moveStep(values.lessonFlow, index, -1))
                      }
                    >
                      <ArrowUp aria-hidden="true" size={16} />
                    </button>
                    <button
                      className={styles.iconButton}
                      type="button"
                      disabled={disabled || index === values.lessonFlow.length - 1}
                      aria-label={`Move step ${index + 1} down`}
                      onClick={() =>
                        updateContent('lessonFlow', moveStep(values.lessonFlow, index, 1))
                      }
                    >
                      <ArrowDown aria-hidden="true" size={16} />
                    </button>
                    <button
                      className={styles.removeButton}
                      type="button"
                      disabled={disabled}
                      aria-label={`Delete step ${index + 1}`}
                      onClick={() =>
                        updateContent(
                          'lessonFlow',
                          values.lessonFlow.filter((_, stepIndex) => stepIndex !== index),
                        )
                      }
                    >
                      <Trash2 aria-hidden="true" size={16} />
                    </button>
                  </div>
                </div>

                <div className={styles.stepGrid}>
                  <label className={styles.stepTitle} htmlFor={`${stepPrefix}-title`}>
                    <span>Step title</span>
                    <input
                      id={`${stepPrefix}-title`}
                      disabled={disabled}
                      value={step.title}
                      onChange={(event) =>
                        updateContent(
                          'lessonFlow',
                          updateStep(values.lessonFlow, index, { title: event.target.value }),
                        )
                      }
                    />
                  </label>

                  <label htmlFor={`${stepPrefix}-phase`}>
                    <span>Phase</span>
                    <select
                      id={`${stepPrefix}-phase`}
                      disabled={disabled}
                      value={step.phase}
                      onChange={(event) =>
                        updateContent(
                          'lessonFlow',
                          updateStep(values.lessonFlow, index, {
                            phase: event.target.value as LessonFlowPhase,
                          }),
                        )
                      }
                    >
                      {(Object.keys(lessonFlowPhaseLabels) as LessonFlowPhase[]).map((phase) => (
                        <option key={phase} value={phase}>
                          {lessonFlowPhaseLabels[phase]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label htmlFor={`${stepPrefix}-duration`}>
                    <span>Minutes</span>
                    <input
                      id={`${stepPrefix}-duration`}
                      inputMode="numeric"
                      disabled={disabled}
                      value={step.durationMinutes}
                      onChange={(event) =>
                        updateContent(
                          'lessonFlow',
                          updateStep(values.lessonFlow, index, {
                            durationMinutes: event.target.value,
                          }),
                        )
                      }
                    />
                  </label>

                  <label className={styles.fullWidth} htmlFor={`${stepPrefix}-details`}>
                    <span>Student activity and directions</span>
                    <textarea
                      id={`${stepPrefix}-details`}
                      rows={3}
                      disabled={disabled}
                      value={step.details}
                      onChange={(event) =>
                        updateContent(
                          'lessonFlow',
                          updateStep(values.lessonFlow, index, { details: event.target.value }),
                        )
                      }
                    />
                  </label>

                  <label className={styles.fullWidth} htmlFor={`${stepPrefix}-teacher-notes`}>
                    <span>Teacher notes</span>
                    <textarea
                      id={`${stepPrefix}-teacher-notes`}
                      rows={2}
                      disabled={disabled}
                      value={step.teacherNotes}
                      onChange={(event) =>
                        updateContent(
                          'lessonFlow',
                          updateStep(values.lessonFlow, index, {
                            teacherNotes: event.target.value,
                          }),
                        )
                      }
                    />
                  </label>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className={styles.emptyFlow} role="status">
          Add the first step to define the sequence students and teachers will follow.
        </div>
      )}
    </section>
  );
}

export function LessonFlowPreview({ content }: { content: LessonContent }) {
  const totalMinutes = lessonFlowDurationMinutes(content.lessonFlow);
  const hasContent =
    Boolean(content.learningTarget || content.notes) || content.lessonFlow.length > 0;

  if (!hasContent) {
    return (
      <p className={styles.emptyPreview}>No teaching content has been added to this plan yet.</p>
    );
  }

  return (
    <div className={styles.preview}>
      {content.learningTarget ? (
        <section>
          <h4>Learning target</h4>
          <p>{content.learningTarget}</p>
        </section>
      ) : null}
      {content.notes ? (
        <section>
          <h4>Plan notes</h4>
          <p>{content.notes}</p>
        </section>
      ) : null}
      {content.lessonFlow.length > 0 ? (
        <section>
          <div className={styles.previewHeading}>
            <h4>Lesson flow</h4>
            <span>
              {content.lessonFlow.length} {content.lessonFlow.length === 1 ? 'step' : 'steps'}
              {totalMinutes > 0 ? ` · ${totalMinutes} min` : ''}
            </span>
          </div>
          <ol className={styles.previewSteps}>
            {content.lessonFlow.map((step, index) => (
              <li key={step.id}>
                <div className={styles.previewStepHeading}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <small>
                      {lessonFlowPhaseLabels[step.phase]}
                      {step.durationMinutes ? ` · ${step.durationMinutes} min` : ''}
                    </small>
                  </div>
                </div>
                {step.details ? <p>{step.details}</p> : null}
                {step.teacherNotes ? (
                  <p className={styles.teacherNote}>Teacher: {step.teacherNotes}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

import { ArrowDown, ArrowUp, ChevronDown, Copy, Plus, Trash2 } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';

import type { LessonContent, LessonFlowPhase } from '@/domain/models/entities';
import { moveLessonFlowStep } from '@/features/planning/lessonFlowEditorOperations';
import {
  createLessonFlowStepEditorValues,
  lessonFlowDurationMinutes,
  lessonFlowPhaseLabels,
  type LessonContentEditorValues,
  type LessonFlowStepEditorValues,
} from '@/features/planning/planningEditorModel';

import styles from './LessonFlowEditor.module.css';

export type LessonContentEditorUpdater = (
  current: LessonContentEditorValues,
) => LessonContentEditorValues;

interface LessonFlowEditorProps {
  values: LessonContentEditorValues;
  onChange: (update: LessonContentEditorUpdater) => void;
  disabled?: boolean;
  idPrefix: string;
  headingLevel?: 2 | 3;
}

function updateStep(
  steps: readonly LessonFlowStepEditorValues[],
  index: number,
  update: Partial<LessonFlowStepEditorValues>,
): LessonFlowStepEditorValues[] {
  return steps.map((step, stepIndex) => (stepIndex === index ? { ...step, ...update } : step));
}

function closeStepMenu(target: HTMLElement): void {
  target.closest('details')?.removeAttribute('open');
}

export function LessonFlowEditor({
  values,
  onChange,
  disabled = false,
  idPrefix,
  headingLevel = 2,
}: LessonFlowEditorProps) {
  const [pendingFocusStepId, setPendingFocusStepId] = useState<string | null>(null);
  const titleInputRefs = useRef(new Map<string, HTMLInputElement>());
  const parsedDurations = values.lessonFlow.map((step) => ({
    ...step,
    durationMinutes: step.durationMinutes ? Number(step.durationMinutes) : undefined,
  }));
  const totalMinutes = lessonFlowDurationMinutes(parsedDurations);
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  useLayoutEffect(() => {
    if (!pendingFocusStepId) return;
    const input = titleInputRefs.current.get(pendingFocusStepId);
    if (!input) return;

    // Focus before paint so a delayed animation-frame callback cannot steal
    // focus after the user or an automation client has moved to the next field.
    input.focus({ preventScroll: true });
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setPendingFocusStepId(null);
  }, [pendingFocusStepId, values.lessonFlow]);

  function updateContent<K extends keyof LessonContentEditorValues>(
    key: K,
    value: LessonContentEditorValues[K],
  ): void {
    onChange((current) => ({ ...current, [key]: value }));
  }

  function updateLessonFlow(
    update: (steps: readonly LessonFlowStepEditorValues[]) => LessonFlowStepEditorValues[],
  ): void {
    onChange((current) => ({
      ...current,
      lessonFlow: update(current.lessonFlow),
    }));
  }

  function addStep(index: number, phase?: LessonFlowPhase): void {
    const step = createLessonFlowStepEditorValues(phase);
    setPendingFocusStepId(step.id);
    updateLessonFlow((steps) => {
      const insertionIndex = Math.max(0, Math.min(index, steps.length));
      const next = [...steps];
      next.splice(insertionIndex, 0, step);
      return next;
    });
  }

  function duplicateStep(index: number): void {
    const duplicateId = createLessonFlowStepEditorValues().id;
    setPendingFocusStepId(duplicateId);
    updateLessonFlow((steps) => {
      const source = steps[index];
      if (!source) {
        const next = [...steps];
        next.push({ ...createLessonFlowStepEditorValues(), id: duplicateId });
        return next;
      }
      const duplicate = {
        ...source,
        id: duplicateId,
        title: source.title.trim() ? `${source.title} copy` : '',
      };
      const next = [...steps];
      next.splice(index + 1, 0, duplicate);
      return next;
    });
  }

  return (
    <section className={styles.editor} aria-label="Lesson flow editor">
      <div className={styles.sectionHeading}>
        <div>
          <p className="page-eyebrow">Teaching content</p>
          <Heading>Lesson flow</Heading>
          <p>
            {values.lessonFlow.length} {values.lessonFlow.length === 1 ? 'step' : 'steps'}
            {totalMinutes > 0 ? ` · ${totalMinutes} min` : ''}
          </p>
        </div>
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
            rows={3}
            disabled={disabled}
            value={values.notes}
            onChange={(event) => updateContent('notes', event.target.value)}
          />
        </label>
      </div>

      {values.lessonFlow.length > 0 ? (
        <>
          <ol className={styles.stepList}>
            {values.lessonFlow.map((step, index) => {
              const stepPrefix = `${idPrefix}-step-${step.id}`;
              const durationLabel = step.durationMinutes.trim()
                ? `${step.durationMinutes.trim()} min`
                : 'No duration';
              return (
                <li key={step.id} className={styles.stepCard} data-lesson-flow-step={step.id}>
                  <div className={styles.stepHeader}>
                    <div className={styles.stepIdentity}>
                      <span className={styles.stepNumber}>Step {index + 1}</span>
                      <strong>{step.title.trim() || 'Untitled step'}</strong>
                      <span className={styles.stepMeta}>
                        {lessonFlowPhaseLabels[step.phase]} · {durationLabel}
                      </span>
                    </div>
                    <details className={styles.stepMenu}>
                      <summary
                        className={styles.stepMenuSummary}
                        aria-label={`Step ${index + 1} actions`}
                      >
                        More <ChevronDown aria-hidden="true" size={15} />
                      </summary>
                      <div className={styles.stepMenuPanel}>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={(event) => {
                            closeStepMenu(event.currentTarget);
                            addStep(index, step.phase);
                          }}
                        >
                          <Plus aria-hidden="true" size={15} /> Add before
                        </button>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={(event) => {
                            closeStepMenu(event.currentTarget);
                            addStep(index + 1, step.phase);
                          }}
                        >
                          <Plus aria-hidden="true" size={15} /> Add after
                        </button>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={(event) => {
                            closeStepMenu(event.currentTarget);
                            duplicateStep(index);
                          }}
                        >
                          <Copy aria-hidden="true" size={15} /> Duplicate
                        </button>
                        <button
                          type="button"
                          disabled={disabled || index === 0}
                          onClick={(event) => {
                            closeStepMenu(event.currentTarget);
                            updateLessonFlow((steps) => moveLessonFlowStep(steps, index, -1));
                          }}
                        >
                          <ArrowUp aria-hidden="true" size={15} /> Move earlier
                        </button>
                        <button
                          type="button"
                          disabled={disabled || index === values.lessonFlow.length - 1}
                          onClick={(event) => {
                            closeStepMenu(event.currentTarget);
                            updateLessonFlow((steps) => moveLessonFlowStep(steps, index, 1));
                          }}
                        >
                          <ArrowDown aria-hidden="true" size={15} /> Move later
                        </button>
                        <button
                          className={styles.deleteMenuItem}
                          type="button"
                          disabled={disabled}
                          onClick={(event) => {
                            closeStepMenu(event.currentTarget);
                            updateLessonFlow((steps) =>
                              steps.filter((_, stepIndex) => stepIndex !== index),
                            );
                          }}
                        >
                          <Trash2 aria-hidden="true" size={15} /> Delete step
                        </button>
                      </div>
                    </details>
                  </div>

                  <div className={styles.stepGrid}>
                    <label className={styles.stepTitle} htmlFor={`${stepPrefix}-title`}>
                      <span>Step title</span>
                      <input
                        id={`${stepPrefix}-title`}
                        ref={(element) => {
                          if (element) titleInputRefs.current.set(step.id, element);
                          else titleInputRefs.current.delete(step.id);
                        }}
                        disabled={disabled}
                        value={step.title}
                        onChange={(event) =>
                          updateLessonFlow((steps) =>
                            updateStep(steps, index, {
                              title: event.target.value,
                            }),
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
                          updateLessonFlow((steps) =>
                            updateStep(steps, index, {
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
                          updateLessonFlow((steps) =>
                            updateStep(steps, index, {
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
                          updateLessonFlow((steps) =>
                            updateStep(steps, index, {
                              details: event.target.value,
                            }),
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
                          updateLessonFlow((steps) =>
                            updateStep(steps, index, {
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
          <button
            className={styles.addStepButton}
            type="button"
            disabled={disabled}
            onClick={() => addStep(values.lessonFlow.length)}
          >
            <Plus aria-hidden="true" size={17} /> Add step
          </button>
        </>
      ) : (
        <div className={styles.emptyFlow}>
          <p>Add the first step to define the sequence students and teachers will follow.</p>
          <button className="button" type="button" disabled={disabled} onClick={() => addStep(0)}>
            <Plus aria-hidden="true" size={16} /> Add step
          </button>
        </div>
      )}
    </section>
  );
}

export function LessonFlowPreview({ content }: { content: LessonContent }) {
  const totalMinutes = lessonFlowDurationMinutes(content.lessonFlow);
  return (
    <section className={styles.preview} aria-label="Lesson flow preview">
      <div className={styles.previewHeading}>
        <h3>Lesson flow</h3>
        <span>
          {content.lessonFlow.length} {content.lessonFlow.length === 1 ? 'step' : 'steps'}
          {totalMinutes > 0 ? ` · ${totalMinutes} min` : ''}
        </span>
      </div>

      {content.learningTarget ? (
        <section>
          <strong>Learning target</strong>
          <p>{content.learningTarget}</p>
        </section>
      ) : null}

      {content.notes ? (
        <section>
          <strong>Plan notes</strong>
          <p>{content.notes}</p>
        </section>
      ) : null}

      {content.lessonFlow.length > 0 ? (
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
                <p className={styles.teacherNote}>Teacher note: {step.teacherNotes}</p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.emptyPreview}>No lesson-flow steps have been added.</p>
      )}
    </section>
  );
}

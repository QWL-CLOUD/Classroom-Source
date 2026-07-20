import {
  createLessonFlowStepEditorValues,
  type LessonFlowStepEditorValues,
} from '@/features/planning/planningEditorModel';

export function insertLessonFlowStep(
  steps: readonly LessonFlowStepEditorValues[],
  index: number,
  phase?: LessonFlowStepEditorValues['phase'],
): { steps: LessonFlowStepEditorValues[]; insertedStepId: string } {
  const step = createLessonFlowStepEditorValues(phase);
  const insertionIndex = Math.max(0, Math.min(index, steps.length));
  const next = [...steps];
  next.splice(insertionIndex, 0, step);
  return { steps: next, insertedStepId: step.id };
}

export function duplicateLessonFlowStep(
  steps: readonly LessonFlowStepEditorValues[],
  index: number,
): { steps: LessonFlowStepEditorValues[]; insertedStepId: string } {
  const source = steps[index];
  if (!source) {
    return insertLessonFlowStep(steps, steps.length);
  }

  const duplicate = {
    ...source,
    id: createLessonFlowStepEditorValues(source.phase).id,
    title: source.title.trim() ? `${source.title} copy` : '',
  };
  const next = [...steps];
  next.splice(index + 1, 0, duplicate);
  return { steps: next, insertedStepId: duplicate.id };
}

export function moveLessonFlowStep(
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

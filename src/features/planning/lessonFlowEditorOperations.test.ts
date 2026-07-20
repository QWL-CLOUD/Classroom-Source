import { describe, expect, it } from 'vitest';

import {
  duplicateLessonFlowStep,
  insertLessonFlowStep,
  moveLessonFlowStep,
} from '@/features/planning/lessonFlowEditorOperations';
import { createLessonFlowStepEditorValues } from '@/features/planning/planningEditorModel';

describe('lesson flow editor operations', () => {
  it('inserts a new step at the requested position and preserves the surrounding order', () => {
    const first = { ...createLessonFlowStepEditorValues('opening'), title: 'Open' };
    const second = { ...createLessonFlowStepEditorValues('closure'), title: 'Close' };

    const result = insertLessonFlowStep([first, second], 1, 'guided-practice');

    expect(result.steps.map((step) => step.title)).toEqual(['Open', '', 'Close']);
    expect(result.steps[1]?.phase).toBe('guided-practice');
    expect(result.insertedStepId).toBe(result.steps[1]?.id);
  });

  it('duplicates a step with a new identifier and keeps it immediately after the source', () => {
    const source = {
      ...createLessonFlowStepEditorValues('assessment'),
      title: 'Exit ticket',
      durationMinutes: '5',
      details: 'Respond independently.',
    };

    const result = duplicateLessonFlowStep([source], 0);

    expect(result.steps).toHaveLength(2);
    expect(result.steps[1]).toMatchObject({
      title: 'Exit ticket copy',
      phase: 'assessment',
      durationMinutes: '5',
      details: 'Respond independently.',
    });
    expect(result.steps[1]?.id).not.toBe(source.id);
    expect(result.insertedStepId).toBe(result.steps[1]?.id);
  });

  it('moves a step only when the destination exists', () => {
    const first = { ...createLessonFlowStepEditorValues(), title: 'First' };
    const second = { ...createLessonFlowStepEditorValues(), title: 'Second' };

    expect(moveLessonFlowStep([first, second], 0, 1).map((step) => step.title)).toEqual([
      'Second',
      'First',
    ]);
    expect(moveLessonFlowStep([first, second], 0, -1)).toEqual([first, second]);
  });
});

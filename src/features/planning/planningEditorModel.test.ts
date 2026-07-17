import { describe, expect, it } from 'vitest';

import {
  createLessonPlanEditorValues,
  createSessionEditorValues,
  parseLessonPlanEditorValues,
  parseSessionEditorValues,
} from './planningEditorModel';

describe('planning editor models', () => {
  it('normalizes optional lesson-plan fields', () => {
    expect(
      parseLessonPlanEditorValues({
        ...createLessonPlanEditorValues(),
        title: '  Fractions review  ',
        subject: ' Math ',
        workflowState: 'ready',
        durationMinutes: '45',
        learningTarget: ' Compare fractions. ',
      }),
    ).toEqual({
      title: 'Fractions review',
      subject: 'Math',
      workflowState: 'ready',
      preferredScheduleBlockId: undefined,
      durationMinutes: 45,
      learningTarget: 'Compare fractions.',
      notes: undefined,
    });
  });

  it('rejects invalid manual session times', () => {
    expect(() =>
      parseSessionEditorValues({
        ...createSessionEditorValues('2026-07-17'),
        startTime: '11:00',
        endTime: '10:00',
      }),
    ).toThrow('End time must be after the start time.');
  });
});

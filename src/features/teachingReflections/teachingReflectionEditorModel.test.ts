import { describe, expect, it } from 'vitest';

import { teachingReflectionRecordSchema } from '@/domain/models/entities';

import {
  buildTeachingReflectionHref,
  buildTeachingReflectionSessionHref,
  createTeachingReflectionEditorValues,
  parseTeachingReflectionEditorValues,
  presentTeachingReflectionSourceWarning,
  toTeachingReflectionEditorValues,
} from './teachingReflectionEditorModel';

const reflection = teachingReflectionRecordSchema.parse({
  id: 'reflection',
  sessionOccurrenceId: 'session',
  schoolYearId: 'school-year',
  contextId: 'context',
  lessonPlanId: 'plan',
  occurredOn: '2026-08-05',
  whatWorked: 'Students explained their strategy.',
  whatToAdjust: 'Shorten the opening.',
  sourceSnapshots: {
    context: { kind: 'class', name: 'Grade 4 Math' },
    lessonPlan: { title: 'Fraction strategies' },
    sessionOccurrence: {
      date: '2026-08-05',
      startMinute: 540,
      endMinute: 600,
    },
  },
  status: 'active',
  createdAt: '2026-08-05T15:00:00.000Z',
  updatedAt: '2026-08-05T15:00:00.000Z',
});

describe('teachingReflectionEditorModel', () => {
  it('creates empty values and maps a retained reflection into editable fields', () => {
    expect(createTeachingReflectionEditorValues()).toEqual({
      whatWorked: '',
      whatToAdjust: '',
      additionalNotes: '',
    });
    expect(toTeachingReflectionEditorValues(reflection)).toEqual({
      whatWorked: 'Students explained their strategy.',
      whatToAdjust: 'Shorten the opening.',
      additionalNotes: '',
    });
  });

  it('trims narrative fields and requires at least one note', () => {
    expect(
      parseTeachingReflectionEditorValues({
        whatWorked: '  Clear partner explanations.  ',
        whatToAdjust: '',
        additionalNotes: '',
      }),
    ).toEqual({ whatWorked: 'Clear partner explanations.' });

    expect(() =>
      parseTeachingReflectionEditorValues({
        whatWorked: '   ',
        whatToAdjust: '',
        additionalNotes: '',
      }),
    ).toThrow('Enter at least one reflection note.');
  });

  it('builds hidden Reflection and Session links while preserving the return target', () => {
    expect(buildTeachingReflectionHref('session', 'learners')).toBe(
      '#/planning/session/reflection?session=session',
    );
    expect(buildTeachingReflectionHref('session', 'week')).toBe(
      '#/planning/session/reflection?session=session&return=week',
    );
    expect(buildTeachingReflectionSessionHref('session', 'calendar')).toBe(
      '#/planning/session?session=session&return=calendar',
    );
  });

  it('presents source warnings without turning them into teaching judgments', () => {
    expect(presentTeachingReflectionSourceWarning('session-reopened')).toContain(
      'currently reopened',
    );
    expect(presentTeachingReflectionSourceWarning('lesson-plan-source-unavailable')).toContain(
      'saved plan snapshot',
    );
  });

  it('preserves Teaching Review return state across Reflection and Session links', () => {
    const reviewReturn = {
      schoolYearId: 'year-1',
      queue: 'awaiting-reflection' as const,
      focus: 'session:session',
      period: { preset: 'this-week' as const },
    };
    expect(buildTeachingReflectionHref('session', 'review', reviewReturn)).toBe(
      '#/planning/session/reflection?session=session&return=review&schoolYear=year-1&reviewQueue=awaiting-reflection&reviewFocus=session%3Asession&reviewPeriod=this-week',
    );
    expect(buildTeachingReflectionSessionHref('session', 'review', reviewReturn)).toBe(
      '#/planning/session?session=session&return=review&schoolYear=year-1&reviewQueue=awaiting-reflection&reviewFocus=session%3Asession&reviewPeriod=this-week',
    );
  });
});

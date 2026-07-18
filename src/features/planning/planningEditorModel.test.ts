import { describe, expect, it } from 'vitest';

import type { LessonPlan, SessionOccurrence } from '@/domain/models/entities';

import {
  createLessonFlowStepEditorValues,
  createLessonPlanEditorValues,
  createSessionEditorValues,
  parseLessonPlanEditorValues,
  parseSessionEditorValues,
  resolveSessionLessonContent,
  toSessionEditorValues,
} from './planningEditorModel';

describe('planning editor models', () => {
  it('normalizes optional lesson-plan fields and ordered lesson-flow steps', () => {
    expect(
      parseLessonPlanEditorValues({
        ...createLessonPlanEditorValues(),
        title: '  Fractions review  ',
        subject: ' Math ',
        workflowState: 'ready',
        durationMinutes: '45',
        learningTarget: ' Compare fractions. ',
        lessonFlow: [
          {
            ...createLessonFlowStepEditorValues('guided-practice'),
            id: 'step-1',
            title: '  Sort fraction cards  ',
            durationMinutes: '12',
            details: ' Work with a partner. ',
          },
        ],
      }),
    ).toEqual({
      fields: {
        title: 'Fractions review',
        subject: 'Math',
        workflowState: 'ready',
        preferredScheduleBlockId: undefined,
        durationMinutes: 45,
        learningTarget: 'Compare fractions.',
        notes: undefined,
        lessonFlow: [
          {
            id: 'step-1',
            title: 'Sort fraction cards',
            phase: 'guided-practice',
            durationMinutes: 12,
            details: 'Work with a partner.',
            teacherNotes: undefined,
          },
        ],
      },
      series: { kind: 'none' },
    });
  });

  it('parses existing and new lesson-series choices', () => {
    expect(
      parseLessonPlanEditorValues({
        ...createLessonPlanEditorValues(),
        title: 'Series lesson',
        seriesMode: 'existing',
        seriesId: 'series-1',
      }).series,
    ).toEqual({ kind: 'existing', seriesId: 'series-1' });

    expect(
      parseLessonPlanEditorValues({
        ...createLessonPlanEditorValues(),
        title: 'New series lesson',
        seriesMode: 'new',
        newSeriesTitle: '  Fractions Unit  ',
      }).series,
    ).toEqual({ kind: 'new', title: 'Fractions Unit' });
  });

  it('keeps sessions live-linked until a content override is saved', () => {
    const plan: LessonPlan = {
      id: 'plan',
      contextId: 'context',
      title: 'Bridge lesson',
      subject: 'Language',
      workflowState: 'ready',
      lessonFlow: [
        {
          id: 'plan-step',
          title: 'Notice cognates',
          phase: 'instruction',
          durationMinutes: 10,
        },
      ],
      createdAt: '2026-07-17T12:00:00.000Z',
      updatedAt: '2026-07-17T12:00:00.000Z',
    };
    const session: SessionOccurrence = {
      id: 'session',
      lessonPlanId: plan.id,
      contextId: plan.contextId,
      date: '2026-07-17',
      startMinute: 540,
      endMinute: 600,
      deliveryState: 'scheduled',
    };

    expect(resolveSessionLessonContent(plan, session)).toMatchObject({
      source: 'plan',
      content: { lessonFlow: [{ title: 'Notice cognates' }] },
    });

    const customValues = toSessionEditorValues(session, plan);
    customValues.contentMode = 'custom';
    customValues.lessonFlow[0]!.title = 'Practice cognate pairs';
    const parsed = parseSessionEditorValues(customValues);

    expect(parsed.contentOverride).toMatchObject({
      lessonFlow: [{ title: 'Practice cognate pairs' }],
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

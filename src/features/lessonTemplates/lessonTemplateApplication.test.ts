import { describe, expect, it } from 'vitest';

import type { LessonTemplate } from '@/domain/models/entities';
import { createLessonPlanEditorValues } from '@/features/planning/planningEditorModel';

import { applyLessonTemplateToPlanEditorValues } from './lessonTemplateApplication';

const template: LessonTemplate = {
  id: 'template-1',
  title: 'Workshop structure',
  defaultPlanTitle: 'Unit fraction comparison',
  subject: 'Math',
  durationMinutes: 45,
  learningTarget: 'Compare unit fractions.',
  libraryLinks: [{ libraryItemId: 'resource-1', catalogType: 'resource' }],
  lessonFlow: [
    {
      id: 'template-step',
      title: 'Compare models',
      phase: 'guided-practice',
      durationMinutes: 15,
    },
  ],
  status: 'active',
  createdAt: '2026-07-23T20:00:00.000Z',
  updatedAt: '2026-07-23T20:10:00.000Z',
};

describe('lesson template application', () => {
  it('copies content with fresh step identities while preserving plan ownership fields', () => {
    const current = {
      ...createLessonPlanEditorValues('block-1'),
      workflowState: 'ready' as const,
      seriesMode: 'existing' as const,
      seriesId: 'series-1',
    };
    const ids = ['plan-step'];
    const applied = applyLessonTemplateToPlanEditorValues(current, template, {
      createId: () => ids.shift()!,
      now: () => '2026-07-23T20:20:00.000Z',
    });

    expect(applied).toMatchObject({
      title: 'Unit fraction comparison',
      subject: 'Math',
      durationMinutes: '45',
      workflowState: 'ready',
      preferredScheduleBlockId: 'block-1',
      seriesMode: 'existing',
      seriesId: 'series-1',
      lessonFlow: [{ id: 'plan-step', title: 'Compare models' }],
      templateApplication: {
        templateId: 'template-1',
        templateTitle: 'Workshop structure',
        sourceUpdatedAt: '2026-07-23T20:10:00.000Z',
        appliedAt: '2026-07-23T20:20:00.000Z',
      },
    });
    expect(applied.lessonFlow[0]?.id).not.toBe(template.lessonFlow[0]?.id);
  });

  it('rejects archived source templates', () => {
    expect(() =>
      applyLessonTemplateToPlanEditorValues(createLessonPlanEditorValues(), {
        ...template,
        status: 'archived',
        archivedAt: '2026-07-23T20:30:00.000Z',
      }),
    ).toThrow('Restore this lesson template');
  });
});

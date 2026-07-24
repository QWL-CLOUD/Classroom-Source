import { describe, expect, it } from 'vitest';

import type { CategoryAssignment, CategoryValue, LessonTemplate } from '@/domain/models/entities';

import { buildLessonTemplateViews, filterLessonTemplates } from './lessonTemplateReadModel';

const timestamp = '2026-07-23T20:00:00.000Z';
const template: LessonTemplate = {
  id: 'template-1',
  title: 'Workshop structure',
  description: 'Reusable guided-practice sequence.',
  subject: 'Math',
  lessonFlow: [{ id: 'step-1', title: 'Compare models', phase: 'guided-practice' }],
  status: 'active',
  createdAt: timestamp,
  updatedAt: timestamp,
};
const format: CategoryValue = {
  id: 'format-workshop',
  familyId: 'template-format',
  name: 'Workshop',
  normalizedName: 'workshop',
  aliases: [],
  normalizedAliases: [],
  sortOrder: 0,
  isDefault: false,
  lifecycleState: 'active',
  createdAt: timestamp,
  updatedAt: timestamp,
};
const assignment: CategoryAssignment = {
  id: 'assignment-1',
  familyId: 'template-format',
  categoryValueId: format.id,
  entityType: 'lesson-template',
  entityId: template.id,
  createdAt: timestamp,
};

describe('Lesson Template read model', () => {
  it('joins managed category labels and searches reusable content', () => {
    const views = buildLessonTemplateViews([template], [assignment], [format]);
    expect(views[0]).toMatchObject({
      templateFormatId: 'format-workshop',
      templateFormatLabel: 'Workshop',
    });
    expect(
      filterLessonTemplates(views, {
        query: 'compare models',
        status: 'active',
        templateFormatId: 'format-workshop',
      }),
    ).toHaveLength(1);
  });
});

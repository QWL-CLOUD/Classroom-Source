import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import type { CategoryValue } from '@/domain/models/entities';
import { EditHistoryService } from '@/features/editing/editHistoryService';

import { LessonTemplateMutationService } from './lessonTemplateMutationService';
import { createLessonTemplateEditorValues } from './lessonTemplateModel';

let database: ClassroomDatabase;
const timestamp = '2026-07-23T20:00:00.000Z';

const workshop: CategoryValue = {
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

beforeEach(async () => {
  database = new ClassroomDatabase(`lesson-templates-${crypto.randomUUID()}`);
  await database.open();
  await database.categoryValues.put(workshop);
  await database.libraryItems.put({
    id: 'resource-1',
    catalogType: 'resource',
    title: 'Fraction cards',
    tags: [],
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  });
});

afterEach(async () => {
  await database.delete();
});

function service(ids: string[]): LessonTemplateMutationService {
  return new LessonTemplateMutationService(database, {
    createId: () => ids.shift() ?? crypto.randomUUID(),
    now: () => timestamp,
  });
}

describe('LessonTemplateMutationService', () => {
  it('creates a separate reusable source record with stable category and Library references', async () => {
    const mutation = service(['template-1', 'assignment-1', 'log-1']);
    const created = await mutation.create(
      {
        ...createLessonTemplateEditorValues(),
        title: 'Workshop lesson',
        defaultPlanTitle: 'Unit fraction comparison',
        subject: 'Math',
        durationMinutes: '45',
        learningTarget: 'Compare unit fractions.',
        libraryLinks: [{ libraryItemId: 'resource-1', catalogType: 'resource' }],
        lessonFlow: [
          {
            id: 'template-step-1',
            title: 'Model and discuss',
            phase: 'guided-practice',
            durationMinutes: '15',
            details: 'Compare two models.',
            teacherNotes: '',
            libraryLinks: [],
          },
        ],
      },
      { 'template-format': ['format-workshop'] },
    );

    expect(created).toMatchObject({
      id: 'template-1',
      title: 'Workshop lesson',
      status: 'active',
      libraryLinks: [{ libraryItemId: 'resource-1', catalogType: 'resource' }],
      lessonFlow: [{ id: 'template-step-1', title: 'Model and discuss' }],
    });
    expect(await database.categoryAssignments.get('assignment-1')).toMatchObject({
      entityType: 'lesson-template',
      entityId: 'template-1',
      categoryValueId: 'format-workshop',
    });
  });

  it('archives and restores without destructive deletion', async () => {
    const mutation = service(['template-1', 'log-create', 'log-archive', 'log-restore']);
    await mutation.create({
      ...createLessonTemplateEditorValues(),
      title: 'Reusable mini-lesson',
    });
    expect(await mutation.archive('template-1')).toMatchObject({
      status: 'archived',
      archivedAt: timestamp,
    });
    expect(await mutation.restore('template-1')).toMatchObject({
      status: 'active',
      archivedAt: undefined,
    });
  });

  it('undoes and redoes the template and assignments atomically', async () => {
    const mutation = service(['template-1', 'assignment-1', 'log-1']);
    const history = new EditHistoryService(database, { now: () => timestamp });
    await mutation.create(
      { ...createLessonTemplateEditorValues(), title: 'Workshop lesson' },
      { 'template-format': ['format-workshop'] },
    );

    await history.undo();
    expect(await database.lessonTemplates.get('template-1')).toBeUndefined();
    expect(await database.categoryAssignments.get('assignment-1')).toBeUndefined();

    await history.redo();
    expect(await database.lessonTemplates.get('template-1')).toBeDefined();
    expect(await database.categoryAssignments.get('assignment-1')).toBeDefined();
  });
});

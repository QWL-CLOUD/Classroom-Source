import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import type { CategoryFamilyId, CategoryValue } from '@/domain/models/entities';
import { EditHistoryService } from '@/features/editing/editHistoryService';

import {
  CategoryMergeHistoryDependencyError,
  CategoryMutationService,
  CategoryValueInUseError,
} from './categoryMutationService';

let database: ClassroomDatabase;
let ids: string[];
let service: CategoryMutationService;
let history: EditHistoryService;

const now = '2026-07-21T18:00:00.000Z';

function value(
  id: string,
  name: string,
  familyId: CategoryFamilyId = 'purpose-tag',
  overrides: Partial<CategoryValue> = {},
): CategoryValue {
  return {
    id,
    familyId,
    name,
    normalizedName: name.toLocaleLowerCase('en-US'),
    aliases: [],
    normalizedAliases: [],
    sortOrder: 0,
    isDefault: false,
    lifecycleState: 'active',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function seedPlan(id = 'plan-1'): Promise<void> {
  await database.lessonPlans.put({
    id,
    contextId: 'class-1',
    title: 'Reading lesson',
    subject: 'ELA',
    workflowState: 'draft',
    createdAt: now,
    updatedAt: now,
  });
}

beforeEach(async () => {
  database = new ClassroomDatabase(`category-mutation-${crypto.randomUUID()}`);
  await database.open();
  ids = [];
  service = new CategoryMutationService(database, {
    createId: () => ids.shift() ?? crypto.randomUUID(),
    now: () => now,
  });
  history = new EditHistoryService(database, { now: () => '2026-07-21T19:00:00.000Z' });
});

afterEach(async () => {
  await database.delete();
});

describe('CategoryMutationService', () => {
  it('creates and renames a stable value while retaining the old name as an alias', async () => {
    ids = ['purpose-reading', 'log-create'];
    await service.create('purpose-tag', { name: 'Reading', colorKey: 'blue' });
    ids = ['log-rename'];
    await service.rename('purpose-reading', 'Reading comprehension');

    expect(await database.categoryValues.get('purpose-reading')).toMatchObject({
      id: 'purpose-reading',
      name: 'Reading comprehension',
      normalizedName: 'reading comprehension',
      aliases: ['Reading'],
      normalizedAliases: ['reading'],
    });

    await history.undo();
    expect(await database.categoryValues.get('purpose-reading')).toMatchObject({
      name: 'Reading',
      aliases: [],
    });
    await history.redo();
    expect(await database.categoryValues.get('purpose-reading')).toMatchObject({
      name: 'Reading comprehension',
      aliases: ['Reading'],
    });
  });

  it('updates name and presentation as one undoable editor command', async () => {
    await database.categoryValues.put(
      value('purpose-reading', 'Reading', 'purpose-tag', {
        colorKey: 'blue',
        iconKey: 'book-open',
      }),
    );
    ids = ['log-update'];

    await service.update('purpose-reading', {
      name: 'Reading comprehension',
      colorKey: 'teal',
      iconKey: 'target',
    });

    expect(await database.categoryValues.get('purpose-reading')).toMatchObject({
      name: 'Reading comprehension',
      aliases: ['Reading'],
      colorKey: 'teal',
      iconKey: 'target',
    });

    await history.undo();
    expect(await database.categoryValues.get('purpose-reading')).toMatchObject({
      name: 'Reading',
      aliases: [],
      colorKey: 'blue',
      iconKey: 'book-open',
    });
  });

  it('reorders active values as one undoable compound command', async () => {
    await database.categoryValues.bulkPut([
      value('first', 'First', 'purpose-tag', { sortOrder: 0 }),
      value('second', 'Second', 'purpose-tag', { sortOrder: 1 }),
      value('third', 'Third', 'purpose-tag', { sortOrder: 2 }),
    ]);
    ids = ['log-reorder'];

    await service.move('second', 'earlier');
    expect(
      (await database.categoryValues.orderBy('[familyId+sortOrder]').toArray()).map(
        (item) => item.id,
      ),
    ).toEqual(['second', 'first', 'third']);

    await history.undo();
    expect(
      (await database.categoryValues.orderBy('[familyId+sortOrder]').toArray()).map(
        (item) => item.id,
      ),
    ).toEqual(['first', 'second', 'third']);
  });

  it('changes the family default without rewriting existing assignments', async () => {
    await seedPlan();
    await database.categoryValues.bulkPut([
      value('old-default', 'Old default', 'purpose-tag', { isDefault: true }),
      value('new-default', 'New default', 'purpose-tag', { sortOrder: 1 }),
    ]);
    await database.categoryAssignments.put({
      id: 'assignment-1',
      familyId: 'purpose-tag',
      categoryValueId: 'old-default',
      entityType: 'lesson-plan',
      entityId: 'plan-1',
      createdAt: now,
    });
    ids = ['log-default'];

    await service.setDefault('new-default');

    expect(await database.categoryValues.get('old-default')).toMatchObject({ isDefault: false });
    expect(await database.categoryValues.get('new-default')).toMatchObject({ isDefault: true });
    expect(await database.categoryAssignments.get('assignment-1')).toMatchObject({
      categoryValueId: 'old-default',
    });
  });

  it('blocks archive and delete for in-use values with a structured safe-resolution error', async () => {
    await seedPlan();
    await database.categoryValues.put(value('source', 'Source'));
    await database.categoryAssignments.put({
      id: 'assignment-1',
      familyId: 'purpose-tag',
      categoryValueId: 'source',
      entityType: 'lesson-plan',
      entityId: 'plan-1',
      createdAt: now,
    });

    const archiveError = await service.archive('source').catch((error: unknown) => error);
    expect(archiveError).toBeInstanceOf(CategoryValueInUseError);
    expect(archiveError).toMatchObject({
      usageCount: 1,
      attemptedOperation: 'archive',
    });
    const deleteError = await service.deleteUnused('source').catch((error: unknown) => error);
    expect(deleteError).toMatchObject({ usageCount: 1, attemptedOperation: 'delete' });
  });

  it('replaces assignments and archives the old value atomically', async () => {
    await seedPlan();
    await database.categoryValues.bulkPut([
      value('source', 'Reading', 'purpose-tag', { isDefault: true }),
      value('target', 'Comprehension', 'purpose-tag', { sortOrder: 1 }),
    ]);
    await database.categoryAssignments.put({
      id: 'assignment-1',
      familyId: 'purpose-tag',
      categoryValueId: 'source',
      entityType: 'lesson-plan',
      entityId: 'plan-1',
      createdAt: now,
    });
    ids = ['log-replace'];

    await service.replaceAndArchive('source', 'target');

    expect(await database.categoryValues.get('source')).toMatchObject({
      lifecycleState: 'archived',
      isDefault: false,
    });
    expect(await database.categoryValues.get('target')).toMatchObject({ isDefault: true });
    expect(await database.categoryAssignments.get('assignment-1')).toMatchObject({
      categoryValueId: 'target',
    });

    await history.undo();
    expect(await database.categoryValues.get('source')).toMatchObject({
      lifecycleState: 'active',
      isDefault: true,
    });
    expect(await database.categoryAssignments.get('assignment-1')).toMatchObject({
      categoryValueId: 'source',
    });
    await history.redo();
    expect(await database.categoryAssignments.get('assignment-1')).toMatchObject({
      categoryValueId: 'target',
    });
  });

  it('merges aliases, deduplicates assignments, and restores the exact records through undo', async () => {
    await database.tasks.put({
      id: 'task-1',
      title: 'Prepare lesson',
      status: 'active',
      order: 0,
      createdAt: now,
      updatedAt: now,
    });
    await database.categoryValues.bulkPut([
      value('source', 'Urgent', 'task-label', {
        aliases: ['Priority'],
        normalizedAliases: ['priority'],
      }),
      value('target', 'Important', 'task-label', { sortOrder: 1 }),
    ]);
    await database.categoryAssignments.bulkPut([
      {
        id: 'source-assignment',
        familyId: 'task-label',
        categoryValueId: 'source',
        entityType: 'task',
        entityId: 'task-1',
        createdAt: now,
      },
      {
        id: 'target-assignment',
        familyId: 'task-label',
        categoryValueId: 'target',
        entityType: 'task',
        entityId: 'task-1',
        createdAt: now,
      },
    ]);
    ids = ['log-merge'];

    await service.merge('source', 'target');

    expect(await database.categoryValues.get('source')).toMatchObject({
      lifecycleState: 'merged',
      mergedIntoId: 'target',
    });
    expect(await database.categoryValues.get('target')).toMatchObject({
      aliases: ['Urgent', 'Priority'],
      normalizedAliases: ['urgent', 'priority'],
    });
    expect(await database.categoryAssignments.toArray()).toHaveLength(1);

    await history.undo();
    expect(await database.categoryValues.get('source')).toMatchObject({ lifecycleState: 'active' });
    expect(await database.categoryValues.get('target')).toMatchObject({ aliases: [] });
    expect(await database.categoryAssignments.toArray()).toHaveLength(2);
  });

  it('protects merge history and supports merging a surviving target onward', async () => {
    await database.categoryValues.bulkPut([
      value('historical', 'Historical', 'purpose-tag', {
        lifecycleState: 'merged',
        mergedIntoId: 'source',
        mergedAt: now,
      }),
      value('source', 'Source', 'purpose-tag', { sortOrder: 1 }),
      value('target', 'Target', 'purpose-tag', { sortOrder: 2 }),
    ]);

    const archiveError = await service.archive('source').catch((error: unknown) => error);
    expect(archiveError).toBeInstanceOf(CategoryMergeHistoryDependencyError);
    expect(archiveError).toMatchObject({ mergedSourceCount: 1, attemptedOperation: 'archive' });
    await expect(service.replaceAndArchive('source', 'target')).rejects.toBeInstanceOf(
      CategoryMergeHistoryDependencyError,
    );

    ids = ['log-merge-chain'];
    await service.merge('source', 'target');
    expect(await database.categoryValues.get('source')).toMatchObject({
      lifecycleState: 'merged',
      mergedIntoId: 'target',
    });

    await history.undo();
    expect(await database.categoryValues.get('source')).toMatchObject({ lifecycleState: 'active' });
  });

  it('assigns only compatible current families and participates in global undo', async () => {
    await seedPlan();
    await database.categoryValues.bulkPut([
      value('purpose', 'Reading'),
      value('template-format', 'Workshop', 'template-format'),
    ]);
    ids = ['assignment-1', 'log-assign'];

    await service.assign('purpose', 'lesson-plan', 'plan-1');
    expect(await database.categoryAssignments.get('assignment-1')).toMatchObject({
      familyId: 'purpose-tag',
      entityType: 'lesson-plan',
    });
    await history.undo();
    expect(await database.categoryAssignments.get('assignment-1')).toBeUndefined();

    await expect(
      service.assign('template-format', 'lesson-template', 'template-1'),
    ).rejects.toThrow(/later roadmap phase/);
    await expect(service.assign('purpose', 'task', 'task-1')).rejects.toThrow(/cannot be assigned/);
  });
});

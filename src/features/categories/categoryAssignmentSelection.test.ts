import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import type { CategoryValue } from '@/domain/models/entities';
import { EditHistoryService } from '@/features/editing/editHistoryService';
import { TaskMutationService } from '@/features/tasks/taskMutationService';

import {
  buildCategoryAssignmentChangePlan,
  loadCategorySelectionSnapshot,
} from './categoryAssignmentSelection';

let database: ClassroomDatabase;
const now = '2026-07-22T12:00:00.000Z';

function value(
  id: string,
  name: string,
  familyId: CategoryValue['familyId'],
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

beforeEach(async () => {
  database = new ClassroomDatabase(`category-selection-${crypto.randomUUID()}`);
  await database.open();
});

afterEach(async () => {
  await database.delete();
});

describe('category assignment selection', () => {
  it('prefills defaults only for new records and keeps stable value ids', async () => {
    await database.categoryValues.bulkPut([
      value('task-default', 'Priority', 'task-label', { isDefault: true }),
      value('task-other', 'Family', 'task-label', { sortOrder: 1 }),
    ]);

    const snapshot = await loadCategorySelectionSnapshot(database, 'task');

    expect(snapshot.initialSelections).toEqual({ 'task-label': ['task-default'] });
    expect(snapshot.families[0]?.values.map((item) => item.id)).toEqual([
      'task-default',
      'task-other',
    ]);
  });

  it('shows an assigned archived value, preserves it when untouched, and allows removal', async () => {
    await database.categoryValues.bulkPut([
      value('active-support', 'Reading', 'support-area'),
      value('archived-support', 'Historic support', 'support-area', {
        lifecycleState: 'archived',
        archivedAt: now,
      }),
    ]);
    await database.categoryAssignments.put({
      id: 'assignment-existing',
      familyId: 'support-area',
      categoryValueId: 'archived-support',
      entityType: 'learner-notice',
      entityId: 'notice-1',
      createdAt: now,
    });

    const snapshot = await loadCategorySelectionSnapshot(database, 'learner-notice', 'notice-1');
    expect(snapshot.families[0]?.values.map((item) => item.id)).toEqual([
      'active-support',
      'archived-support',
    ]);
    expect(snapshot.initialSelections).toEqual({ 'support-area': ['archived-support'] });

    const preserved = await buildCategoryAssignmentChangePlan(
      database,
      'learner-notice',
      'notice-1',
      { createId: () => 'unused', now },
    );
    expect(preserved).toEqual({ forward: [], inverse: [] });

    const removed = await buildCategoryAssignmentChangePlan(
      database,
      'learner-notice',
      'notice-1',
      { selections: { 'support-area': [] }, createId: () => 'unused', now },
    );
    expect(removed.forward).toEqual([
      { table: 'categoryAssignments', action: 'delete', id: 'assignment-existing' },
    ]);
    expect(removed.inverse[0]).toMatchObject({
      table: 'categoryAssignments',
      action: 'put',
      record: { id: 'assignment-existing', categoryValueId: 'archived-support' },
    });
  });

  it('rejects a newly selected archived value', async () => {
    await database.categoryValues.put(
      value('archived-label', 'Old label', 'task-label', {
        lifecycleState: 'archived',
        archivedAt: now,
      }),
    );

    await expect(
      buildCategoryAssignmentChangePlan(database, 'task', 'task-new', {
        selections: { 'task-label': ['archived-label'] },
        createId: () => 'assignment-new',
        now,
      }),
    ).rejects.toThrow('Archived Task Labels values cannot be newly assigned.');
  });

  it('scopes Library categories by Catalog subtype without exposing Resource formats to Activities', async () => {
    await database.categoryValues.bulkPut([
      value('purpose-speaking', 'Oral language', 'purpose-tag'),
      value('focus-retell', 'Retelling', 'focus-tag'),
      value('resource-slides', 'Slide deck', 'resource-format'),
    ]);

    const activitySnapshot = await loadCategorySelectionSnapshot(
      database,
      'library-item',
      undefined,
      ['purpose-tag', 'focus-tag'],
    );
    expect(activitySnapshot.families.map((item) => item.family.id)).toEqual([
      'focus-tag',
      'purpose-tag',
    ]);
    expect(
      activitySnapshot.families.flatMap((item) => item.values.map((entry) => entry.id)),
    ).toEqual(['focus-retell', 'purpose-speaking']);

    const resourceSnapshot = await loadCategorySelectionSnapshot(
      database,
      'library-item',
      undefined,
      ['resource-format'],
    );
    expect(resourceSnapshot.families.map((item) => item.family.id)).toEqual(['resource-format']);
    expect(resourceSnapshot.families[0]?.values.map((item) => item.id)).toEqual([
      'resource-slides',
    ]);

    const activityPlan = await buildCategoryAssignmentChangePlan(
      database,
      'library-item',
      'activity-1',
      {
        selections: {
          'purpose-tag': ['purpose-speaking'],
          'focus-tag': ['focus-retell'],
          'resource-format': ['resource-slides'],
        },
        allowedFamilyIds: ['purpose-tag', 'focus-tag'],
        createId: (() => {
          const ids = ['assignment-purpose', 'assignment-focus'];
          return () => ids.shift() ?? crypto.randomUUID();
        })(),
        now,
      },
    );
    expect(
      activityPlan.forward.map((operation) =>
        operation.action === 'put' ? operation.record.familyId : operation.action,
      ),
    ).toEqual(['focus-tag', 'purpose-tag']);
  });

  it('exposes one canonical Calendar Event Type and preserves assigned archived history', async () => {
    await database.categoryValues.bulkPut([
      value('event-type-holiday', 'School Holiday', 'calendar-event-type', { isDefault: true }),
      value('event-type-pd', 'Professional Development', 'calendar-event-type', {
        lifecycleState: 'archived',
        archivedAt: now,
        sortOrder: 1,
      }),
    ]);
    await database.categoryAssignments.put({
      id: 'event-type-assignment',
      familyId: 'calendar-event-type',
      categoryValueId: 'event-type-pd',
      entityType: 'calendar-event',
      entityId: 'event-1',
      createdAt: now,
    });

    const existing = await loadCategorySelectionSnapshot(database, 'calendar-event', 'event-1', [
      'calendar-event-type',
    ]);
    expect(existing.families[0]?.family.selectionMode).toBe('single');
    expect(existing.families[0]?.values.map((item) => item.id)).toEqual([
      'event-type-holiday',
      'event-type-pd',
    ]);
    expect(existing.initialSelections).toEqual({
      'calendar-event-type': ['event-type-pd'],
    });

    await expect(
      buildCategoryAssignmentChangePlan(database, 'calendar-event', 'event-2', {
        selections: { 'calendar-event-type': ['event-type-holiday', 'event-type-pd'] },
        allowedFamilyIds: ['calendar-event-type'],
        createId: () => 'unused',
        now,
      }),
    ).rejects.toThrow('Calendar Event Types allows only one selected value.');
  });

  it('creates a default task assignment and undoes the task and label atomically', async () => {
    await database.categoryValues.put(
      value('task-default', 'Priority', 'task-label', { isDefault: true }),
    );
    const ids = ['task-1', 'assignment-1', 'log-1'];
    const service = new TaskMutationService(database, {
      createId: () => ids.shift() ?? crypto.randomUUID(),
      now: () => now,
      order: () => 1,
    });
    const history = new EditHistoryService(database, {
      now: () => '2026-07-22T13:00:00.000Z',
    });

    await service.create({ title: 'Prepare lesson' });
    expect(await database.categoryAssignments.get('assignment-1')).toMatchObject({
      familyId: 'task-label',
      categoryValueId: 'task-default',
      entityType: 'task',
      entityId: 'task-1',
    });

    await history.undo();
    expect(await database.tasks.get('task-1')).toBeUndefined();
    expect(await database.categoryAssignments.get('assignment-1')).toBeUndefined();

    await history.redo();
    expect(await database.tasks.get('task-1')).toBeDefined();
    expect(await database.categoryAssignments.get('assignment-1')).toBeDefined();
  });
});

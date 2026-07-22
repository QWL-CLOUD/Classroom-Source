import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { DexieCategoryRepository } from '@/data/repositories/DexieCategoryRepository';
import type { CategoryValue } from '@/domain/models/entities';

import { CategoryReadService } from './categoryReadService';

let database: ClassroomDatabase;
let service: CategoryReadService;

const now = '2026-07-21T18:00:00.000Z';

function value(
  overrides: Partial<CategoryValue> & Pick<CategoryValue, 'id' | 'name'>,
): CategoryValue {
  return {
    familyId: 'purpose-tag',
    normalizedName: overrides.name.toLocaleLowerCase('en-US'),
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
  database = new ClassroomDatabase(`category-read-${crypto.randomUUID()}`);
  await database.open();
  service = new CategoryReadService(new DexieCategoryRepository(database));
});

afterEach(async () => {
  await database.delete();
});

describe('CategoryReadService', () => {
  it('exposes the seven locked families and only active values in selectors', async () => {
    await database.categoryValues.bulkPut([
      value({ id: 'active', name: 'Active', sortOrder: 1 }),
      value({
        id: 'archived',
        name: 'Archived',
        normalizedName: 'archived',
        lifecycleState: 'archived',
        archivedAt: now,
        sortOrder: 0,
      }),
    ]);

    expect(service.listFamilies()).toHaveLength(7);
    expect((await service.listSelectableValues('purpose-tag')).map((item) => item.id)).toEqual([
      'active',
    ]);
  });

  it('resolves a retained alias through merged history to the surviving value', async () => {
    await database.categoryValues.bulkPut([
      value({
        id: 'target',
        name: 'Comprehension',
        normalizedName: 'comprehension',
        aliases: ['Reading'],
        normalizedAliases: ['reading'],
      }),
      value({
        id: 'source',
        name: 'Reading',
        normalizedName: 'reading',
        lifecycleState: 'merged',
        mergedIntoId: 'target',
        mergedAt: now,
        sortOrder: 1,
      }),
    ]);

    const resolution = await service.resolveReference('purpose-tag', 'Reading');
    expect(resolution).toMatchObject({
      matchedBy: 'name',
      matchedValueId: 'source',
      value: { id: 'target', lifecycleState: 'active' },
    });
  });

  it('reports usage by source entity type without creating a duplicate domain record', async () => {
    await database.categoryValues.put(value({ id: 'purpose-reading', name: 'Reading' }));
    await database.categoryAssignments.bulkPut([
      {
        id: 'assignment-1',
        familyId: 'purpose-tag',
        categoryValueId: 'purpose-reading',
        entityType: 'lesson-plan',
        entityId: 'plan-1',
        createdAt: now,
      },
      {
        id: 'assignment-2',
        familyId: 'purpose-tag',
        categoryValueId: 'purpose-reading',
        entityType: 'lesson-plan',
        entityId: 'plan-2',
        createdAt: now,
      },
    ]);

    expect(await service.getUsageSummary('purpose-reading')).toEqual({
      total: 2,
      byEntityType: { 'lesson-plan': 2 },
      mergedSourceCount: 0,
    });
  });
});

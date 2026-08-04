import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { DexieCategoryRepository } from '@/data/repositories/DexieCategoryRepository';
import type { CategoryValue, ClassificationMappingPreset } from '@/domain/models/entities';

import { ClassificationMappingPresetReadService } from './classificationMappingPresetReadService';

let database: ClassroomDatabase;
let service: ClassificationMappingPresetReadService;

const now = '2026-08-03T18:00:00.000Z';

function value(id: string, name: string, overrides: Partial<CategoryValue> = {}): CategoryValue {
  return {
    id,
    familyId: 'subject',
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

function preset(
  id: string,
  sourceText: string,
  targetCategoryValueId: string,
  overrides: Partial<ClassificationMappingPreset> = {},
): ClassificationMappingPreset {
  return {
    id,
    familyId: 'subject',
    sourceText,
    normalizedSourceText: sourceText.toLocaleLowerCase('en-US'),
    targetCategoryValueId,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(async () => {
  database = new ClassroomDatabase(`mapping-preset-read-${crypto.randomUUID()}`);
  await database.open();
  service = new ClassificationMappingPresetReadService(new DexieCategoryRepository(database));
});

afterEach(async () => {
  await database.delete();
});

describe('ClassificationMappingPresetReadService', () => {
  it('reports ready, inactive, shadowed, and unsafe target states', async () => {
    await database.categoryValues.bulkPut([
      value('subject-ela', 'English Language Arts', {
        aliases: ['Language Arts'],
        normalizedAliases: ['language arts'],
      }),
      value('subject-math', 'Mathematics'),
      value('subject-archived', 'Archived', {
        lifecycleState: 'archived',
        archivedAt: now,
      }),
      value('subject-merged', 'Merged', {
        lifecycleState: 'merged',
        mergedIntoId: 'subject-ela',
        mergedAt: now,
      }),
      value('grade-3', 'Grade 3', { familyId: 'grade-level' }),
    ]);
    await database.classificationMappingPresets.bulkPut([
      preset('mapping-ready', 'ELA', 'subject-ela'),
      preset('mapping-inactive', 'Maths', 'subject-math', {
        status: 'inactive',
        deactivatedAt: now,
      }),
      preset('mapping-shadowed', 'Language Arts', 'subject-ela'),
      preset('mapping-archived', 'Old subject', 'subject-archived'),
      preset('mapping-merged', 'Former subject', 'subject-merged'),
      preset('mapping-wrong-family', 'G3', 'grade-3'),
      preset('mapping-missing', 'Missing', 'missing-target'),
    ]);

    expect(
      Object.fromEntries(
        (await service.listForFamily('subject')).map((item) => [item.preset.id, item.health]),
      ),
    ).toEqual({
      'mapping-ready': 'ready',
      'mapping-inactive': 'inactive',
      'mapping-shadowed': 'shadowed-by-canonical',
      'mapping-archived': 'target-archived',
      'mapping-merged': 'target-merged',
      'mapping-wrong-family': 'wrong-family',
      'mapping-missing': 'target-missing',
    });
  });

  it('counts active and total dependencies for a controlled value', async () => {
    await database.classificationMappingPresets.bulkPut([
      preset('mapping-active', 'ELA', 'subject-ela'),
      preset('mapping-inactive', 'English LA', 'subject-ela', {
        status: 'inactive',
        deactivatedAt: now,
      }),
    ]);

    await expect(service.getDependencyCounts('subject-ela')).resolves.toEqual({
      total: 2,
      active: 1,
    });
  });
});

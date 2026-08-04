import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import type { CategoryValue } from '@/domain/models/entities';
import { EditHistoryService } from '@/features/editing/editHistoryService';

import {
  ClassificationMappingPresetCanonicalCollisionError,
  ClassificationMappingPresetConflictError,
  ClassificationMappingPresetMutationService,
} from './classificationMappingPresetMutationService';

let database: ClassroomDatabase;
let ids: string[];
let service: ClassificationMappingPresetMutationService;
let history: EditHistoryService;

const now = '2026-08-03T18:00:00.000Z';

function value(id: string, name: string, aliases: string[] = []): CategoryValue {
  return {
    id,
    familyId: 'subject',
    name,
    normalizedName: name.toLocaleLowerCase('en-US'),
    aliases,
    normalizedAliases: aliases.map((alias) => alias.toLocaleLowerCase('en-US')),
    sortOrder: 0,
    isDefault: false,
    lifecycleState: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

beforeEach(async () => {
  database = new ClassroomDatabase(`mapping-preset-mutation-${crypto.randomUUID()}`);
  await database.open();
  await database.categoryValues.bulkPut([
    value('subject-ela', 'English Language Arts', ['Language Arts']),
    value('subject-math', 'Mathematics'),
  ]);
  ids = [];
  service = new ClassificationMappingPresetMutationService(database, {
    createId: () => ids.shift() ?? crypto.randomUUID(),
    now: () => now,
  });
  history = new EditHistoryService(database, { now: () => '2026-08-03T19:00:00.000Z' });
});

afterEach(async () => {
  await database.delete();
});

describe('ClassificationMappingPresetMutationService', () => {
  it('creates one family-scoped mapping and participates in global Undo/Redo', async () => {
    ids = ['mapping-ela', 'log-create'];
    await service.create('subject', {
      sourceText: 'ELA',
      targetCategoryValueId: 'subject-ela',
    });

    expect(await database.classificationMappingPresets.get('mapping-ela')).toMatchObject({
      familyId: 'subject',
      sourceText: 'ELA',
      normalizedSourceText: 'ela',
      targetCategoryValueId: 'subject-ela',
      status: 'active',
    });

    await history.undo();
    expect(await database.classificationMappingPresets.get('mapping-ela')).toBeUndefined();
    await history.redo();
    expect(await database.classificationMappingPresets.get('mapping-ela')).toBeDefined();
  });

  it('updates, deactivates, activates, and deletes a mapping as independent commands', async () => {
    ids = ['mapping-ela', 'log-create'];
    await service.create('subject', {
      sourceText: 'ELA',
      targetCategoryValueId: 'subject-ela',
    });

    ids = ['log-update'];
    await service.update('mapping-ela', {
      sourceText: 'English LA',
      targetCategoryValueId: 'subject-ela',
    });
    expect(await database.classificationMappingPresets.get('mapping-ela')).toMatchObject({
      sourceText: 'English LA',
      normalizedSourceText: 'english la',
    });

    ids = ['log-deactivate'];
    await service.setStatus('mapping-ela', 'inactive');
    expect(await database.classificationMappingPresets.get('mapping-ela')).toMatchObject({
      status: 'inactive',
      deactivatedAt: now,
    });

    ids = ['log-activate'];
    await service.setStatus('mapping-ela', 'active');
    expect(await database.classificationMappingPresets.get('mapping-ela')).toMatchObject({
      status: 'active',
      deactivatedAt: undefined,
    });

    ids = ['log-delete'];
    await service.delete('mapping-ela');
    expect(await database.classificationMappingPresets.get('mapping-ela')).toBeUndefined();
    await history.undo();
    expect(await database.classificationMappingPresets.get('mapping-ela')).toBeDefined();
  });

  it('prevents duplicate family/source keys and canonical name or alias collisions', async () => {
    ids = ['mapping-ela', 'log-create'];
    await service.create('subject', {
      sourceText: 'ELA',
      targetCategoryValueId: 'subject-ela',
    });

    await expect(
      service.create('subject', {
        sourceText: ' ela ',
        targetCategoryValueId: 'subject-math',
      }),
    ).rejects.toBeInstanceOf(ClassificationMappingPresetConflictError);

    await expect(
      service.create('subject', {
        sourceText: 'Language Arts',
        targetCategoryValueId: 'subject-ela',
      }),
    ).rejects.toBeInstanceOf(ClassificationMappingPresetCanonicalCollisionError);
  });

  it('requires an active target from the same family', async () => {
    await database.categoryValues.put({
      ...value('grade-3', 'Grade 3'),
      familyId: 'grade-level',
    });
    await database.categoryValues.put({
      ...value('subject-archived', 'Archived subject'),
      lifecycleState: 'archived',
      archivedAt: now,
    });

    await expect(
      service.create('subject', {
        sourceText: 'G3',
        targetCategoryValueId: 'grade-3',
      }),
    ).rejects.toThrow(/same category family/);
    await expect(
      service.create('subject', {
        sourceText: 'Old subject',
        targetCategoryValueId: 'subject-archived',
      }),
    ).rejects.toThrow(/active controlled value/);
  });
});

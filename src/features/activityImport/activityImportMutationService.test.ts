import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  categoryValueSchema,
  classificationMappingPresetSchema,
  libraryCatalogItemSchema,
  type LibraryCatalogItem,
} from '@/domain/models/entities';
import { EditHistoryService } from '@/features/editing/editHistoryService';
import { applyImportOperations } from '@/features/importCenter/applyImportOperations';
import { buildImportTable } from '@/features/importCenter/importTableModel';

import {
  buildActivityImportIdentity,
  buildActivityImportPreview,
  suggestActivityImportMapping,
} from './activityImportModel';
import { ActivityImportMutationService } from './activityImportMutationService';

let database: ClassroomDatabase;
const timestamp = '2026-07-31T12:00:00.000Z';

function ids(prefix: string) {
  let index = 0;
  return () => `${prefix}-${++index}`;
}

function existingActivity(overrides: Partial<LibraryCatalogItem> = {}): LibraryCatalogItem {
  return libraryCatalogItemSchema.parse({
    id: 'activity-existing',
    catalogType: 'activity',
    title: 'Partner retell',
    description: 'Existing manual description.',
    tags: ['Manual'],
    typedFields: {
      catalogType: 'activity',
      grouping: 'partners',
      notes: 'Existing teacher note.',
    },
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  });
}

async function buildPreview(
  rows: string[][],
  options: {
    defaults?: { externalSource?: string; sourceReference?: string };
    categoryDecisions?: Parameters<typeof buildActivityImportPreview>[0]['categoryDecisions'];
    duplicateDecisions?: Parameters<typeof buildActivityImportPreview>[0]['duplicateDecisions'];
    mappingPersistenceDecisions?: Parameters<
      typeof buildActivityImportPreview
    >[0]['mappingPersistenceDecisions'];
  } = {},
) {
  const table = buildImportTable(rows);
  const [existingItems, categoryValues, categoryAssignments, mappingPresets] = await Promise.all([
    database.libraryItems.toArray(),
    database.categoryValues.toArray(),
    database.categoryAssignments.toArray(),
    database.classificationMappingPresets.toArray(),
  ]);
  return buildActivityImportPreview(
    {
      table,
      mapping: suggestActivityImportMapping(table.headers),
      defaults: options.defaults ?? {},
      unmappedDecisions: {},
      duplicateDecisions: options.duplicateDecisions ?? {},
      categoryDecisions: options.categoryDecisions ?? {},
      mappingPersistenceDecisions: options.mappingPersistenceDecisions ?? {},
      existingItems,
      categoryValues,
      categoryAssignments,
      mappingPresets,
    },
    { createId: ids('preview'), now: () => timestamp },
  );
}

beforeEach(async () => {
  database = new ClassroomDatabase(`activity-import-${globalThis.crypto.randomUUID()}`);
  await database.open();
});

afterEach(async () => {
  await database.delete();
});

describe('ActivityImportMutationService', () => {
  it('commits Activities, controlled values, assignments, metadata, and one global Undo/Redo', async () => {
    const preview = await buildPreview(
      [
        ['activity_id', 'title', 'subject', 'purpose', 'steps', 'materials'],
        [
          'ACT-1',
          'Partner retell',
          'Chinese Language Arts',
          'Discussion',
          'Retell in pairs.',
          'Picture cards',
        ],
      ],
      {
        defaults: { externalSource: 'District Activity Catalog', sourceReference: 'Guide p. 10' },
        categoryDecisions: {
          'subject\u0000chinese language arts': { action: 'create' },
          'purpose-tag\u0000discussion': { action: 'create' },
        },
      },
    );
    const service = new ActivityImportMutationService(database, { createId: ids('commit') });
    const result = await service.commit(preview, {
      sourceKind: 'csv',
      sourceLabel: 'activities.csv',
      worksheetName: 'CSV data',
      confirmUpdates: false,
      confirmCommit: true,
    });

    expect(result.created).toHaveLength(1);
    expect(await database.libraryItems.count()).toBe(1);
    expect(await database.categoryValues.count()).toBe(2);
    expect(await database.categoryAssignments.count()).toBe(2);
    const importRun = await database.importRuns.get(preview.importRunId);
    expect(importRun).toMatchObject({
      importType: 'activities',
      sourceKind: 'csv',
      createdCount: 1,
      updatedCount: 0,
    });
    expect(JSON.parse(importRun?.summaryJson ?? '{}').classificationAudit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ familyId: 'subject', resolution: 'created' }),
        expect.objectContaining({ familyId: 'purpose-tag', resolution: 'created' }),
      ]),
    );
    const stored = (await database.libraryItems.toArray())[0];
    expect(stored).toMatchObject({
      title: 'Partner retell',
      sourceReference: 'Guide p. 10',
      lastImportRunId: preview.importRunId,
      typedFields: {
        catalogType: 'activity',
        materials: 'Picture cards',
        directions: 'Retell in pairs.',
      },
    });
    expect(await database.changeLog.count()).toBe(1);

    const history = new EditHistoryService(database, {
      now: () => '2026-07-31T12:05:00.000Z',
    });
    await history.undo();
    expect(await database.libraryItems.count()).toBe(0);
    expect(await database.categoryValues.count()).toBe(0);
    expect(await database.categoryAssignments.count()).toBe(0);
    expect(await database.importRuns.count()).toBe(0);

    await history.redo();
    expect(await database.libraryItems.count()).toBe(1);
    expect(await database.categoryValues.count()).toBe(2);
    expect(await database.categoryAssignments.count()).toBe(2);
    expect(await database.importRuns.count()).toBe(1);
  });

  it('updates only through stable identity and preserves blank or absent existing fields', async () => {
    const identity = buildActivityImportIdentity('District Activity Catalog', 'ACT-1');
    await database.libraryItems.put(
      existingActivity({
        externalSource: 'District Activity Catalog',
        externalKey: 'ACT-1',
        importIdentityKey: identity,
      }),
    );
    const preview = await buildPreview(
      [
        ['activity_id', 'title', 'duration_minutes', 'tags'],
        ['ACT-1', 'Partner retell', '18', 'Imported'],
      ],
      { defaults: { externalSource: 'District Activity Catalog' } },
    );
    expect(preview.rows[0]?.classification).toBe('update');

    await new ActivityImportMutationService(database, { createId: ids('commit') }).commit(preview, {
      sourceKind: 'xlsx',
      sourceLabel: 'activities.xlsx',
      worksheetName: 'Activities',
      confirmUpdates: true,
      confirmCommit: true,
    });

    expect(await database.libraryItems.get('activity-existing')).toMatchObject({
      description: 'Existing manual description.',
      tags: ['Manual', 'Imported'],
      typedFields: {
        catalogType: 'activity',
        grouping: 'partners',
        estimatedMinutes: 18,
        notes: 'Existing teacher note.',
      },
    });
  });

  it('rejects stale previews before writing import metadata', async () => {
    const identity = buildActivityImportIdentity('District Activity Catalog', 'ACT-1');
    const existing = existingActivity({
      externalSource: 'District Activity Catalog',
      externalKey: 'ACT-1',
      importIdentityKey: identity,
    });
    await database.libraryItems.put(existing);
    const preview = await buildPreview(
      [
        ['activity_id', 'title', 'duration_minutes'],
        ['ACT-1', 'Partner retell', '18'],
      ],
      { defaults: { externalSource: 'District Activity Catalog' } },
    );
    await database.libraryItems.put(
      libraryCatalogItemSchema.parse({
        ...existing,
        title: 'Changed in another tab',
        updatedAt: '2026-07-31T12:01:00.000Z',
      }),
    );

    await expect(
      new ActivityImportMutationService(database).commit(preview, {
        sourceKind: 'json',
        sourceLabel: 'activities.json',
        worksheetName: 'JSON data',
        confirmUpdates: true,
        confirmCommit: true,
      }),
    ).rejects.toThrow('changed after preview');
    expect(await database.importRuns.count()).toBe(0);
    expect(await database.changeLog.count()).toBe(0);
  });

  it('rolls back every table when a write fails after partial operations', async () => {
    const preview = await buildPreview([
      ['title', 'materials'],
      ['Question carousel', 'Question cards'],
    ]);
    const service = new ActivityImportMutationService(database, {
      createId: ids('commit'),
      applyOperations: async (db, operations) => {
        await applyImportOperations(db, operations.slice(0, 1));
        throw new Error('forced write failure');
      },
    });

    await expect(
      service.commit(preview, {
        sourceKind: 'paste-table',
        sourceLabel: 'Pasted table',
        worksheetName: 'Pasted table',
        confirmUpdates: false,
        confirmCommit: true,
      }),
    ).rejects.toThrow('forced write failure');

    expect(await database.libraryItems.count()).toBe(0);
    expect(await database.categoryValues.count()).toBe(0);
    expect(await database.categoryAssignments.count()).toBe(0);
    expect(await database.importRuns.count()).toBe(0);
    expect(await database.changeLog.count()).toBe(0);
  });

  it('blocks commit when a mapping used by preview changes', async () => {
    await database.categoryValues.put(
      categoryValueSchema.parse({
        id: 'subject-ela-stale',
        familyId: 'subject',
        name: 'English Language Arts',
        normalizedName: 'english language arts',
        aliases: [],
        normalizedAliases: [],
        sortOrder: 0,
        isDefault: false,
        lifecycleState: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );
    const mapping = classificationMappingPresetSchema.parse({
      id: 'mapping-ela-stale',
      familyId: 'subject',
      sourceText: 'ELA',
      normalizedSourceText: 'ela',
      targetCategoryValueId: 'subject-ela-stale',
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await database.classificationMappingPresets.put(mapping);
    const preview = await buildPreview([
      ['title', 'subject'],
      ['Stale mapping activity', 'ELA'],
    ]);
    await database.classificationMappingPresets.put(
      classificationMappingPresetSchema.parse({
        ...mapping,
        status: 'inactive',
        deactivatedAt: '2026-07-31T12:01:00.000Z',
        updatedAt: '2026-07-31T12:01:00.000Z',
      }),
    );

    await expect(
      new ActivityImportMutationService(database, { createId: ids('commit') }).commit(preview, {
        sourceKind: 'csv',
        confirmUpdates: false,
        confirmCommit: true,
      }),
    ).rejects.toThrow(/changed after preview/i);
    expect(await database.libraryItems.count()).toBe(0);
    expect(await database.importRuns.count()).toBe(0);
  });

  it('saves one mapping with the import and globally undoes and redoes both', async () => {
    await database.categoryValues.put(
      categoryValueSchema.parse({
        id: 'subject-ela',
        familyId: 'subject',
        name: 'English Language Arts',
        normalizedName: 'english language arts',
        aliases: [],
        normalizedAliases: [],
        sortOrder: 0,
        isDefault: false,
        lifecycleState: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );
    const reviewKey = 'subject\u0000ela';
    const preview = await buildPreview(
      [
        ['title', 'subject'],
        ['Partner retell', 'ELA'],
      ],
      {
        categoryDecisions: {
          [reviewKey]: { action: 'use', categoryValueId: 'subject-ela' },
        },
        mappingPersistenceDecisions: { [reviewKey]: 'save' },
      },
    );

    const result = await new ActivityImportMutationService(database, {
      createId: ids('commit'),
    }).commit(preview, {
      sourceKind: 'csv',
      confirmUpdates: false,
      confirmCommit: true,
    });

    expect(result.createdMappingPresets).toEqual([
      expect.objectContaining({ sourceText: 'ELA', targetCategoryValueId: 'subject-ela' }),
    ]);
    expect(await database.classificationMappingPresets.count()).toBe(1);
    const summary = JSON.parse(
      (await database.importRuns.get(preview.importRunId))?.summaryJson ?? '{}',
    );
    expect(summary.classificationMappingAudit).toEqual([
      expect.objectContaining({ action: 'created', targetCategoryValueId: 'subject-ela' }),
    ]);

    const history = new EditHistoryService(database, {
      now: () => '2026-07-31T12:06:00.000Z',
    });
    await history.undo();
    expect(await database.classificationMappingPresets.count()).toBe(0);
    await history.redo();
    expect(
      classificationMappingPresetSchema.parse(
        (await database.classificationMappingPresets.toArray())[0],
      ),
    ).toMatchObject({ sourceText: 'ELA', status: 'active' });
  });
});

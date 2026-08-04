import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  categoryValueSchema,
  libraryCatalogItemSchema,
  type LibraryCatalogItem,
} from '@/domain/models/entities';
import { EditHistoryService } from '@/features/editing/editHistoryService';
import { applyImportOperations } from '@/features/importCenter/applyImportOperations';
import { buildImportTable } from '@/features/importCenter/importTableModel';

import {
  buildResourceImportIdentity,
  buildResourceImportPreview,
  suggestResourceImportMapping,
} from './resourceImportModel';
import { ResourceImportMutationService } from './resourceImportMutationService';

let database: ClassroomDatabase;
const timestamp = '2026-08-01T04:00:00.000Z';

function ids(prefix: string) {
  let index = 0;
  return () => `${prefix}-${++index}`;
}

function existingResource(overrides: Partial<LibraryCatalogItem> = {}): LibraryCatalogItem {
  return libraryCatalogItemSchema.parse({
    id: 'resource-existing',
    catalogType: 'resource',
    title: 'Weather deck',
    description: 'Existing manual description.',
    tags: ['Manual'],
    typedFields: {
      catalogType: 'resource',
      sourceLocation: 'Shared Drive / Weather.pptx',
      usageNotes: 'Existing teacher note.',
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
    formatDecisions?: Parameters<typeof buildResourceImportPreview>[0]['formatDecisions'];
    classificationDecisions?: Parameters<
      typeof buildResourceImportPreview
    >[0]['classificationDecisions'];
    duplicateDecisions?: Parameters<typeof buildResourceImportPreview>[0]['duplicateDecisions'];
  } = {},
) {
  const table = buildImportTable(rows);
  const [existingItems, categoryValues, categoryAssignments] = await Promise.all([
    database.libraryItems.toArray(),
    database.categoryValues.toArray(),
    database.categoryAssignments.toArray(),
  ]);
  return buildResourceImportPreview(
    {
      table,
      mapping: suggestResourceImportMapping(table.headers),
      defaults: options.defaults ?? {},
      unmappedDecisions: {},
      duplicateDecisions: options.duplicateDecisions ?? {},
      formatDecisions: options.formatDecisions ?? {},
      classificationDecisions: options.classificationDecisions ?? {},
      sourceDecisions: {},
      existingItems,
      categoryValues,
      categoryAssignments,
    },
    { createId: ids('preview'), now: () => timestamp },
  );
}

beforeEach(async () => {
  database = new ClassroomDatabase(`resource-import-${globalThis.crypto.randomUUID()}`);
  await database.open();
});

afterEach(async () => {
  await database.delete();
});

describe('ResourceImportMutationService', () => {
  it('commits Resources, Resource Format, metadata, and one global Undo/Redo', async () => {
    const preview = await buildPreview(
      [
        [
          'resource_id',
          'title',
          'subject',
          'purpose',
          'resource_format',
          'source_location',
          'usage_notes',
        ],
        [
          'RES-1',
          'Weather deck',
          'Chinese Language Arts',
          'Oral rehearsal',
          'Slides',
          'Shared Drive / Weather.pptx',
          'Use in pairs.',
        ],
      ],
      {
        defaults: { externalSource: 'District Resource Catalog', sourceReference: 'Guide p. 10' },
        classificationDecisions: {
          'subject\u0000chinese language arts': { action: 'create' },
          'purpose-tag\u0000oral rehearsal': { action: 'create' },
          'resource-format\u0000slides': { action: 'create' },
        },
      },
    );
    const service = new ResourceImportMutationService(database, { createId: ids('commit') });
    const result = await service.commit(preview, {
      sourceKind: 'csv',
      sourceLabel: 'resources.csv',
      worksheetName: 'CSV data',
      confirmUpdates: false,
      confirmCommit: true,
    });

    expect(result.created).toHaveLength(1);
    expect(await database.libraryItems.count()).toBe(1);
    expect(await database.categoryValues.count()).toBe(3);
    expect(await database.categoryAssignments.count()).toBe(3);
    const importRun = await database.importRuns.get(preview.importRunId);
    expect(importRun).toMatchObject({
      importType: 'resources',
      sourceKind: 'csv',
      createdCount: 1,
    });
    const importSummary = JSON.parse(importRun?.summaryJson ?? '{}');
    expect(importSummary).toMatchObject({
      createdCategoryValues: 3,
      createdResourceFormats: 1,
      restoredResourceFormats: 0,
    });
    expect(importSummary.classificationAudit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ familyId: 'subject', resolution: 'created' }),
        expect.objectContaining({ familyId: 'purpose-tag', resolution: 'created' }),
        expect.objectContaining({ familyId: 'resource-format', resolution: 'created' }),
      ]),
    );
    expect((await database.libraryItems.toArray())[0]).toMatchObject({
      sourceReference: 'Guide p. 10',
      typedFields: {
        catalogType: 'resource',
        sourceLocation: 'Shared Drive / Weather.pptx',
        usageNotes: 'Usage notes\nUse in pairs.',
      },
    });

    const history = new EditHistoryService(database, {
      now: () => '2026-08-01T04:05:00.000Z',
    });
    await history.undo();
    expect(await database.libraryItems.count()).toBe(0);
    expect(await database.categoryValues.count()).toBe(0);
    expect(await database.categoryAssignments.count()).toBe(0);
    expect(await database.importRuns.count()).toBe(0);

    await history.redo();
    expect(await database.libraryItems.count()).toBe(1);
    expect(await database.categoryValues.count()).toBe(3);
    expect(await database.categoryAssignments.count()).toBe(3);
    expect(await database.importRuns.count()).toBe(1);
  });

  it('replaces one Resource Format and preserves absent existing fields', async () => {
    const slides = categoryValueSchema.parse({
      id: 'format-slides',
      familyId: 'resource-format',
      name: 'Slides',
      normalizedName: 'slides',
      aliases: [],
      normalizedAliases: [],
      sortOrder: 0,
      isDefault: false,
      lifecycleState: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const document = categoryValueSchema.parse({
      ...slides,
      id: 'format-document',
      name: 'Document',
      normalizedName: 'document',
      sortOrder: 1,
    });
    await database.categoryValues.bulkPut([slides, document]);
    const identity = buildResourceImportIdentity('District', 'RES-2');
    await database.libraryItems.put(
      existingResource({
        externalSource: 'District',
        externalKey: 'RES-2',
        importIdentityKey: identity,
      }),
    );
    await database.categoryAssignments.put({
      id: 'assignment-slides',
      familyId: 'resource-format',
      categoryValueId: slides.id,
      entityType: 'library-item',
      entityId: 'resource-existing',
      createdAt: timestamp,
    });
    const preview = await buildPreview(
      [
        ['resource_id', 'title', 'resource_format', 'tags'],
        ['RES-2', 'Weather deck', 'Document', 'Imported'],
      ],
      { defaults: { externalSource: 'District' } },
    );

    await new ResourceImportMutationService(database, { createId: ids('commit') }).commit(preview, {
      sourceKind: 'xlsx',
      sourceLabel: 'resources.xlsx',
      worksheetName: 'Resources',
      confirmUpdates: true,
      confirmCommit: true,
    });

    expect(await database.libraryItems.get('resource-existing')).toMatchObject({
      description: 'Existing manual description.',
      tags: ['Manual', 'Imported'],
      typedFields: {
        catalogType: 'resource',
        sourceLocation: 'Shared Drive / Weather.pptx',
        usageNotes: 'Existing teacher note.',
      },
    });
    expect(await database.categoryAssignments.toArray()).toEqual([
      expect.objectContaining({ categoryValueId: document.id, entityId: 'resource-existing' }),
    ]);
  });

  it('rejects stale previews before writing import metadata', async () => {
    const identity = buildResourceImportIdentity('District', 'RES-3');
    const existing = existingResource({
      externalSource: 'District',
      externalKey: 'RES-3',
      importIdentityKey: identity,
    });
    await database.libraryItems.put(existing);
    const preview = await buildPreview(
      [
        ['resource_id', 'title', 'usage_notes'],
        ['RES-3', 'Weather deck', 'New note'],
      ],
      { defaults: { externalSource: 'District' } },
    );
    await database.libraryItems.put(
      libraryCatalogItemSchema.parse({
        ...existing,
        title: 'Changed in another tab',
        updatedAt: '2026-08-01T04:01:00.000Z',
      }),
    );

    await expect(
      new ResourceImportMutationService(database).commit(preview, {
        sourceKind: 'json',
        sourceLabel: 'resources.json',
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
      ['title', 'source_location'],
      ['Fictional map', 'Binder A'],
    ]);
    const service = new ResourceImportMutationService(database, {
      createId: ids('commit'),
      applyOperations: async (db, operations) => {
        await applyImportOperations(db, operations.slice(0, 1));
        throw new Error('forced write failure');
      },
    });

    await expect(
      service.commit(preview, {
        sourceKind: 'file-metadata',
        sourceLabel: 'One local file metadata row',
        worksheetName: 'File Metadata',
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
});

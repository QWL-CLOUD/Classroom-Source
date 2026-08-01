import 'fake-indexeddb/auto';

import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  changeLogSchema,
  importRunSchema,
  libraryCatalogItemSchema,
} from '@/domain/models/entities';
import { EditHistoryService } from '@/features/editing/editHistoryService';

import { applyImportOperations } from './applyImportOperations';
import {
  createImportCommand,
  deleteImportCategoryAssignmentOperation,
  deleteImportCategoryValueOperation,
  deleteImportedLibraryItemOperation,
  deleteImportRunOperation,
  parseImportCommand,
  putImportCategoryAssignmentOperation,
  putImportCategoryValueOperation,
  putImportedLibraryItemOperation,
  putImportRunOperation,
  serializeImportCommand,
} from './importCommands';
import { ImportHistoryReadService } from './importHistoryReadService';

const names: string[] = [];
let database: ClassroomDatabase;

beforeEach(async () => {
  const name = `import-history-${crypto.randomUUID()}`;
  names.push(name);
  database = new ClassroomDatabase(name);
  await database.open();
});

afterEach(async () => {
  database.close();
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)));
});

describe('Import Center history and commands', () => {
  it('lists canonical runs together with legacy Standard batches without duplication', async () => {
    await database.importRuns.put(
      importRunSchema.parse({
        id: 'run-activity',
        importType: 'activities',
        sourceKind: 'json',
        sourceLabel: 'activities.json',
        totalRows: 2,
        createdCount: 2,
        updatedCount: 0,
        skippedCount: 0,
        reviewCount: 0,
        blockedCount: 0,
        committedAt: '2026-07-29T13:00:00.000Z',
      }),
    );
    await database.standardImportBatches.put({
      id: 'legacy-standard-batch',
      sourceName: 'Reviewed standards',
      issuingOrganization: 'Synthetic office',
      frameworkTitle: 'Synthetic framework',
      worksheetName: 'Standards',
      fileKind: 'xlsx',
      totalRows: 3,
      createdCount: 2,
      updatedCount: 0,
      duplicateCount: 1,
      createdAt: '2026-07-28T13:00:00.000Z',
    });

    const history = await new ImportHistoryReadService(database).list();

    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      id: 'run-activity',
      importType: 'activities',
      origin: 'canonical',
    });
    expect(history[1]).toMatchObject({
      id: 'legacy-standard-batch',
      importType: 'standards',
      skippedCount: 1,
      origin: 'legacy-standard-batch',
    });
  });

  it('serializes and atomically applies import metadata and Catalog operations', async () => {
    const run = importRunSchema.parse({
      id: 'run-resource',
      importType: 'resources',
      sourceKind: 'csv',
      sourceLabel: 'resources.csv',
      totalRows: 1,
      createdCount: 1,
      updatedCount: 0,
      skippedCount: 0,
      reviewCount: 0,
      blockedCount: 0,
      committedAt: '2026-07-29T13:00:00.000Z',
    });
    const item = libraryCatalogItemSchema.parse({
      id: 'resource-imported',
      catalogType: 'resource',
      title: 'Imported map',
      tags: [],
      externalSource: 'district catalog',
      externalKey: 'map-1',
      importIdentityKey: 'resource\u0000district catalog\u0000map-1',
      lastImportRunId: run.id,
      status: 'active',
      createdAt: run.committedAt,
      updatedAt: run.committedAt,
    });
    const command = createImportCommand([
      putImportRunOperation(run),
      putImportedLibraryItemOperation(item),
    ]);

    await database.transaction('rw', [database.importRuns, database.libraryItems], () =>
      applyImportOperations(
        database,
        parseImportCommand(serializeImportCommand(command)).operations,
      ),
    );

    expect(await database.importRuns.get(run.id)).toEqual(run);
    expect(await database.libraryItems.get(item.id)).toEqual(item);

    await applyImportOperations(database, [deleteImportRunOperation(run.id)]);
    expect(await database.importRuns.get(run.id)).toBeUndefined();
  });

  it('participates in persistent global Undo and Redo as one import change', async () => {
    const committedAt = '2026-07-29T14:00:00.000Z';
    const run = importRunSchema.parse({
      id: 'run-undo',
      importType: 'activities',
      sourceKind: 'paste-table',
      totalRows: 1,
      createdCount: 1,
      updatedCount: 0,
      skippedCount: 0,
      reviewCount: 0,
      blockedCount: 0,
      committedAt,
    });
    const item = libraryCatalogItemSchema.parse({
      id: 'activity-undo',
      catalogType: 'activity',
      title: 'Undoable activity',
      tags: [],
      lastImportRunId: run.id,
      status: 'active',
      createdAt: committedAt,
      updatedAt: committedAt,
    });
    const purposeValue = {
      id: 'purpose-imported',
      familyId: 'purpose-tag' as const,
      name: 'Oral language',
      normalizedName: 'oral language',
      aliases: [],
      normalizedAliases: [],
      sortOrder: 0,
      isDefault: false,
      lifecycleState: 'active' as const,
      createdAt: committedAt,
      updatedAt: committedAt,
    };
    const assignment = {
      id: 'assignment-imported',
      familyId: 'purpose-tag' as const,
      categoryValueId: purposeValue.id,
      entityType: 'library-item' as const,
      entityId: item.id,
      createdAt: committedAt,
    };
    const forward = createImportCommand([
      putImportCategoryValueOperation(purposeValue),
      putImportedLibraryItemOperation(item),
      putImportCategoryAssignmentOperation(assignment),
      putImportRunOperation(run),
    ]);
    const inverse = createImportCommand([
      deleteImportCategoryAssignmentOperation(assignment.id),
      deleteImportedLibraryItemOperation(item.id),
      deleteImportCategoryValueOperation(purposeValue.id),
      deleteImportRunOperation(run.id),
    ]);

    await database.transaction(
      'rw',
      [
        database.importRuns,
        database.libraryItems,
        database.categoryValues,
        database.categoryAssignments,
        database.changeLog,
      ],
      async () => {
        await applyImportOperations(database, forward.operations);
        await database.changeLog.put(
          changeLogSchema.parse({
            id: 'import-log',
            label: 'Import one Activity',
            commandType: 'import-center.catalog.commit',
            forwardJson: serializeImportCommand(forward),
            inverseJson: serializeImportCommand(inverse),
            createdAt: committedAt,
          }),
        );
      },
    );

    const history = new EditHistoryService(database, {
      now: () => '2026-07-29T14:01:00.000Z',
    });
    await history.undo();
    expect(await database.importRuns.get(run.id)).toBeUndefined();
    expect(await database.libraryItems.get(item.id)).toBeUndefined();
    expect(await database.categoryValues.get(purposeValue.id)).toBeUndefined();
    expect(await database.categoryAssignments.get(assignment.id)).toBeUndefined();

    await history.redo();
    expect(await database.importRuns.get(run.id)).toEqual(run);
    expect(await database.libraryItems.get(item.id)).toEqual(item);
    expect(await database.categoryValues.get(purposeValue.id)).toEqual(purposeValue);
    expect(await database.categoryAssignments.get(assignment.id)).toEqual(assignment);
  });

  it('lists Resource URL and file-metadata runs through canonical history', async () => {
    await database.importRuns.bulkPut([
      importRunSchema.parse({
        id: 'run-resource-url',
        importType: 'resources',
        sourceKind: 'paste-url',
        sourceLabel: 'https://example.invalid/resource',
        worksheetName: 'URL Resource',
        totalRows: 1,
        createdCount: 1,
        updatedCount: 0,
        skippedCount: 0,
        reviewCount: 0,
        blockedCount: 0,
        committedAt: '2026-08-01T04:00:00.000Z',
      }),
      importRunSchema.parse({
        id: 'run-resource-files',
        importType: 'resources',
        sourceKind: 'file-metadata',
        sourceLabel: '2 local file metadata rows',
        worksheetName: 'File Metadata',
        totalRows: 2,
        createdCount: 2,
        updatedCount: 0,
        skippedCount: 0,
        reviewCount: 0,
        blockedCount: 0,
        committedAt: '2026-08-01T04:01:00.000Z',
      }),
    ]);

    const history = await new ImportHistoryReadService(database).list();
    expect(history.map((entry) => [entry.id, entry.sourceKind])).toEqual([
      ['run-resource-files', 'file-metadata'],
      ['run-resource-url', 'paste-url'],
    ]);
  });

  it('reads canonical Assessment import history', async () => {
    await database.importRuns.add(
      importRunSchema.parse({
        id: 'assessment-import-run',
        importType: 'assessments',
        sourceKind: 'csv',
        sourceLabel: 'Assessments.csv',
        totalRows: 2,
        createdCount: 1,
        updatedCount: 1,
        skippedCount: 0,
        reviewCount: 0,
        blockedCount: 0,
        committedAt: '2026-08-01T00:00:00.000Z',
      }),
    );
    const history = await new ImportHistoryReadService(database).list();
    expect(history).toHaveLength(1);
    expect(history[0]?.importType).toBe('assessments');
  });
});

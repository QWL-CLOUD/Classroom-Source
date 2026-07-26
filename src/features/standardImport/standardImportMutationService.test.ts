import 'fake-indexeddb/auto';

import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { standardSchema, type Standard } from '@/domain/models/entities';
import { EditHistoryService } from '@/features/editing/editHistoryService';

import {
  buildStandardImportPreview,
  buildStandardImportTable,
  suggestStandardImportMapping,
  type StandardImportSourceValues,
} from './standardImportModel';
import { StandardImportMutationService } from './standardImportMutationService';

let database: ClassroomDatabase;
const names: string[] = [];
const timestamp = '2026-07-25T17:00:00.000Z';
const source: StandardImportSourceValues = {
  sourceName: 'Reviewed mathematics framework',
  issuingOrganization: 'Synthetic Standards Office',
  frameworkTitle: 'Synthetic Mathematics Standards',
  jurisdiction: 'Synthetic scope',
  version: '2026',
  importNote: 'Reviewed locally.',
};

function standard(overrides: Partial<Standard> = {}): Standard {
  return standardSchema.parse({
    id: 'existing-1',
    issuingOrganization: source.issuingOrganization,
    frameworkTitle: source.frameworkTitle,
    jurisdiction: source.jurisdiction,
    subject: 'Mathematics',
    gradeBand: '3',
    version: source.version,
    frameworkKey: 'synthetic standards office|synthetic mathematics standards|synthetic scope|2026',
    code: '3.NF.A.1',
    normalizedCode: '3.nf.a.1',
    statement: 'Old fraction statement.',
    sortOrder: 0,
    status: 'active',
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    ...overrides,
  });
}

beforeEach(async () => {
  const name = `standard-import-${crypto.randomUUID()}`;
  names.push(name);
  database = new ClassroomDatabase(name);
  await database.open();
});

afterEach(async () => {
  database.close();
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)));
});

describe('StandardImportMutationService', () => {
  it('commits one atomic batch and restores all records through one global Undo/Redo', async () => {
    const current = standard();
    const duplicate = standard({
      id: 'existing-duplicate',
      code: '3.NF.A.0',
      normalizedCode: '3.nf.a.0',
      statement: 'Read fraction notation.',
      sourceName: source.sourceName,
      importNote: source.importNote,
      importBatchId: 'older-batch',
    });
    await database.standards.bulkPut([current, duplicate]);
    const table = buildStandardImportTable([
      ['Code', 'Statement', 'Subject', 'Grade'],
      ['3.NF.A.0', 'Read fraction notation.', 'Mathematics', '3'],
      ['3.NF.A.1', 'Revised fraction statement.', 'Mathematics', '3'],
      ['3.NF.A.2', 'Represent fractions on a number line.', 'Mathematics', '3'],
    ]);
    const ids = ['batch-1', 'row-duplicate', 'row-update', 'row-new'];
    const preview = buildStandardImportPreview(
      {
        table,
        mapping: suggestStandardImportMapping(table.headers),
        source,
        existingStandards: [current, duplicate],
      },
      { createId: () => ids.shift() ?? crypto.randomUUID(), now: () => timestamp },
    );
    expect(preview.canCommit).toBe(true);
    expect(preview.summary).toMatchObject({ newCount: 1, updateCount: 1, duplicateCount: 1 });

    const service = new StandardImportMutationService(database, { createId: () => 'import-log' });
    await expect(
      service.commit(preview, {
        fileKind: 'csv',
        worksheetName: 'CSV data',
        confirmUpdates: false,
        confirmCommit: true,
      }),
    ).rejects.toThrow(/Confirm the reviewed updates/);

    const result = await service.commit(preview, {
      fileKind: 'csv',
      worksheetName: 'CSV data',
      confirmUpdates: true,
      confirmCommit: true,
    });
    expect(result).toMatchObject({ duplicateCount: 1 });
    expect(result.created).toHaveLength(1);
    expect(result.updated).toHaveLength(1);
    expect(await database.standardImportBatches.get('batch-1')).toMatchObject({
      totalRows: 3,
      createdCount: 1,
      updatedCount: 1,
      duplicateCount: 1,
    });
    expect(await database.standards.get('row-new')).toMatchObject({ importBatchId: 'batch-1' });
    expect(await database.standards.get('existing-1')).toMatchObject({
      statement: 'Revised fraction statement.',
      importBatchId: 'batch-1',
    });
    expect(await database.changeLog.count()).toBe(1);

    const history = new EditHistoryService(database, { now: () => '2026-07-25T17:10:00.000Z' });
    await history.undo();
    expect(await database.standardImportBatches.count()).toBe(0);
    expect(await database.standards.get('row-new')).toBeUndefined();
    expect(await database.standards.get('existing-1')).toEqual(current);
    expect(await database.standards.get('existing-duplicate')).toEqual(duplicate);

    await history.redo();
    expect(await database.standardImportBatches.count()).toBe(1);
    expect(await database.standards.get('row-new')).toBeDefined();
    expect(await database.standards.get('existing-1')).toMatchObject({
      statement: 'Revised fraction statement.',
    });
  });

  it('rejects a stale reviewed preview before any writes', async () => {
    const current = standard();
    await database.standards.put(current);
    const table = buildStandardImportTable([
      ['Code', 'Statement'],
      ['3.NF.A.1', 'Revised fraction statement.'],
    ]);
    const ids = ['batch-stale', 'row-stale'];
    const preview = buildStandardImportPreview(
      {
        table,
        mapping: suggestStandardImportMapping(table.headers),
        source,
        existingStandards: [current],
      },
      { createId: () => ids.shift() ?? crypto.randomUUID(), now: () => timestamp },
    );
    await database.standards.put(
      standard({ statement: 'Changed after preview.', updatedAt: '2026-07-25T16:59:00.000Z' }),
    );

    const service = new StandardImportMutationService(database, { createId: () => 'stale-log' });
    await expect(
      service.commit(preview, {
        fileKind: 'xlsx',
        worksheetName: 'Standards',
        confirmUpdates: true,
        confirmCommit: true,
      }),
    ).rejects.toThrow(/changed after preview/);
    expect(await database.standardImportBatches.count()).toBe(0);
    expect(await database.changeLog.count()).toBe(0);
  });
});

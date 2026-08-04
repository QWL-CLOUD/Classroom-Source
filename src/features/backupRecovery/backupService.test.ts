import 'fake-indexeddb/auto';

import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';

import {
  buildRestorePreview,
  createBackupEnvelope,
  emptyBackupTables,
  serializeBackupEnvelope,
} from './backupFormat';
import { BackupRecoveryService } from './backupService';

const names: string[] = [];
const firstTime = '2026-07-27T12:00:00.000Z';
const secondTime = '2026-07-27T12:00:01.000Z';

function familyIds(records: unknown[]): string[] {
  return records
    .map((record) => {
      const familyId =
        typeof record === 'object' && record !== null && 'familyId' in record
          ? record.familyId
          : undefined;

      if (typeof familyId !== 'string') {
        throw new Error('Expected a backup record with a string familyId.');
      }

      return familyId;
    })
    .sort();
}

let database: ClassroomDatabase;

function task(id: string, title: string) {
  return {
    id,
    title,
    status: 'active' as const,
    order: 0,
    createdAt: firstTime,
    updatedAt: firstTime,
  };
}

beforeEach(async () => {
  const name = `backup-recovery-${crypto.randomUUID()}`;
  names.push(name);
  database = new ClassroomDatabase(name);
  await database.open();
});

afterEach(async () => {
  database.close();
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)));
});

describe('BackupRecoveryService', () => {
  it('exports all user tables while excluding internal recovery tables', async () => {
    await database.tasks.put(task('current-task', 'Current task'));
    await database.assessmentEvidence.put({
      id: 'current-evidence',
      studentId: 'student-1',
      schoolYearId: 'year-1',
      occurredOn: '2026-07-28',
      title: 'Current evidence',
      kind: 'observation',
      observation: { text: 'Explained the strategy.' },
      standardIds: [],
      status: 'active',
      createdAt: firstTime,
      updatedAt: firstTime,
    });
    await database.libraryItems.put({
      id: 'current-activity',
      catalogType: 'activity',
      title: 'Current imported Activity',
      tags: ['Speaking'],
      typedFields: {
        catalogType: 'activity',
        grouping: 'partners',
        materials: 'Picture cards',
        notes: 'Preparation\nSort cards.',
      },
      externalSource: 'district catalog',
      externalKey: 'ACT-1',
      importIdentityKey: 'activity\u0000district catalog\u0000act-1',
      lastImportRunId: 'current-import-run',
      status: 'active',
      createdAt: firstTime,
      updatedAt: firstTime,
    });
    await database.categoryValues.put({
      id: 'current-purpose',
      familyId: 'purpose-tag',
      name: 'Oral language',
      normalizedName: 'oral language',
      aliases: [],
      normalizedAliases: [],
      sortOrder: 0,
      isDefault: false,
      lifecycleState: 'active',
      createdAt: firstTime,
      updatedAt: firstTime,
    });
    await database.categoryAssignments.put({
      id: 'current-purpose-assignment',
      familyId: 'purpose-tag',
      categoryValueId: 'current-purpose',
      entityType: 'library-item',
      entityId: 'current-activity',
      createdAt: firstTime,
    });
    await database.classificationMappingPresets.put({
      id: 'current-purpose-mapping',
      familyId: 'purpose-tag',
      sourceText: 'Oral Language',
      normalizedSourceText: 'oral language',
      targetCategoryValueId: 'current-purpose',
      status: 'active',
      createdAt: firstTime,
      updatedAt: firstTime,
    });
    await database.importRuns.put({
      id: 'current-import-run',
      importType: 'assessments',
      sourceKind: 'xlsx',
      sourceLabel: 'assessments.xlsx',
      worksheetName: 'Assessments',
      totalRows: 1,
      createdCount: 1,
      updatedCount: 0,
      skippedCount: 0,
      reviewCount: 0,
      blockedCount: 0,
      committedAt: firstTime,
    });
    await database.backupSnapshots.put({
      id: 'internal-snapshot',
      kind: 'pre-restore',
      sourceFormat: 'classroom-v20-backup-v1',
      databaseSchemaVersion: 10,
      recordCount: 0,
      payloadJson: '{}',
      createdAt: firstTime,
    });
    const service = new BackupRecoveryService(database, {
      createId: () => 'manual-backup',
      now: () => firstTime,
    });

    const envelope = await service.createBackup();

    expect(envelope.tables.tasks).toEqual([task('current-task', 'Current task')]);
    expect(envelope.tables.assessmentEvidence).toHaveLength(1);
    expect(envelope.tables.importRuns).toHaveLength(1);
    expect(envelope.tables.libraryItems[0]).toMatchObject({
      id: 'current-activity',
      typedFields: { materials: 'Picture cards', notes: 'Preparation\nSort cards.' },
    });
    expect(envelope.tables.categoryValues).toHaveLength(1);
    expect(envelope.tables.categoryAssignments).toHaveLength(1);
    expect(envelope.tables.classificationMappingPresets).toHaveLength(1);
    expect(envelope.tables).not.toHaveProperty('backupSnapshots');
    expect(envelope.tableCounts.tasks).toBe(1);
  });

  it('creates a safety backup, replaces data atomically, and preserves quarantine evidence', async () => {
    await database.tasks.put(task('old-task', 'Before restore'));
    const incoming = emptyBackupTables();
    incoming.tasks.push(task('new-task', 'After restore'));
    incoming.assessmentEvidence.push({
      id: 'restored-evidence',
      studentId: 'student-2',
      schoolYearId: 'year-2',
      occurredOn: '2026-07-28',
      title: 'Restored evidence',
      kind: 'score',
      score: { label: 'Meets' },
      standardIds: [],
      status: 'active',
      createdAt: firstTime,
      updatedAt: firstTime,
    });
    incoming.importRuns.push({
      id: 'restored-import-run',
      importType: 'resources',
      sourceKind: 'json',
      sourceLabel: 'resources.json',
      totalRows: 1,
      createdCount: 1,
      updatedCount: 0,
      skippedCount: 0,
      reviewCount: 0,
      blockedCount: 0,
      committedAt: firstTime,
    });
    incoming.categoryValues.push({
      id: 'restored-subject',
      familyId: 'subject',
      name: 'English Language Arts',
      normalizedName: 'english language arts',
      aliases: [],
      normalizedAliases: [],
      sortOrder: 0,
      isDefault: false,
      lifecycleState: 'active',
      createdAt: firstTime,
      updatedAt: firstTime,
    });
    incoming.classificationMappingPresets.push({
      id: 'restored-mapping',
      familyId: 'subject',
      sourceText: 'ELA',
      normalizedSourceText: 'ela',
      targetCategoryValueId: 'restored-subject',
      status: 'active',
      createdAt: firstTime,
      updatedAt: firstTime,
    });
    const preview = buildRestorePreview(
      serializeBackupEnvelope(
        createBackupEnvelope(incoming, { backupId: 'incoming-backup', exportedAt: firstTime }),
      ),
    );
    preview.quarantined.push({
      tableName: 'futureWidgets',
      recordKey: 'future-1',
      reason: 'Unknown future table.',
      rawJson: '{"id":"future-1"}',
    });
    preview.quarantineCount = 1;
    const ids = ['safety-backup', 'snapshot-1', 'run-1', 'quarantine-1'];
    const times = [firstTime, secondTime];
    const service = new BackupRecoveryService(database, {
      createId: () => ids.shift() ?? crypto.randomUUID(),
      now: () => times.shift() ?? secondTime,
    });

    const result = await service.restore(preview);

    expect(await database.tasks.toArray()).toEqual([task('new-task', 'After restore')]);
    expect(await database.assessmentEvidence.get('restored-evidence')).toBeDefined();
    expect(await database.importRuns.get('restored-import-run')).toBeDefined();
    expect(await database.classificationMappingPresets.get('restored-mapping')).toBeDefined();
    expect(await database.backupSnapshots.count()).toBe(1);
    expect(await database.restoreRuns.count()).toBe(1);
    expect(await database.restoreQuarantineRecords.count()).toBe(1);
    expect(result.safetySnapshot.id).toBe('snapshot-1');
    const safetyPreview = buildRestorePreview(result.safetySnapshot.payloadJson);
    expect(safetyPreview.validTables.tasks).toEqual([task('old-task', 'Before restore')]);
    expect(safetyPreview.validTables.assessmentEvidence).toEqual([]);
    expect(safetyPreview.validTables.importRuns).toEqual([]);
    expect(safetyPreview.validTables.classificationMappingPresets).toEqual([]);
  });

  it('rolls back the safety snapshot and every table change if restore writing fails', async () => {
    await database.tasks.put(task('old-task', 'Before failed restore'));
    await database.importRuns.put({
      id: 'old-import-run',
      importType: 'activities',
      sourceKind: 'csv',
      totalRows: 1,
      createdCount: 1,
      updatedCount: 0,
      skippedCount: 0,
      reviewCount: 0,
      blockedCount: 0,
      committedAt: firstTime,
    });
    const incoming = emptyBackupTables();
    incoming.tasks.push(task('new-task', 'Should not persist'));
    const preview = buildRestorePreview(
      serializeBackupEnvelope(
        createBackupEnvelope(incoming, { backupId: 'failing-backup', exportedAt: firstTime }),
      ),
    );
    const service = new BackupRecoveryService(database, {
      createId: () => crypto.randomUUID(),
      now: () => firstTime,
    });
    database.tasks.hook('creating', () => {
      throw new Error('Synthetic write failure');
    });

    await expect(service.restore(preview)).rejects.toThrow(/Synthetic write failure/);

    expect(await database.tasks.toArray()).toEqual([task('old-task', 'Before failed restore')]);
    expect(await database.importRuns.get('old-import-run')).toBeDefined();
    expect(await database.backupSnapshots.count()).toBe(0);
    expect(await database.restoreRuns.count()).toBe(0);
    expect(await database.restoreQuarantineRecords.count()).toBe(0);
  });

  it('exports imported Resource metadata and Resource Format relationships', async () => {
    await database.libraryItems.put({
      id: 'resource-exported',
      catalogType: 'resource',
      title: 'Metadata-only Resource',
      tags: [],
      typedFields: {
        catalogType: 'resource',
        sourceLocation: 'Shared Drive / Demo / deck.pptx',
        usageNotes: 'File contents stored by Classroom: No',
      },
      externalSource: 'district resource catalog',
      externalKey: 'RES-2',
      importIdentityKey: 'resource\u0000district resource catalog\u0000res-2',
      lastImportRunId: 'resource-run-exported',
      status: 'active',
      createdAt: firstTime,
      updatedAt: firstTime,
    });
    await database.categoryValues.put({
      id: 'format-slides',
      familyId: 'resource-format',
      name: 'Slides',
      normalizedName: 'slides',
      aliases: [],
      normalizedAliases: [],
      sortOrder: 0,
      isDefault: false,
      lifecycleState: 'active',
      createdAt: firstTime,
      updatedAt: firstTime,
    });
    await database.categoryAssignments.put({
      id: 'resource-format-assignment',
      familyId: 'resource-format',
      categoryValueId: 'format-slides',
      entityType: 'library-item',
      entityId: 'resource-exported',
      createdAt: firstTime,
    });
    await database.importRuns.put({
      id: 'resource-run-exported',
      importType: 'resources',
      sourceKind: 'file-metadata',
      sourceLabel: 'One local file metadata row',
      worksheetName: 'File Metadata',
      totalRows: 1,
      createdCount: 1,
      updatedCount: 0,
      skippedCount: 0,
      reviewCount: 0,
      blockedCount: 0,
      committedAt: firstTime,
    });
    const envelope = await new BackupRecoveryService(database, {
      createId: () => 'resource-backup',
      now: () => firstTime,
    }).createBackup();
    const preview = buildRestorePreview(serializeBackupEnvelope(envelope));
    expect(preview.quarantineCount).toBe(0);
    expect(preview.validTables.libraryItems[0]).toMatchObject({
      id: 'resource-exported',
      typedFields: { sourceLocation: 'Shared Drive / Demo / deck.pptx' },
    });
    expect(preview.validTables.categoryAssignments[0]).toMatchObject({
      familyId: 'resource-format',
    });
    expect(preview.validTables.importRuns[0]).toMatchObject({
      importType: 'resources',
      sourceKind: 'file-metadata',
    });
  });

  it('exports expanded Library classification families without a DB migration', async () => {
    await database.libraryItems.put({
      id: 'assessment-classified',
      catalogType: 'assessment',
      title: 'Classified assessment',
      tags: [],
      typedFields: {
        catalogType: 'assessment',
        assessmentKind: 'formative',
      },
      status: 'active',
      createdAt: firstTime,
      updatedAt: firstTime,
    });
    await database.categoryValues.bulkPut([
      {
        id: 'subject-mathematics',
        familyId: 'subject',
        name: 'Mathematics',
        normalizedName: 'mathematics',
        aliases: ['Math'],
        normalizedAliases: ['math'],
        sortOrder: 0,
        isDefault: false,
        lifecycleState: 'active',
        createdAt: firstTime,
        updatedAt: firstTime,
      },
      {
        id: 'language-chinese',
        familyId: 'language',
        name: 'Chinese',
        normalizedName: 'chinese',
        aliases: [],
        normalizedAliases: [],
        sortOrder: 0,
        isDefault: false,
        lifecycleState: 'active',
        createdAt: firstTime,
        updatedAt: firstTime,
      },
    ]);
    await database.categoryAssignments.bulkPut([
      {
        id: 'assessment-subject',
        familyId: 'subject',
        categoryValueId: 'subject-mathematics',
        entityType: 'library-item',
        entityId: 'assessment-classified',
        createdAt: firstTime,
      },
      {
        id: 'assessment-language',
        familyId: 'language',
        categoryValueId: 'language-chinese',
        entityType: 'library-item',
        entityId: 'assessment-classified',
        createdAt: firstTime,
      },
    ]);

    await database.classificationMappingPresets.put({
      id: 'mapping-mathematics',
      familyId: 'subject',
      sourceText: 'Math',
      normalizedSourceText: 'math',
      targetCategoryValueId: 'subject-mathematics',
      status: 'active',
      createdAt: firstTime,
      updatedAt: firstTime,
    });

    const envelope = await new BackupRecoveryService(database, {
      createId: () => 'classification-foundation-backup',
      now: () => firstTime,
    }).createBackup();
    const preview = buildRestorePreview(serializeBackupEnvelope(envelope));

    expect(envelope.databaseSchemaVersion).toBe(14);
    expect(preview.quarantineCount).toBe(0);
    expect(familyIds(preview.validTables.categoryValues)).toEqual(['language', 'subject']);
    expect(familyIds(preview.validTables.categoryAssignments)).toEqual(['language', 'subject']);
    expect(preview.validTables.classificationMappingPresets).toHaveLength(1);
  });

  it('preserves imported Assessment catalog fields and provenance', async () => {
    const assessment = {
      id: 'assessment-imported',
      catalogType: 'assessment' as const,
      title: 'Imported fictional Assessment',
      tags: ['Grade: Grade 3'],
      typedFields: {
        catalogType: 'assessment' as const,
        assessmentKind: 'formative' as const,
        studentPrompt: 'Provide a fictional response.',
        evidenceToCollect: 'A fictional explanation.',
      },
      externalSource: 'DEMO Catalog',
      externalKey: 'DEMO-ASM-1',
      importIdentityKey: 'assessment\\u0000democatalog\\u0000demoasm1',
      lastImportRunId: 'assessment-run',
      status: 'active' as const,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    };
    expect(JSON.parse(JSON.stringify(assessment))).toEqual(assessment);
  });
});

import { describe, expect, it } from 'vitest';

import {
  buildRestorePreview,
  createBackupEnvelope,
  emptyBackupTables,
  serializeBackupEnvelope,
  stableIntegrityHash,
  type ClassroomBackupEnvelope,
} from './backupFormat';

const now = '2026-07-27T12:00:00.000Z';

function task(id: string) {
  return {
    id,
    title: `Task ${id}`,
    status: 'active',
    order: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function resign(envelope: ClassroomBackupEnvelope): string {
  const content: Partial<ClassroomBackupEnvelope> = { ...envelope };
  delete content.integrityHash;
  return serializeBackupEnvelope({
    ...envelope,
    integrityHash: stableIntegrityHash(content),
  });
}

describe('Classroom backup format', () => {
  it('creates and validates a complete versioned backup envelope', () => {
    const tables = emptyBackupTables();
    tables.tasks.push(task('task-1'));
    const envelope = createBackupEnvelope(tables, {
      backupId: 'backup-1',
      exportedAt: now,
    });

    const preview = buildRestorePreview(serializeBackupEnvelope(envelope));

    expect(preview.backupId).toBe('backup-1');
    expect(preview.validRecordCount).toBe(1);
    expect(preview.quarantineCount).toBe(0);
    expect(preview.validTables.tasks).toEqual([task('task-1')]);
    expect(preview.tableSummaries).toHaveLength(29);
  });

  it('restores a schema v10 backup with the new Student and roster tables empty', () => {
    const current = createBackupEnvelope(emptyBackupTables(), {
      backupId: 'legacy-backup',
      exportedAt: now,
    });
    const legacyTables = { ...current.tables } as Record<string, unknown[]>;
    const legacyCounts = { ...current.tableCounts } as Record<string, number>;
    delete legacyTables.studentRecords;
    delete legacyTables.rosterMemberships;
    delete legacyTables.assessmentEvidence;
    delete legacyTables.importRuns;
    delete legacyCounts.studentRecords;
    delete legacyCounts.rosterMemberships;
    delete legacyCounts.assessmentEvidence;
    delete legacyCounts.importRuns;
    const legacyEnvelope = {
      ...current,
      databaseSchemaVersion: 10,
      tables: legacyTables,
      tableCounts: legacyCounts,
    } as unknown as ClassroomBackupEnvelope;

    const preview = buildRestorePreview(resign(legacyEnvelope));

    expect(preview.validTables.studentRecords).toEqual([]);
    expect(preview.validTables.rosterMemberships).toEqual([]);
    expect(preview.validTables.assessmentEvidence).toEqual([]);
    expect(preview.validTables.importRuns).toEqual([]);
    expect(preview.warnings.join(' ')).toMatch(/predates independent Student/);
  });

  it('restores a schema v11 backup with Assessment Evidence empty', () => {
    const current = createBackupEnvelope(emptyBackupTables(), {
      backupId: 'legacy-v11-backup',
      exportedAt: now,
    });
    const legacyTables = { ...current.tables } as Record<string, unknown[]>;
    const legacyCounts = { ...current.tableCounts } as Record<string, number>;
    delete legacyTables.assessmentEvidence;
    delete legacyTables.importRuns;
    delete legacyCounts.assessmentEvidence;
    delete legacyCounts.importRuns;
    const legacyEnvelope = {
      ...current,
      databaseSchemaVersion: 11,
      tables: legacyTables,
      tableCounts: legacyCounts,
    } as unknown as ClassroomBackupEnvelope;

    const preview = buildRestorePreview(resign(legacyEnvelope));

    expect(preview.validTables.assessmentEvidence).toEqual([]);
    expect(preview.validTables.importRuns).toEqual([]);
    expect(preview.warnings.join(' ')).toMatch(/predates Assessment Evidence/);
  });

  it('restores a schema v12 backup with canonical Import Center history empty', () => {
    const current = createBackupEnvelope(emptyBackupTables(), {
      backupId: 'legacy-v12-backup',
      exportedAt: now,
    });
    const legacyTables = { ...current.tables } as Record<string, unknown[]>;
    const legacyCounts = { ...current.tableCounts } as Record<string, number>;
    delete legacyTables.importRuns;
    delete legacyCounts.importRuns;
    const legacyEnvelope = {
      ...current,
      databaseSchemaVersion: 12,
      tables: legacyTables,
      tableCounts: legacyCounts,
    } as unknown as ClassroomBackupEnvelope;

    const preview = buildRestorePreview(resign(legacyEnvelope));

    expect(preview.validTables.importRuns).toEqual([]);
    expect(preview.warnings.join(' ')).toMatch(/predates canonical Import Center history/);
  });

  it('validates canonical Import Center history records', () => {
    const tables = emptyBackupTables();
    tables.importRuns.push({
      id: 'import-run-1',
      importType: 'activities',
      sourceKind: 'json',
      sourceLabel: 'activities.json',
      totalRows: 2,
      createdCount: 2,
      updatedCount: 0,
      skippedCount: 0,
      reviewCount: 0,
      blockedCount: 0,
      committedAt: now,
    });

    const preview = buildRestorePreview(
      serializeBackupEnvelope(
        createBackupEnvelope(tables, { backupId: 'import-history-backup', exportedAt: now }),
      ),
    );

    expect(preview.quarantineCount).toBe(0);
    expect(preview.validTables.importRuns).toHaveLength(1);
  });

  it('round-trips imported Activities, text-only workflow fields, controlled labels, and import metadata on DB v13', () => {
    const tables = emptyBackupTables();
    tables.libraryItems.push({
      id: 'activity-imported',
      catalogType: 'activity',
      title: 'Partner retell',
      description: 'Retell a short story with a partner.',
      tags: ['Speaking'],
      typedFields: {
        catalogType: 'activity',
        grouping: 'partners',
        estimatedMinutes: 15,
        directions: 'Partners retell the events in order.',
        materials: 'Picture cards; timer',
        notes: 'Preparation\nSort the cards before the lesson.',
      },
      externalSource: 'district activity catalog',
      externalKey: 'ACT-101',
      sourceReference: 'Grade 3 activity guide, page 8',
      importIdentityKey: 'activity\u0000district activity catalog\u0000act-101',
      lastImportRunId: 'activity-run-1',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    tables.categoryValues.push({
      id: 'purpose-oral-language',
      familyId: 'purpose-tag',
      name: 'Oral language',
      normalizedName: 'oral language',
      aliases: [],
      normalizedAliases: [],
      sortOrder: 0,
      isDefault: false,
      lifecycleState: 'active',
      createdAt: now,
      updatedAt: now,
    });
    tables.categoryAssignments.push({
      id: 'activity-purpose-assignment',
      familyId: 'purpose-tag',
      categoryValueId: 'purpose-oral-language',
      entityType: 'library-item',
      entityId: 'activity-imported',
      createdAt: now,
    });
    tables.importRuns.push({
      id: 'activity-run-1',
      importType: 'activities',
      sourceKind: 'xlsx',
      sourceLabel: 'activities.xlsx',
      worksheetName: 'Activities',
      totalRows: 1,
      createdCount: 1,
      updatedCount: 0,
      skippedCount: 0,
      reviewCount: 0,
      blockedCount: 0,
      committedAt: now,
    });

    const preview = buildRestorePreview(
      serializeBackupEnvelope(
        createBackupEnvelope(tables, { backupId: 'activity-import-backup', exportedAt: now }),
      ),
    );

    expect(preview.quarantineCount).toBe(0);
    expect(preview.validTables.libraryItems[0]).toMatchObject({
      id: 'activity-imported',
      typedFields: {
        materials: 'Picture cards; timer',
        notes: 'Preparation\nSort the cards before the lesson.',
      },
      lastImportRunId: 'activity-run-1',
    });
    expect(preview.validTables.categoryValues).toHaveLength(1);
    expect(preview.validTables.categoryAssignments).toHaveLength(1);
    expect(preview.validTables.importRuns).toHaveLength(1);
  });

  it('validates Assessment Evidence while allowing historical optional source IDs', () => {
    const tables = emptyBackupTables();
    tables.assessmentEvidence.push({
      id: 'evidence-1',
      studentId: 'student-1',
      schoolYearId: 'year-1',
      occurredOn: '2026-07-28',
      title: 'Historical observation',
      kind: 'observation',
      observation: { text: 'Read independently.' },
      contextId: 'deleted-context',
      lessonPlanId: 'deleted-plan',
      standardIds: ['deleted-standard'],
      sourceSnapshots: {
        context: { kind: 'class', name: 'Grade 3' },
        lessonPlan: { title: 'Reading workshop' },
        standards: [
          {
            standardId: 'deleted-standard',
            code: 'RL.3.1',
            statement: 'Ask and answer questions.',
          },
        ],
      },
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });

    const preview = buildRestorePreview(
      serializeBackupEnvelope(
        createBackupEnvelope(tables, { backupId: 'evidence-backup', exportedAt: now }),
      ),
    );

    expect(preview.quarantineCount).toBe(0);
    expect(preview.validTables.assessmentEvidence).toHaveLength(1);
  });

  it('rejects a backup whose content no longer matches its integrity hash', () => {
    const envelope = createBackupEnvelope(emptyBackupTables(), {
      backupId: 'backup-integrity',
      exportedAt: now,
    });
    const tampered = serializeBackupEnvelope({
      ...envelope,
      appVersion: 'modified-after-export',
    });

    expect(() => buildRestorePreview(tampered)).toThrow(/integrity check failed/i);
  });

  it('isolates unknown, invalid, and duplicate records without writing them to active tables', () => {
    const tables = emptyBackupTables();
    tables.tasks.push(task('task-valid'), task('task-valid'), {
      id: 'task-invalid',
      status: 'active',
    });
    const base = createBackupEnvelope(tables, {
      backupId: 'backup-quarantine',
      exportedAt: now,
    });
    const envelope = {
      ...base,
      tables: {
        ...base.tables,
        futureWidgets: [{ id: 'future-1', content: 'Preserve me' }],
      },
    } as unknown as ClassroomBackupEnvelope;

    const preview = buildRestorePreview(resign(envelope));

    expect(preview.validTables.tasks).toEqual([task('task-valid')]);
    expect(preview.quarantineCount).toBe(3);
    expect(preview.quarantined.map((item) => item.tableName)).toEqual([
      'futureWidgets',
      'tasks',
      'tasks',
    ]);
  });

  it('round-trips imported Resource metadata, provenance, format assignment, and import run', () => {
    const tables = emptyBackupTables();
    tables.libraryItems.push({
      id: 'resource-imported',
      catalogType: 'resource',
      title: 'Imported Resource',
      tags: ['Unit: Demo'],
      typedFields: {
        catalogType: 'resource',
        sourceLocation: 'https://example.invalid/resource',
        usageNotes: 'Usage notes\nMetadata only.',
      },
      externalSource: 'district resource catalog',
      externalKey: 'RES-1',
      sourceReference: 'Fictional guide p. 2',
      importIdentityKey: 'resource\u0000district resource catalog\u0000res-1',
      lastImportRunId: 'resource-run-1',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    tables.categoryValues.push({
      id: 'format-url',
      familyId: 'resource-format',
      name: 'URL',
      normalizedName: 'url',
      aliases: [],
      normalizedAliases: [],
      sortOrder: 0,
      isDefault: false,
      lifecycleState: 'active',
      createdAt: now,
      updatedAt: now,
    });
    tables.categoryAssignments.push({
      id: 'format-assignment',
      familyId: 'resource-format',
      categoryValueId: 'format-url',
      entityType: 'library-item',
      entityId: 'resource-imported',
      createdAt: now,
    });
    tables.importRuns.push({
      id: 'resource-run-1',
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
      committedAt: now,
    });
    const preview = buildRestorePreview(
      serializeBackupEnvelope(
        createBackupEnvelope(tables, { backupId: 'resource-backup', exportedAt: now }),
      ),
    );
    expect(preview.quarantineCount).toBe(0);
    expect(preview.validTables.libraryItems[0]).toMatchObject({
      id: 'resource-imported',
      typedFields: { sourceLocation: 'https://example.invalid/resource' },
      lastImportRunId: 'resource-run-1',
    });
    expect(preview.validTables.categoryValues).toHaveLength(1);
    expect(preview.validTables.categoryAssignments).toHaveLength(1);
    expect(preview.validTables.importRuns).toHaveLength(1);
  });
});

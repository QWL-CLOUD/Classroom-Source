import { describe, expect, it } from 'vitest';

import packageMetadata from '../../../package.json';

import {
  buildRestorePreview,
  CLASSROOM_APP_VERSION,
  createBackupEnvelope,
  emptyBackupTables,
  serializeBackupEnvelope,
  stableIntegrityHash,
  type ClassroomBackupEnvelope,
} from './backupFormat';

const now = '2026-07-27T12:00:00.000Z';

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

function reflection(id: string, sessionOccurrenceId = 'session-1') {
  return {
    id,
    sessionOccurrenceId,
    schoolYearId: 'year-1',
    contextId: 'class-1',
    lessonPlanId: 'lesson-1',
    occurredOn: '2026-08-05',
    whatWorked: 'Students explained the strategy clearly.',
    sourceSnapshots: {
      context: { kind: 'class' as const, name: 'Grade 3' },
      lessonPlan: { title: 'Equivalent fractions' },
      sessionOccurrence: {
        date: '2026-08-05',
        startMinute: 600,
        endMinute: 645,
      },
    },
    status: 'active' as const,
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
  it('derives the exported app version from package metadata', () => {
    expect(CLASSROOM_APP_VERSION).toBe(packageMetadata.version);
    expect(
      createBackupEnvelope(emptyBackupTables(), { backupId: 'version', exportedAt: now })
        .appVersion,
    ).toBe(packageMetadata.version);
  });

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
    expect(preview.tableSummaries).toHaveLength(33);
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
    delete legacyTables.classificationMappingPresets;
    delete legacyCounts.studentRecords;
    delete legacyCounts.rosterMemberships;
    delete legacyCounts.assessmentEvidence;
    delete legacyCounts.importRuns;
    delete legacyCounts.classificationMappingPresets;
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
    expect(preview.validTables.classificationMappingPresets).toEqual([]);
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
    delete legacyTables.classificationMappingPresets;
    delete legacyCounts.assessmentEvidence;
    delete legacyCounts.importRuns;
    delete legacyCounts.classificationMappingPresets;
    const legacyEnvelope = {
      ...current,
      databaseSchemaVersion: 11,
      tables: legacyTables,
      tableCounts: legacyCounts,
    } as unknown as ClassroomBackupEnvelope;

    const preview = buildRestorePreview(resign(legacyEnvelope));

    expect(preview.validTables.assessmentEvidence).toEqual([]);
    expect(preview.validTables.importRuns).toEqual([]);
    expect(preview.validTables.classificationMappingPresets).toEqual([]);
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
    delete legacyTables.classificationMappingPresets;
    delete legacyCounts.importRuns;
    delete legacyCounts.classificationMappingPresets;
    const legacyEnvelope = {
      ...current,
      databaseSchemaVersion: 12,
      tables: legacyTables,
      tableCounts: legacyCounts,
    } as unknown as ClassroomBackupEnvelope;

    const preview = buildRestorePreview(resign(legacyEnvelope));

    expect(preview.validTables.importRuns).toEqual([]);
    expect(preview.validTables.classificationMappingPresets).toEqual([]);
    expect(preview.warnings.join(' ')).toMatch(/predates canonical Import Center history/);
  });

  it('restores a schema v13 backup with classification mappings empty', () => {
    const current = createBackupEnvelope(emptyBackupTables(), {
      backupId: 'legacy-v13-backup',
      exportedAt: now,
    });
    const legacyTables = { ...current.tables } as Record<string, unknown[]>;
    const legacyCounts = { ...current.tableCounts } as Record<string, number>;
    delete legacyTables.classificationMappingPresets;
    delete legacyCounts.classificationMappingPresets;
    const legacyEnvelope = {
      ...current,
      databaseSchemaVersion: 13,
      tables: legacyTables,
      tableCounts: legacyCounts,
    } as unknown as ClassroomBackupEnvelope;

    const preview = buildRestorePreview(resign(legacyEnvelope));

    expect(preview.validTables.classificationMappingPresets).toEqual([]);
    expect(preview.warnings.join(' ')).toMatch(/predates classification mapping presets/);
  });

  it('restores a schema v14 backup without guessing Calendar Event ownership', () => {
    const tables = emptyBackupTables();
    tables.calendarEvents.push({
      id: 'legacy-calendar-event',
      title: 'Legacy holiday',
      startDate: '2026-12-24',
      category: 'Holiday',
      source: 'user',
    });
    const current = createBackupEnvelope(tables, {
      backupId: 'legacy-v14-backup',
      exportedAt: now,
    });
    const legacyEnvelope = {
      ...current,
      databaseSchemaVersion: 14,
    } as ClassroomBackupEnvelope;

    const preview = buildRestorePreview(resign(legacyEnvelope));

    expect(preview.validTables.calendarEvents).toEqual([
      expect.objectContaining({ id: 'legacy-calendar-event' }),
    ]);
    expect(preview.validTables.calendarEvents[0]).not.toHaveProperty('schoolYearId');
    expect(preview.validTables.calendarEvents[0]).not.toHaveProperty('importIdentityKey');
    expect(preview.warnings.join(' ')).toMatch(/without guessed ownership or provenance/);
  });

  it('restores a schema v16 backup with Teaching Reflections empty', () => {
    const current = createBackupEnvelope(emptyBackupTables(), {
      backupId: 'legacy-v16-backup',
      exportedAt: now,
    });
    const legacyTables = { ...current.tables } as Record<string, unknown[]>;
    const legacyCounts = { ...current.tableCounts } as Record<string, number>;
    delete legacyTables.teachingReflections;
    delete legacyCounts.teachingReflections;
    const legacyEnvelope = {
      ...current,
      databaseSchemaVersion: 16,
      tables: legacyTables,
      tableCounts: legacyCounts,
    } as unknown as ClassroomBackupEnvelope;

    const preview = buildRestorePreview(resign(legacyEnvelope));

    expect(preview.databaseSchemaVersion).toBe(17);
    expect(preview.validTables.teachingReflections).toEqual([]);
    expect(preview.warnings.join(' ')).toMatch(/predates Teaching Reflections/);
  });

  it('restores a schema v15 backup with recurrence ownership tables empty', () => {
    const current = createBackupEnvelope(emptyBackupTables(), {
      backupId: 'legacy-v15-backup',
      exportedAt: now,
    });
    const legacyTables = { ...current.tables } as Record<string, unknown[]>;
    const legacyCounts = { ...current.tableCounts } as Record<string, number>;
    delete legacyTables.calendarEventImportSeries;
    delete legacyTables.calendarEventImportOccurrences;
    delete legacyCounts.calendarEventImportSeries;
    delete legacyCounts.calendarEventImportOccurrences;
    const legacyEnvelope = {
      ...current,
      databaseSchemaVersion: 15,
      tables: legacyTables,
      tableCounts: legacyCounts,
    } as unknown as ClassroomBackupEnvelope;

    const preview = buildRestorePreview(resign(legacyEnvelope));

    expect(preview.validTables.calendarEventImportSeries).toEqual([]);
    expect(preview.validTables.calendarEventImportOccurrences).toEqual([]);
    expect(preview.warnings.join(' ')).toMatch(/predates ICS recurrence ownership/);
  });

  it('round-trips Calendar recurrence ownership, canonical type assignment, and import provenance on DB v17', () => {
    const tables = emptyBackupTables();
    tables.schoolYears.push({
      id: 'year-1',
      label: '2026–2027',
      startsOn: '2026-08-24',
      endsOn: '2027-06-14',
      active: true,
      lifecycleState: 'active',
    });
    tables.calendarEvents.push({
      id: 'calendar-event-1',
      title: 'PD Day',
      startDate: '2026-08-28',
      schoolYearId: 'year-1',
      category: 'Professional Development',
      location: 'Main campus',
      timeZone: 'America/New_York',
      externalSource: 'district calendar',
      externalKey: 'pd-2026-08-28',
      importIdentityKey: 'calendar-event\u0000district calendar\u0000pd-2026-08-28',
      lastImportRunId: 'calendar-import-1',
    });
    tables.categoryValues.push({
      id: 'event-type-pd',
      familyId: 'calendar-event-type',
      name: 'Professional Development',
      normalizedName: 'professional development',
      aliases: ['PD'],
      normalizedAliases: ['pd'],
      sortOrder: 0,
      isDefault: false,
      lifecycleState: 'active',
      createdAt: now,
      updatedAt: now,
    });
    tables.categoryAssignments.push({
      id: 'event-type-assignment',
      familyId: 'calendar-event-type',
      categoryValueId: 'event-type-pd',
      entityType: 'calendar-event',
      entityId: 'calendar-event-1',
      createdAt: now,
    });
    tables.importRuns.push({
      id: 'calendar-import-1',
      importType: 'calendar-events',
      sourceKind: 'ics',
      sourceLabel: 'district-calendar.ics',
      schoolYearId: 'year-1',
      totalRows: 1,
      createdCount: 1,
      updatedCount: 0,
      skippedCount: 0,
      reviewCount: 0,
      blockedCount: 0,
      committedAt: now,
    });

    tables.calendarEventImportSeries.push({
      id: 'series-1',
      schoolYearId: 'year-1',
      externalSource: 'ics',
      externalKey: 'district-series@example.test',
      seriesIdentityKey:
        'calendar-event-series\u0000ics\u0000year-1\u0000district-series@example.test',
      masterFingerprint: 'fnv1a32:11111111',
      calendarTimeZoneFingerprint: 'fnv1a32:22222222',
      recurrenceEngineVersion: 'classroom-rfc5545-v1+ical.js-2.2.1',
      lastImportRunId: 'calendar-import-1',
      createdAt: now,
      updatedAt: now,
    });
    tables.calendarEventImportOccurrences.push({
      id: 'occurrence-1',
      seriesId: 'series-1',
      schoolYearId: 'year-1',
      occurrenceKey: 'date\u00002026-08-28\u0000',
      occurrenceIdentityKey:
        'calendar-event-series\u0000ics\u0000year-1\u0000district-series@example.test\u0000date\u00002026-08-28\u0000',
      sourceStatus: 'active',
      managementStatus: 'materialized',
      eventId: 'calendar-event-1',
      sourceOccurrenceFingerprint: 'fnv1a32:33333333',
      lastImportedEventFingerprint: 'fnv1a32:44444444',
      lastImportedCategoryValueId: 'event-type-pd',
      lastImportRunId: 'calendar-import-1',
      createdAt: now,
      updatedAt: now,
    });

    const envelope = createBackupEnvelope(tables, {
      backupId: 'calendar-foundation-backup',
      exportedAt: now,
    });
    const preview = buildRestorePreview(serializeBackupEnvelope(envelope));

    expect(envelope.databaseSchemaVersion).toBe(17);
    expect(preview.quarantineCount).toBe(0);
    expect(preview.validTables.calendarEvents[0]).toMatchObject({
      schoolYearId: 'year-1',
      location: 'Main campus',
      timeZone: 'America/New_York',
      lastImportRunId: 'calendar-import-1',
    });
    expect(preview.validTables.calendarEventImportSeries[0]).toMatchObject({
      id: 'series-1',
      recurrenceEngineVersion: 'classroom-rfc5545-v1+ical.js-2.2.1',
    });
    expect(preview.validTables.calendarEventImportOccurrences[0]).toMatchObject({
      id: 'occurrence-1',
      eventId: 'calendar-event-1',
      managementStatus: 'materialized',
    });
    expect(preview.validTables.categoryAssignments[0]).toMatchObject({
      familyId: 'calendar-event-type',
      entityType: 'calendar-event',
    });
    expect(preview.validTables.importRuns[0]).toMatchObject({
      importType: 'calendar-events',
      sourceKind: 'ics',
      schoolYearId: 'year-1',
    });
  });

  it('round-trips Teaching Reflections with source snapshots on DB v17', () => {
    const tables = emptyBackupTables();
    tables.teachingReflections.push(reflection('reflection-1'));

    const envelope = createBackupEnvelope(tables, {
      backupId: 'teaching-reflection-backup',
      exportedAt: now,
    });
    const preview = buildRestorePreview(serializeBackupEnvelope(envelope));

    expect(envelope.databaseSchemaVersion).toBe(17);
    expect(envelope.tableCounts.teachingReflections).toBe(1);
    expect(preview.quarantineCount).toBe(0);
    expect(preview.validTables.teachingReflections).toEqual([reflection('reflection-1')]);
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

  it('round-trips imported Activities, text-only workflow fields, controlled labels, and import metadata on DB v15', () => {
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

  it('round-trips expanded Library classification families on DB v15', () => {
    const tables = emptyBackupTables();
    tables.libraryItems.push({
      id: 'assessment-classified',
      catalogType: 'assessment',
      title: 'Classified assessment',
      tags: [],
      typedFields: {
        catalogType: 'assessment',
        assessmentKind: 'formative',
      },
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    tables.categoryValues.push(
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
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'language-level-4',
        familyId: 'language-level',
        name: 'Level 4',
        normalizedName: 'level 4',
        aliases: ['L4'],
        normalizedAliases: ['l4'],
        sortOrder: 0,
        isDefault: false,
        lifecycleState: 'active',
        createdAt: now,
        updatedAt: now,
      },
    );
    tables.categoryAssignments.push(
      {
        id: 'assessment-subject',
        familyId: 'subject',
        categoryValueId: 'subject-mathematics',
        entityType: 'library-item',
        entityId: 'assessment-classified',
        createdAt: now,
      },
      {
        id: 'assessment-language-level',
        familyId: 'language-level',
        categoryValueId: 'language-level-4',
        entityType: 'library-item',
        entityId: 'assessment-classified',
        createdAt: now,
      },
    );

    tables.classificationMappingPresets.push({
      id: 'mapping-math',
      familyId: 'subject',
      sourceText: 'Math',
      normalizedSourceText: 'math',
      targetCategoryValueId: 'subject-mathematics',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });

    const envelope = createBackupEnvelope(tables, {
      backupId: 'classification-foundation-backup',
      exportedAt: now,
    });
    const preview = buildRestorePreview(serializeBackupEnvelope(envelope));

    expect(envelope.databaseSchemaVersion).toBe(17);
    expect(preview.quarantineCount).toBe(0);
    expect(familyIds(preview.validTables.categoryValues)).toEqual(['language-level', 'subject']);
    expect(familyIds(preview.validTables.categoryAssignments)).toEqual([
      'language-level',
      'subject',
    ]);
    expect(preview.validTables.classificationMappingPresets).toHaveLength(1);
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

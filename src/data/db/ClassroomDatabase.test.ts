import 'fake-indexeddb/auto';

import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from './ClassroomDatabase';

const names: string[] = [];

afterEach(async () => {
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)));
});

describe('ClassroomDatabase schema upgrades', () => {
  it('upgrades legacy data to schema v14 and adds Student, roster, Assessment Evidence, and Import Center stores without losing Tasks', async () => {
    const name = `classroom-v20-upgrade-${crypto.randomUUID()}`;
    names.push(name);
    const legacy = new Dexie(name);
    legacy.version(1).stores({
      tasks: 'id, status, dueDate, contextId, order, updatedAt',
    });
    await legacy.open();
    await legacy.table('tasks').put({
      id: 'legacy-task',
      title: 'Legacy task',
      status: 'active',
      order: 0,
      createdAt: '2026-07-18T12:00:00.000Z',
      updatedAt: '2026-07-18T12:00:00.000Z',
    });
    legacy.close();

    const upgraded = new ClassroomDatabase(name);
    await upgraded.open();

    expect(upgraded.verno).toBe(14);
    expect(await upgraded.tasks.get('legacy-task')).toBeDefined();
    await upgraded.learnerContexts.put({
      id: 'class-1',
      kind: 'class',
      name: 'Grade 3',
      schoolYearId: 'year-1',
      status: 'active',
    });
    await upgraded.studentRecords.put({
      id: 'student-1',
      name: 'Synthetic student',
      status: 'active',
      createdAt: '2026-07-27T12:00:00.000Z',
      updatedAt: '2026-07-27T12:00:00.000Z',
    });
    await upgraded.rosterMemberships.put({
      id: 'roster-1',
      contextId: 'class-1',
      studentId: 'student-1',
      createdAt: '2026-07-27T12:00:00.000Z',
    });
    expect(await upgraded.studentRecords.count()).toBe(1);
    expect(await upgraded.rosterMemberships.count()).toBe(1);
    await upgraded.assessmentEvidence.put({
      id: 'evidence-1',
      studentId: 'student-1',
      schoolYearId: 'year-1',
      occurredOn: '2026-07-28',
      title: 'Synthetic evidence',
      kind: 'score',
      score: { value: 4, maximum: 5 },
      standardIds: [],
      status: 'active',
      createdAt: '2026-07-28T12:00:00.000Z',
      updatedAt: '2026-07-28T12:00:00.000Z',
    });
    expect(await upgraded.assessmentEvidence.count()).toBe(1);
    await upgraded.reminders.put({
      id: 'reminder-1',
      sourceType: 'task',
      sourceId: 'legacy-task',
      remindDate: '2026-07-20',
      remindMinute: 540,
      status: 'active',
      createdAt: '2026-07-18T12:00:00.000Z',
      updatedAt: '2026-07-18T12:00:00.000Z',
    });
    expect(await upgraded.reminders.count()).toBe(1);
    await upgraded.learnerNotices.put({
      id: 'notice-1',
      contextId: 'context-1',
      kind: 'ongoing-support',
      title: 'Synthetic support',
      status: 'active',
      createdAt: '2026-07-18T12:00:00.000Z',
      updatedAt: '2026-07-18T12:00:00.000Z',
    });
    expect(await upgraded.learnerNotices.count()).toBe(1);
    await upgraded.categoryValues.put({
      id: 'purpose-reading',
      familyId: 'purpose-tag',
      name: 'Reading',
      normalizedName: 'reading',
      aliases: [],
      normalizedAliases: [],
      sortOrder: 0,
      isDefault: false,
      lifecycleState: 'active',
      createdAt: '2026-07-21T12:00:00.000Z',
      updatedAt: '2026-07-21T12:00:00.000Z',
    });
    expect(await upgraded.categoryValues.count()).toBe(1);
    expect(await upgraded.categoryAssignments.count()).toBe(0);
    await upgraded.classificationMappingPresets.put({
      id: 'mapping-literacy',
      familyId: 'purpose-tag',
      sourceText: 'Literacy',
      normalizedSourceText: 'literacy',
      targetCategoryValueId: 'purpose-reading',
      status: 'active',
      createdAt: '2026-08-03T12:00:00.000Z',
      updatedAt: '2026-08-03T12:00:00.000Z',
    });
    expect(await upgraded.classificationMappingPresets.count()).toBe(1);

    await upgraded.learnerServiceOccurrences.put({
      id: 'notice-1:2026-07-21',
      learnerNoticeId: 'notice-1',
      date: '2026-07-21',
      status: 'cancelled',
      createdAt: '2026-07-21T12:00:00.000Z',
      updatedAt: '2026-07-21T12:00:00.000Z',
      cancelledAt: '2026-07-21T12:00:00.000Z',
    });
    expect(await upgraded.learnerServiceOccurrences.count()).toBe(1);

    await upgraded.libraryItems.put({
      id: 'library-resource-1',
      catalogType: 'resource',
      title: 'Synthetic resource',
      tags: ['Reading'],
      status: 'active',
      createdAt: '2026-07-23T12:00:00.000Z',
      updatedAt: '2026-07-23T12:00:00.000Z',
    });
    expect(await upgraded.libraryItems.count()).toBe(1);
    await upgraded.importRuns.put({
      id: 'import-run-1',
      importType: 'resources',
      sourceKind: 'csv',
      sourceLabel: 'resources.csv',
      totalRows: 1,
      createdCount: 1,
      updatedCount: 0,
      skippedCount: 0,
      reviewCount: 0,
      blockedCount: 0,
      committedAt: '2026-07-29T12:00:00.000Z',
    });
    expect(await upgraded.importRuns.count()).toBe(1);
    await upgraded.libraryItems.update('library-resource-1', {
      externalSource: 'district catalog',
      externalKey: 'resource-1',
      importIdentityKey: 'resource\u0000district catalog\u0000resource-1',
      lastImportRunId: 'import-run-1',
    });
    expect(
      await upgraded.libraryItems
        .where('importIdentityKey')
        .equals('resource\u0000district catalog\u0000resource-1')
        .count(),
    ).toBe(1);

    await upgraded.lessonTemplates.put({
      id: 'template-1',
      title: 'Synthetic template',
      lessonFlow: [],
      status: 'active',
      createdAt: '2026-07-23T12:00:00.000Z',
      updatedAt: '2026-07-23T12:00:00.000Z',
    });
    expect(await upgraded.lessonTemplates.count()).toBe(1);

    await upgraded.standards.put({
      id: 'standard-1',
      issuingOrganization: 'Synthetic organization',
      frameworkTitle: 'Synthetic framework',
      frameworkKey: 'synthetic organization|synthetic framework||2026',
      version: '2026',
      code: 'S.1',
      normalizedCode: 's.1',
      statement: 'Synthetic Standard statement.',
      sortOrder: 0,
      status: 'active',
      createdAt: '2026-07-24T00:00:00.000Z',
      updatedAt: '2026-07-24T00:00:00.000Z',
    });
    await upgraded.standardAlignments.put({
      id: 'alignment-1',
      standardId: 'standard-1',
      targetType: 'lesson-template',
      targetId: 'template-1',
      scopeKey: 'lesson-template:template-1:root',
      createdAt: '2026-07-24T00:00:00.000Z',
    });
    expect(await upgraded.standards.count()).toBe(1);
    expect(await upgraded.standardAlignments.count()).toBe(1);

    await upgraded.standardImportBatches.put({
      id: 'batch-1',
      sourceName: 'Synthetic standards source',
      issuingOrganization: 'Synthetic organization',
      frameworkTitle: 'Synthetic framework',
      version: '2026',
      worksheetName: 'Standards',
      fileKind: 'xlsx',
      totalRows: 1,
      createdCount: 1,
      updatedCount: 0,
      duplicateCount: 0,
      createdAt: '2026-07-24T00:00:00.000Z',
    });
    expect(await upgraded.standardImportBatches.count()).toBe(1);

    await upgraded.backupSnapshots.put({
      id: 'snapshot-1',
      kind: 'pre-restore',
      sourceFormat: 'classroom-v20-backup-v1',
      databaseSchemaVersion: 11,
      recordCount: 1,
      payloadJson: '{}',
      createdAt: '2026-07-27T12:00:00.000Z',
    });
    await upgraded.restoreRuns.put({
      id: 'restore-1',
      sourceFormat: 'classroom-v20-backup-v1',
      sourceAppVersion: '20.0.0-alpha.0',
      sourceBackupId: 'backup-1',
      startedAt: '2026-07-27T12:00:00.000Z',
      completedAt: '2026-07-27T12:00:01.000Z',
      status: 'committed',
      safetySnapshotId: 'snapshot-1',
      summaryJson: '{}',
    });
    await upgraded.restoreQuarantineRecords.put({
      id: 'restore-quarantine-1',
      restoreRunId: 'restore-1',
      tableName: 'futureTable',
      reason: 'Unknown table',
      rawJson: '{}',
      createdAt: '2026-07-27T12:00:01.000Z',
    });
    expect(await upgraded.backupSnapshots.count()).toBe(1);
    expect(await upgraded.restoreRuns.count()).toBe(1);
    expect(await upgraded.restoreQuarantineRecords.count()).toBe(1);

    upgraded.close();
  });
});

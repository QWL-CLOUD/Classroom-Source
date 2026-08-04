import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { categoryValueSchema } from '@/domain/models/entities';
import { EditHistoryService } from '@/features/editing/editHistoryService';
import { buildImportTable } from '@/features/importCenter/importTableModel';

import {
  buildAssessmentImportPreview,
  suggestAssessmentImportMapping,
} from './assessmentImportModel';
import { AssessmentImportMutationService } from './assessmentImportMutationService';

const databases: ClassroomDatabase[] = [];

afterEach(async () => {
  await Promise.all(databases.map((db) => db.delete()));
  databases.length = 0;
});

describe('AssessmentImportMutationService', () => {
  it('commits one real Assessment, leaves Evidence untouched, and globally undoes/redoes', async () => {
    const db = new ClassroomDatabase(`assessment-import-${crypto.randomUUID()}`);
    databases.push(db);
    const source = buildImportTable([
      ['External Source', 'Assessment ID', 'Title', 'Assessment Kind', 'Subject', 'Purpose'],
      ['District', 'ASM-1', 'Quick check', 'Formative', 'Mathematics', 'Exit ticket'],
    ]);
    const preview = buildAssessmentImportPreview(
      {
        table: source,
        mapping: suggestAssessmentImportMapping(source.headers),
        defaults: {},
        unmappedDecisions: {},
        duplicateDecisions: {},
        kindDecisions: {},
        classificationDecisions: {
          'subject\u0000mathematics': { action: 'create' },
          'purpose-tag\u0000exit ticket': { action: 'create' },
        },
        existingItems: [],
        categoryValues: [],
        categoryAssignments: [],
      },
      {
        createId: (() => {
          let index = 0;
          return () => `id-${++index}`;
        })(),
        now: () => '2026-08-01T00:00:00.000Z',
      },
    );
    const service = new AssessmentImportMutationService(db, {
      createId: () => 'log-1',
    });
    const result = await service.commit(preview, {
      sourceKind: 'csv',
      confirmCommit: true,
      confirmUpdates: true,
    });

    expect(result.created).toHaveLength(1);
    expect(await db.libraryItems.count()).toBe(1);
    expect(await db.categoryValues.count()).toBe(2);
    expect(await db.categoryAssignments.count()).toBe(2);
    expect(await db.importRuns.count()).toBe(1);
    expect(
      JSON.parse((await db.importRuns.get(preview.importRunId))?.summaryJson ?? '{}')
        .classificationAudit,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ familyId: 'subject', resolution: 'created' }),
        expect.objectContaining({ familyId: 'purpose-tag', resolution: 'created' }),
      ]),
    );
    expect(await db.assessmentEvidence.count()).toBe(0);

    const history = new EditHistoryService(db, {
      now: () => '2026-08-01T00:01:00.000Z',
    });
    await history.undo();
    expect(await db.libraryItems.count()).toBe(0);
    expect(await db.categoryValues.count()).toBe(0);
    expect(await db.categoryAssignments.count()).toBe(0);
    expect(await db.importRuns.count()).toBe(0);
    expect(await db.assessmentEvidence.count()).toBe(0);

    await history.redo();
    expect(await db.libraryItems.count()).toBe(1);
    expect(await db.categoryValues.count()).toBe(2);
    expect(await db.categoryAssignments.count()).toBe(2);
    expect(await db.importRuns.count()).toBe(1);
    expect(await db.assessmentEvidence.count()).toBe(0);
  });

  it('rolls back when command application fails', async () => {
    const db = new ClassroomDatabase(`assessment-import-fail-${crypto.randomUUID()}`);
    databases.push(db);
    const source = buildImportTable([
      ['Title', 'Assessment Kind'],
      ['Quick check', 'Formative'],
    ]);
    const preview = buildAssessmentImportPreview({
      table: source,
      mapping: suggestAssessmentImportMapping(source.headers),
      defaults: {},
      unmappedDecisions: {},
      duplicateDecisions: {},
      kindDecisions: {},
      existingItems: [],
    });
    const service = new AssessmentImportMutationService(db, {
      applyOperations: async () => {
        throw new Error('forced failure');
      },
    });

    await expect(
      service.commit(preview, {
        sourceKind: 'csv',
        confirmCommit: true,
        confirmUpdates: true,
      }),
    ).rejects.toThrow('forced failure');
    expect(await db.libraryItems.count()).toBe(0);
    expect(await db.categoryValues.count()).toBe(0);
    expect(await db.categoryAssignments.count()).toBe(0);
    expect(await db.importRuns.count()).toBe(0);
    expect(await db.changeLog.count()).toBe(0);
  });

  it('saves a reviewed mapping atomically with an Assessment', async () => {
    const db = new ClassroomDatabase(`assessment-import-mapping-${crypto.randomUUID()}`);
    databases.push(db);
    const now = '2026-08-01T00:00:00.000Z';
    const subject = categoryValueSchema.parse({
      id: 'subject-ela',
      familyId: 'subject',
      name: 'English Language Arts',
      normalizedName: 'english language arts',
      aliases: [],
      normalizedAliases: [],
      sortOrder: 0,
      isDefault: false,
      lifecycleState: 'active',
      createdAt: now,
      updatedAt: now,
    });
    await db.categoryValues.put(subject);
    const source = buildImportTable([
      ['Title', 'Assessment Kind', 'Subject'],
      ['Quick check', 'Formative', 'ELA'],
    ]);
    const reviewKey = 'subject\u0000ela';
    const preview = buildAssessmentImportPreview(
      {
        table: source,
        mapping: suggestAssessmentImportMapping(source.headers),
        defaults: {},
        unmappedDecisions: {},
        duplicateDecisions: {},
        kindDecisions: {},
        classificationDecisions: {
          [reviewKey]: { action: 'use', categoryValueId: subject.id },
        },
        mappingPersistenceDecisions: { [reviewKey]: 'save' },
        existingItems: [],
        categoryValues: [subject],
        categoryAssignments: [],
        mappingPresets: [],
      },
      {
        createId: (() => {
          let index = 0;
          return () => `mapping-preview-${++index}`;
        })(),
        now: () => now,
      },
    );

    const result = await new AssessmentImportMutationService(db, {
      createId: () => 'mapping-log',
    }).commit(preview, {
      sourceKind: 'csv',
      confirmCommit: true,
      confirmUpdates: false,
    });

    expect(result.createdMappingPresets).toHaveLength(1);
    expect(await db.classificationMappingPresets.count()).toBe(1);
    expect(
      JSON.parse((await db.importRuns.get(preview.importRunId))?.summaryJson ?? '{}')
        .classificationMappingAudit,
    ).toEqual([expect.objectContaining({ action: 'created', importedText: 'ELA' })]);
  });
});

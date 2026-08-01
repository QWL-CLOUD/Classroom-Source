import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
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
      ['External Source', 'Assessment ID', 'Title', 'Assessment Kind'],
      ['District', 'ASM-1', 'Quick check', 'Formative'],
    ]);
    const preview = buildAssessmentImportPreview(
      {
        table: source,
        mapping: suggestAssessmentImportMapping(source.headers),
        defaults: {},
        unmappedDecisions: {},
        duplicateDecisions: {},
        kindDecisions: {},
        existingItems: [],
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
    expect(await db.importRuns.count()).toBe(1);
    expect(await db.assessmentEvidence.count()).toBe(0);

    const history = new EditHistoryService(db, {
      now: () => '2026-08-01T00:01:00.000Z',
    });
    await history.undo();
    expect(await db.libraryItems.count()).toBe(0);
    expect(await db.importRuns.count()).toBe(0);
    expect(await db.assessmentEvidence.count()).toBe(0);

    await history.redo();
    expect(await db.libraryItems.count()).toBe(1);
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
    expect(await db.importRuns.count()).toBe(0);
    expect(await db.changeLog.count()).toBe(0);
  });
});

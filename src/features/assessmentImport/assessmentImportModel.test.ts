import { describe, expect, it } from 'vitest';

import {
  categoryValueSchema,
  classificationMappingPresetSchema,
  type LibraryCatalogItem,
} from '@/domain/models/entities';
import { buildImportTable } from '@/features/importCenter/importTableModel';

import {
  buildAssessmentImportIdentity,
  buildAssessmentImportPreview,
  createEmptyAssessmentImportMapping,
  suggestAssessmentImportMapping,
} from './assessmentImportModel';

const existing: LibraryCatalogItem = {
  id: 'assessment-existing',
  catalogType: 'assessment',
  title: 'Existing check',
  tags: [],
  typedFields: {
    catalogType: 'assessment',
    assessmentKind: 'formative',
    studentPrompt: 'Show your reasoning.',
  },
  externalSource: 'District',
  externalKey: 'ASM-1',
  importIdentityKey: buildAssessmentImportIdentity('District', 'ASM-1'),
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function table(rows: string[][]) {
  return buildImportTable(rows);
}

describe('assessmentImportModel', () => {
  it('suggests the reviewed template mappings', () => {
    const mapping = suggestAssessmentImportMapping([
      'External Source',
      'Assessment ID',
      'Title',
      'Assessment Kind',
      'Student Prompt',
    ]);
    expect(mapping.externalSource).toBe(0);
    expect(mapping.externalKey).toBe(1);
    expect(mapping.title).toBe(2);
    expect(mapping.assessmentKind).toBe(3);
    expect(mapping.studentPrompt).toBe(4);
  });

  it('requires review for an unknown Assessment Kind', () => {
    const source = table([
      ['Title', 'Assessment Kind'],
      ['Exit ticket', 'Quiz'],
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
      { createId: () => 'id-1', now: () => '2026-08-01T00:00:00.000Z' },
    );
    expect(preview.rows[0]?.classification).toBe('review');
  });

  it('resolves Assessment classification fields into canonical assignments', () => {
    const source = table([
      [
        'Title',
        'Assessment Kind',
        'Subject',
        'Grade Level',
        'Language',
        'Language Level',
        'Purpose',
        'Skill',
      ],
      [
        'Oral retell check',
        'Formative',
        'Chinese Language Arts',
        'Grade 3',
        'Chinese',
        'Intermediate',
        'Formative check',
        'Oral sequencing',
      ],
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
          'subject\u0000chinese language arts': { action: 'create' },
          'grade-level\u0000grade 3': { action: 'create' },
          'language\u0000chinese': { action: 'create' },
          'language-level\u0000intermediate': { action: 'create' },
          'purpose-tag\u0000formative check': { action: 'create' },
          'focus-tag\u0000oral sequencing': { action: 'create' },
        },
        existingItems: [],
        categoryValues: [],
        categoryAssignments: [],
      },
      {
        createId: (() => {
          let next = 0;
          return () => `id-${++next}`;
        })(),
        now: () => '2026-08-01T00:00:00.000Z',
      },
    );

    expect(preview.rows[0]?.classification).toBe('create');
    expect(preview.rows[0]?.planned?.assignmentsToCreate).toHaveLength(6);
    expect(preview.rows[0]?.planned?.item?.tags).toEqual([]);
    expect(preview.newCategoryValues.map((value) => value.familyId)).toEqual(
      expect.arrayContaining([
        'subject',
        'grade-level',
        'language',
        'language-level',
        'purpose-tag',
        'focus-tag',
      ]),
    );
  });

  it('updates only through exact external identity', () => {
    const source = table([
      ['External Source', 'Assessment ID', 'Title', 'Assessment Kind'],
      ['District', 'ASM-1', 'Updated check', 'Formative'],
    ]);
    const preview = buildAssessmentImportPreview(
      {
        table: source,
        mapping: suggestAssessmentImportMapping(source.headers),
        defaults: {},
        unmappedDecisions: {},
        duplicateDecisions: {},
        kindDecisions: {},
        existingItems: [existing],
      },
      { createId: () => 'run-1', now: () => '2026-08-01T00:00:00.000Z' },
    );
    expect(preview.rows[0]?.classification).toBe('update');
    expect(preview.rows[0]?.planned?.item?.id).toBe(existing.id);
  });

  it('skips an unchanged exact-identity Assessment', () => {
    const source = table([
      ['External Source', 'Assessment ID', 'Title', 'Assessment Kind', 'Student Prompt'],
      ['District', 'ASM-1', 'Existing check', 'Formative', 'Show your reasoning.'],
    ]);
    const preview = buildAssessmentImportPreview(
      {
        table: source,
        mapping: suggestAssessmentImportMapping(source.headers),
        defaults: {},
        unmappedDecisions: {},
        duplicateDecisions: {},
        kindDecisions: {},
        existingItems: [existing],
      },
      { createId: () => 'run-1', now: () => '2026-08-01T00:00:00.000Z' },
    );
    expect(preview.rows[0]?.classification).toBe('skip');
  });

  it('skips identical repeated rows and blocks conflicting repeated identities', () => {
    const identical = table([
      ['External Source', 'Assessment ID', 'Title', 'Assessment Kind'],
      ['District', 'ASM-2', 'Quick check', 'Formative'],
      ['District', 'ASM-2', 'Quick check', 'Formative'],
    ]);
    const identicalPreview = buildAssessmentImportPreview({
      table: identical,
      mapping: suggestAssessmentImportMapping(identical.headers),
      defaults: {},
      unmappedDecisions: {},
      duplicateDecisions: {},
      kindDecisions: {},
      existingItems: [],
    });
    expect(identicalPreview.rows.map((row) => row.classification)).toEqual(['create', 'skip']);

    const conflicting = table([
      ['External Source', 'Assessment ID', 'Title', 'Assessment Kind'],
      ['District', 'ASM-3', 'First title', 'Formative'],
      ['District', 'ASM-3', 'Second title', 'Formative'],
    ]);
    const conflictingPreview = buildAssessmentImportPreview({
      table: conflicting,
      mapping: suggestAssessmentImportMapping(conflicting.headers),
      defaults: {},
      unmappedDecisions: {},
      duplicateDecisions: {},
      kindDecisions: {},
      existingItems: [],
    });
    expect(conflictingPreview.rows.every((row) => row.classification === 'blocked')).toBe(true);
  });

  it('preserves a namespaceless legacy ID only after explicit Create review', () => {
    const source = table([
      ['Assessment ID', 'Title', 'Assessment Kind'],
      ['LEGACY-9', 'Legacy check', 'Other'],
    ]);
    const preview = buildAssessmentImportPreview({
      table: source,
      mapping: suggestAssessmentImportMapping(source.headers),
      defaults: {},
      unmappedDecisions: {},
      duplicateDecisions: { 2: { action: 'create' } },
      kindDecisions: {},
      existingItems: [],
    });
    expect(preview.rows[0]?.classification).toBe('create');
    expect(preview.rows[0]?.planned?.item?.externalKey).toBeUndefined();
    expect(preview.rows[0]?.planned?.item?.description).toContain('LEGACY-9');
  });

  it('blocks rubric criterion worksheets', () => {
    const source = table([
      ['rubric_id', 'criterion_id', 'level_4', 'Title'],
      ['R-1', 'C-1', 'Exceeds', 'Criterion'],
    ]);
    const mapping = createEmptyAssessmentImportMapping();
    mapping.title = 3;
    const preview = buildAssessmentImportPreview({
      table: source,
      mapping,
      defaults: { assessmentKind: 'other' },
      unmappedDecisions: { 0: 'ignore', 1: 'ignore', 2: 'ignore' },
      duplicateDecisions: {},
      kindDecisions: {},
      existingItems: [],
    });
    expect(preview.rows[0]?.classification).toBe('blocked');
    expect(preview.rows[0]?.reasons.join(' ')).toContain('Rubric');
  });

  it('automatically reuses a safe family-scoped mapping and identifies it visibly', () => {
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
    const mappingPreset = classificationMappingPresetSchema.parse({
      id: 'mapping-ela',
      familyId: 'subject',
      sourceText: 'ELA',
      normalizedSourceText: 'ela',
      targetCategoryValueId: subject.id,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    const source = table([
      ['Title', 'Assessment Kind', 'Subject'],
      ['Quick check', 'Formative', 'ELA'],
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
        categoryValues: [subject],
        categoryAssignments: [],
        mappingPresets: [mappingPreset],
      },
      { createId: () => 'id-1', now: () => now },
    );

    expect(preview.rows[0]?.reasons).toContain(
      'Saved import mapping: “ELA” → “English Language Arts”.',
    );
    expect(preview.classificationAudit).toEqual([
      expect.objectContaining({ resolution: 'saved-preset', mappingPresetId: 'mapping-ela' }),
    ]);
  });
});

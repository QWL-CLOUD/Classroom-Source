import { describe, expect, it } from 'vitest';

import {
  categoryValueSchema,
  libraryCatalogItemSchema,
  type CategoryAssignment,
  type CategoryValue,
  type LibraryCatalogItem,
} from '@/domain/models/entities';
import { buildImportTable } from '@/features/importCenter/importTableModel';

import {
  buildActivityImportIdentity,
  buildActivityImportPreview,
  suggestActivityImportMapping,
  type ActivityCategoryDecisions,
  type ActivityDuplicateDecisions,
  type UnmappedColumnDecisions,
} from './activityImportModel';

const timestamp = '2026-07-31T12:00:00.000Z';

function ids(prefix = 'generated') {
  let index = 0;
  return () => `${prefix}-${++index}`;
}

function item(overrides: Partial<LibraryCatalogItem> = {}): LibraryCatalogItem {
  return libraryCatalogItemSchema.parse({
    id: 'activity-existing',
    catalogType: 'activity',
    title: 'Partner retell',
    tags: [],
    typedFields: { catalogType: 'activity', grouping: 'partners' },
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  });
}

function category(overrides: Partial<CategoryValue> = {}): CategoryValue {
  return categoryValueSchema.parse({
    id: 'purpose-discussion',
    familyId: 'purpose-tag',
    name: 'Discussion',
    normalizedName: 'discussion',
    aliases: [],
    normalizedAliases: [],
    sortOrder: 0,
    isDefault: false,
    lifecycleState: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  });
}

function preview(
  rows: string[][],
  options: {
    existingItems?: LibraryCatalogItem[];
    categoryValues?: CategoryValue[];
    categoryAssignments?: CategoryAssignment[];
    defaults?: { externalSource?: string; sourceReference?: string };
    duplicateDecisions?: ActivityDuplicateDecisions;
    categoryDecisions?: ActivityCategoryDecisions;
    unmappedDecisions?: UnmappedColumnDecisions;
  } = {},
) {
  const table = buildImportTable(rows);
  const mapping = suggestActivityImportMapping(table.headers);
  return buildActivityImportPreview(
    {
      table,
      mapping,
      defaults: options.defaults ?? {},
      unmappedDecisions: options.unmappedDecisions ?? {},
      duplicateDecisions: options.duplicateDecisions ?? {},
      categoryDecisions: options.categoryDecisions ?? {},
      existingItems: options.existingItems ?? [],
      categoryValues: options.categoryValues ?? [],
      categoryAssignments: options.categoryAssignments ?? [],
    },
    { createId: ids(), now: () => timestamp },
  );
}

describe('Activity import model', () => {
  it('maps every legacy Activity field without silently discarding instructional text', () => {
    const result = preview(
      [
        [
          'activity_id',
          'title',
          'purpose',
          'subject',
          'skill',
          'grade_level',
          'language_level',
          'duration_minutes',
          'grouping',
          'preparation',
          'materials',
          'steps',
          'teacher_language',
          'differentiation',
          'variations',
          'assessment_opportunity',
          'tags',
          'source',
          'status',
        ],
        [
          'ACT-101',
          'Partner retell',
          'Practice',
          'Chinese',
          'Speaking',
          '3',
          'Intermediate',
          '12',
          'partners',
          'Prepare picture cards.',
          'Picture cards; timer',
          'Students retell in pairs.',
          '先说第一句。',
          'Provide sentence frames.',
          'Retell from another perspective.',
          'Listen for sequence words.',
          'Oral language, Unit 1',
          'Curriculum guide p. 12',
          'active',
        ],
      ],
      {
        defaults: { externalSource: 'District Activity Catalog' },
        categoryDecisions: {
          'purpose-tag\u0000practice': { action: 'create' },
          'focus-tag\u0000speaking': { action: 'create' },
        },
      },
    );

    expect(result.summary).toMatchObject({ createCount: 1, reviewCount: 0, blockedCount: 0 });
    const planned = result.rows[0]?.planned?.item;
    expect(planned).toMatchObject({
      title: 'Partner retell',
      externalSource: 'District Activity Catalog',
      externalKey: 'ACT-101',
      sourceReference: 'Curriculum guide p. 12',
      status: 'active',
      tags: [
        'Oral language',
        'Unit 1',
        'Subject: Chinese',
        'Grade: 3',
        'Language level: Intermediate',
      ],
      typedFields: {
        catalogType: 'activity',
        grouping: 'partners',
        estimatedMinutes: 12,
        materials: 'Picture cards; timer',
        directions: 'Students retell in pairs.',
      },
    });
    expect(
      planned?.typedFields?.catalogType === 'activity' ? planned.typedFields.notes : '',
    ).toContain('Teacher language\n先说第一句。');
    expect(result.newCategoryValues.map((value) => value.name)).toEqual(['Practice', 'Speaking']);
  });

  it('never turns title equality alone into an automatic update', () => {
    const result = preview(
      [
        ['title', 'duration_minutes'],
        ['Partner retell', '15'],
      ],
      { existingItems: [item()] },
    );

    expect(result.rows[0]).toMatchObject({ classification: 'review' });
    expect(result.rows[0]?.duplicateReview?.kind).toBe('probable-duplicate');
  });

  it('uses external source plus Activity ID for exact skip and update classification', () => {
    const identity = buildActivityImportIdentity('District Catalog', 'ACT-1');
    const existing = item({
      externalSource: 'District Catalog',
      externalKey: 'ACT-1',
      importIdentityKey: identity,
    });
    const same = preview(
      [
        ['activity_id', 'title', 'grouping'],
        ['ACT-1', 'Partner retell', 'partners'],
      ],
      { defaults: { externalSource: 'District Catalog' }, existingItems: [existing] },
    );
    expect(same.rows[0]?.classification).toBe('skip');

    const changed = preview(
      [
        ['activity_id', 'title', 'grouping', 'duration_minutes'],
        ['ACT-1', 'Partner retell', 'partners', '20'],
      ],
      { defaults: { externalSource: 'District Catalog' }, existingItems: [existing] },
    );
    expect(changed.rows[0]?.classification).toBe('update');
    expect(changed.rows[0]?.planned?.item?.typedFields).toMatchObject({ estimatedMinutes: 20 });
  });

  it('requires review for unknown controlled values and can explicitly create them', () => {
    const first = preview([
      ['title', 'purpose'],
      ['Question carousel', 'Discussion'],
    ]);
    expect(first.rows[0]?.classification).toBe('review');
    expect(first.rows[0]?.categoryReviews[0]).toMatchObject({ kind: 'unknown' });

    const resolved = preview(
      [
        ['title', 'purpose'],
        ['Question carousel', 'Discussion'],
      ],
      { categoryDecisions: { 'purpose-tag\u0000discussion': { action: 'create' } } },
    );
    expect(resolved.rows[0]?.classification).toBe('create');
    expect(resolved.newCategoryValues[0]).toMatchObject({
      familyId: 'purpose-tag',
      name: 'Discussion',
      isDefault: false,
    });
    expect(resolved.rows[0]?.planned?.assignmentsToCreate).toHaveLength(1);
  });

  it('requires an explicit archived identity decision and supports restore plus update', () => {
    const identity = buildActivityImportIdentity('District Catalog', 'ACT-9');
    const archived = item({
      status: 'archived',
      archivedAt: timestamp,
      externalSource: 'District Catalog',
      externalKey: 'ACT-9',
      importIdentityKey: identity,
    });
    const rows = [
      ['activity_id', 'title', 'duration_minutes'],
      ['ACT-9', 'Partner retell', '18'],
    ];
    const first = preview(rows, {
      defaults: { externalSource: 'District Catalog' },
      existingItems: [archived],
    });
    expect(first.rows[0]?.duplicateReview?.kind).toBe('archived-identity');

    const resolved = preview(rows, {
      defaults: { externalSource: 'District Catalog' },
      existingItems: [archived],
      duplicateDecisions: {
        2: { action: 'restore-update', targetId: archived.id },
      },
    });
    expect(resolved.rows[0]?.classification).toBe('update');
    expect(resolved.rows[0]?.planned?.item).toMatchObject({
      status: 'active',
      archivedAt: undefined,
    });
  });

  it('blocks conflicting duplicate identities and skips exact repeated source rows', () => {
    const conflicting = preview(
      [
        ['activity_id', 'title', 'duration_minutes'],
        ['ACT-1', 'First title', '10'],
        ['ACT-1', 'Second title', '20'],
      ],
      { defaults: { externalSource: 'District Catalog' } },
    );
    expect(conflicting.rows.map((row) => row.classification)).toEqual(['blocked', 'blocked']);

    const repeated = preview(
      [
        ['activity_id', 'title'],
        ['ACT-1', 'First title'],
        ['ACT-1', 'First title'],
      ],
      { defaults: { externalSource: 'District Catalog' } },
    );
    expect(repeated.rows.map((row) => row.classification)).toEqual(['create', 'skip']);
  });

  it('requires an explicit unmapped-column decision and preserves reviewed values in notes', () => {
    const rows = [
      ['title', 'legacy_column'],
      ['Partner retell', 'Keep this legacy detail'],
    ];
    expect(() => preview(rows)).toThrow('Review every non-empty unmapped source column');

    const resolved = preview(rows, { unmappedDecisions: { 1: 'notes' } });
    const activity = resolved.rows[0]?.planned?.item;
    expect(
      activity?.typedFields?.catalogType === 'activity' ? activity.typedFields.notes : '',
    ).toContain('Imported column: legacy_column\nKeep this legacy detail');
  });

  it('resolves active aliases and can restore an archived controlled value', () => {
    const active = category({ aliases: ['Talk'], normalizedAliases: ['talk'] });
    const archived = category({
      id: 'focus-speaking',
      familyId: 'focus-tag',
      name: 'Speaking',
      normalizedName: 'speaking',
      lifecycleState: 'archived',
      archivedAt: timestamp,
    });
    const first = preview(
      [
        ['title', 'purpose', 'skill'],
        ['Partner exchange', 'Talk', 'Speaking'],
      ],
      { categoryValues: [active, archived] },
    );
    expect(first.rows[0]?.categoryReviews).toHaveLength(1);

    const resolved = preview(
      [
        ['title', 'purpose', 'skill'],
        ['Partner exchange', 'Talk', 'Speaking'],
      ],
      {
        categoryValues: [active, archived],
        categoryDecisions: {
          'focus-tag\u0000speaking': { action: 'restore', categoryValueId: archived.id },
        },
      },
    );
    expect(resolved.rows[0]?.classification).toBe('create');
    expect(resolved.restoredCategoryValues[0]?.after.lifecycleState).toBe('active');
  });
});

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
  buildResourceImportIdentity,
  buildResourceImportPreview,
  suggestResourceImportMapping,
  type ResourceDuplicateDecisions,
  type ResourceFormatDecisions,
  type ResourceSourceDecisions,
  type UnmappedColumnDecisions,
} from './resourceImportModel';

const timestamp = '2026-08-01T04:00:00.000Z';

function ids(prefix = 'generated') {
  let index = 0;
  return () => `${prefix}-${++index}`;
}

function item(overrides: Partial<LibraryCatalogItem> = {}): LibraryCatalogItem {
  return libraryCatalogItemSchema.parse({
    id: 'resource-existing',
    catalogType: 'resource',
    title: 'Weather deck',
    tags: [],
    typedFields: { catalogType: 'resource', sourceLocation: 'Shared Drive / Weather.pptx' },
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  });
}

function format(overrides: Partial<CategoryValue> = {}): CategoryValue {
  return categoryValueSchema.parse({
    id: 'format-slides',
    familyId: 'resource-format',
    name: 'Slides',
    normalizedName: 'slides',
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
    duplicateDecisions?: ResourceDuplicateDecisions;
    formatDecisions?: ResourceFormatDecisions;
    sourceDecisions?: ResourceSourceDecisions;
    unmappedDecisions?: UnmappedColumnDecisions;
  } = {},
) {
  const table = buildImportTable(rows);
  return buildResourceImportPreview(
    {
      table,
      mapping: suggestResourceImportMapping(table.headers),
      defaults: options.defaults ?? {},
      unmappedDecisions: options.unmappedDecisions ?? {},
      duplicateDecisions: options.duplicateDecisions ?? {},
      formatDecisions: options.formatDecisions ?? {},
      sourceDecisions: options.sourceDecisions ?? {},
      existingItems: options.existingItems ?? [],
      categoryValues: options.categoryValues ?? [],
      categoryAssignments: options.categoryAssignments ?? [],
    },
    { createId: ids(), now: () => timestamp },
  );
}

describe('Resource import model', () => {
  it('maps legacy metadata without silently dropping source and usage details', () => {
    const result = preview(
      [
        [
          'resource_id',
          'title',
          'type',
          'url',
          'version',
          'owner',
          'last_checked',
          'access_notes',
          'related_unit',
          'rights',
          'tags',
          'status',
        ],
        [
          'RES-101',
          'Weather deck',
          'Slides',
          'https://example.invalid/weather',
          '2026',
          'Example author',
          '2026-07-20',
          'School account',
          'Unit 1',
          'Fictional example',
          'Weather, Speaking',
          'active',
        ],
      ],
      {
        defaults: { externalSource: 'District Resource Catalog' },
        formatDecisions: { 'resource-format\u0000slides': { action: 'create' } },
      },
    );

    expect(result.summary).toMatchObject({ createCount: 1, reviewCount: 0, blockedCount: 0 });
    expect(result.rows[0]?.planned?.item).toMatchObject({
      title: 'Weather deck',
      externalSource: 'District Resource Catalog',
      externalKey: 'RES-101',
      tags: ['Weather', 'Speaking', 'Unit: Unit 1'],
      typedFields: {
        catalogType: 'resource',
        sourceLocation: 'https://example.invalid/weather',
      },
    });
    const fields = result.rows[0]?.planned?.item?.typedFields;
    expect(fields?.catalogType === 'resource' ? fields.usageNotes : '').toContain(
      'Access notes\nSchool account',
    );
    expect(result.newCategoryValues[0]).toMatchObject({
      familyId: 'resource-format',
      name: 'Slides',
    });
  });

  it('uses only external source plus Resource ID for automatic update', () => {
    const titleOnly = preview(
      [
        ['title', 'source_location'],
        ['Weather deck', 'Shared Drive / New Weather.pptx'],
      ],
      { existingItems: [item()] },
    );
    expect(titleOnly.rows[0]?.classification).toBe('review');

    const identity = buildResourceImportIdentity('District Catalog', 'RES-1');
    const existing = item({
      externalSource: 'District Catalog',
      externalKey: 'RES-1',
      importIdentityKey: identity,
    });
    const updated = preview(
      [
        ['resource_id', 'title', 'usage_notes'],
        ['RES-1', 'Weather deck', 'Use during partner work.'],
      ],
      { defaults: { externalSource: 'District Catalog' }, existingItems: [existing] },
    );
    expect(updated.rows[0]?.classification).toBe('update');
  });

  it('treats identical URL and file-location matches as reviewable probable duplicates', () => {
    const existing = item({
      title: 'Old title',
      typedFields: { catalogType: 'resource', sourceLocation: 'HTTPS://Example.invalid:443/a#one' },
    });
    const result = preview(
      [
        ['title', 'source_location'],
        ['New title', 'https://example.invalid/a#two'],
      ],
      { existingItems: [existing] },
    );
    expect(result.rows[0]?.duplicateReview?.kind).toBe('probable-duplicate');
    expect(result.rows[0]?.duplicateReview?.candidates[0]?.match).toBe('source-location');
  });

  it('requires explicit review for credential-like URL query parameters', () => {
    const rows = [
      ['title', 'source_location'],
      ['Private URL', 'https://example.invalid/a?access_token=temporary'],
    ];
    const first = preview(rows);
    expect(first.rows[0]).toMatchObject({ classification: 'review' });
    expect(first.rows[0]?.sourceReview?.parameters).toEqual(['access_token']);

    const resolved = preview(rows, { sourceDecisions: { 2: { action: 'keep' } } });
    expect(resolved.rows[0]?.classification).toBe('create');
  });

  it('replaces the single reviewed Resource Format while preserving blank format updates', () => {
    const slides = format();
    const document = format({
      id: 'format-document',
      name: 'Document',
      normalizedName: 'document',
      sortOrder: 1,
    });
    const existing = item({
      externalSource: 'District',
      externalKey: 'RES-2',
      importIdentityKey: buildResourceImportIdentity('District', 'RES-2'),
    });
    const assignment: CategoryAssignment = {
      id: 'assignment-slides',
      familyId: 'resource-format',
      categoryValueId: slides.id,
      entityType: 'library-item',
      entityId: existing.id,
      createdAt: timestamp,
    };
    const result = preview(
      [
        ['resource_id', 'title', 'resource_format'],
        ['RES-2', 'Weather deck', 'Document'],
      ],
      {
        defaults: { externalSource: 'District' },
        existingItems: [existing],
        categoryValues: [slides, document],
        categoryAssignments: [assignment],
      },
    );
    expect(result.rows[0]?.planned?.assignmentsToDelete).toEqual([assignment]);
    expect(result.rows[0]?.planned?.assignmentsToCreate[0]).toMatchObject({
      categoryValueId: document.id,
    });
  });

  it('requires review for archived Resource identity and supports restore plus update', () => {
    const archived = item({
      status: 'archived',
      archivedAt: timestamp,
      externalSource: 'District',
      externalKey: 'RES-9',
      importIdentityKey: buildResourceImportIdentity('District', 'RES-9'),
    });
    const rows = [
      ['resource_id', 'title', 'usage_notes'],
      ['RES-9', 'Weather deck', 'Updated notes'],
    ];
    expect(
      preview(rows, { defaults: { externalSource: 'District' }, existingItems: [archived] }).rows[0]
        ?.duplicateReview?.kind,
    ).toBe('archived-identity');
    const resolved = preview(rows, {
      defaults: { externalSource: 'District' },
      existingItems: [archived],
      duplicateDecisions: { 2: { action: 'restore-update', targetId: archived.id } },
    });
    expect(resolved.rows[0]?.planned?.item).toMatchObject({
      status: 'active',
      archivedAt: undefined,
    });
  });

  it('blocks conflicting identities and skips exact repeated rows', () => {
    const conflicting = preview(
      [
        ['resource_id', 'title'],
        ['RES-1', 'First'],
        ['RES-1', 'Second'],
      ],
      { defaults: { externalSource: 'District' } },
    );
    expect(conflicting.rows.map((row) => row.classification)).toEqual(['blocked', 'blocked']);

    const repeated = preview([
      ['title', 'source_location'],
      ['Map', 'Binder A'],
      ['Map', 'Binder A'],
    ]);
    expect(repeated.rows.map((row) => row.classification)).toEqual(['create', 'skip']);
  });

  it('preserves reviewed unmapped columns in Resource usage notes', () => {
    const rows = [
      ['title', 'legacy_column'],
      ['Weather deck', 'Keep this detail'],
    ];
    expect(() => preview(rows)).toThrow('Review every non-empty unmapped source column');
    const resolved = preview(rows, { unmappedDecisions: { 1: 'notes' } });
    const fields = resolved.rows[0]?.planned?.item?.typedFields;
    expect(fields?.catalogType === 'resource' ? fields.usageNotes : '').toContain(
      'Imported column: legacy_column\nKeep this detail',
    );
  });
});

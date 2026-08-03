import { describe, expect, it } from 'vitest';

import type {
  CategoryAssignment,
  CategoryValue,
  LibraryCatalogItem,
} from '@/domain/models/entities';

import {
  buildLibraryCatalogItemViews,
  filterLibraryCatalogItems,
  listLibraryCatalogTags,
  normalizeLibraryCatalogTags,
  type LibraryCatalogFilters,
  type LibraryCatalogItemView,
} from './libraryCatalogReadModel';

const createdAt = '2026-07-23T12:00:00.000Z';

function item(
  overrides: Partial<LibraryCatalogItem> & Pick<LibraryCatalogItem, 'id' | 'catalogType' | 'title'>,
): LibraryCatalogItemView {
  return {
    purposeTagLabels: [],
    focusTagLabels: [],
    classificationGroups: [],
    description: undefined,
    tags: [],
    status: 'active',
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

const defaults: LibraryCatalogFilters = {
  query: '',
  catalogType: 'all',
  status: 'all',
  tag: '',
  resourceFormatId: '',
};

describe('Library Catalog read model', () => {
  it('normalizes comma-style tags without changing their first display spelling', () => {
    expect(normalizeLibraryCatalogTags([' Reading ', 'reading', '', 'Speaking'])).toEqual([
      'Reading',
      'Speaking',
    ]);
  });

  it('joins Resource Format assignments onto stable catalog records', () => {
    const values: CategoryValue[] = [
      {
        id: 'format-slides',
        familyId: 'resource-format',
        name: 'Slide deck',
        normalizedName: 'slide deck',
        aliases: [],
        normalizedAliases: [],
        sortOrder: 0,
        isDefault: false,
        lifecycleState: 'active',
        createdAt,
        updatedAt: createdAt,
      },
    ];
    const assignments: CategoryAssignment[] = [
      {
        id: 'assignment-1',
        familyId: 'resource-format',
        categoryValueId: 'format-slides',
        entityType: 'library-item',
        entityId: 'resource-1',
        createdAt,
      },
    ];
    expect(
      buildLibraryCatalogItemViews(
        [item({ id: 'resource-1', catalogType: 'resource', title: 'Slides' })],
        assignments,
        values,
      )[0],
    ).toMatchObject({
      resourceFormatId: 'format-slides',
      resourceFormatLabel: 'Slide deck',
    });
  });

  it('joins Activity Purpose and Focus assignments without treating them as Resource Formats', () => {
    const values: CategoryValue[] = [
      {
        id: 'purpose-speaking',
        familyId: 'purpose-tag',
        name: 'Oral language',
        normalizedName: 'oral language',
        aliases: [],
        normalizedAliases: [],
        sortOrder: 0,
        isDefault: false,
        lifecycleState: 'active',
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: 'focus-retell',
        familyId: 'focus-tag',
        name: 'Retelling',
        normalizedName: 'retelling',
        aliases: [],
        normalizedAliases: [],
        sortOrder: 0,
        isDefault: false,
        lifecycleState: 'active',
        createdAt,
        updatedAt: createdAt,
      },
    ];
    const assignments: CategoryAssignment[] = [
      {
        id: 'purpose-assignment',
        familyId: 'purpose-tag',
        categoryValueId: 'purpose-speaking',
        entityType: 'library-item',
        entityId: 'activity-1',
        createdAt,
      },
      {
        id: 'focus-assignment',
        familyId: 'focus-tag',
        categoryValueId: 'focus-retell',
        entityType: 'library-item',
        entityId: 'activity-1',
        createdAt,
      },
    ];

    expect(
      buildLibraryCatalogItemViews(
        [item({ id: 'activity-1', catalogType: 'activity', title: 'Partner retell' })],
        assignments,
        values,
      )[0],
    ).toMatchObject({
      purposeTagLabels: ['Oral language'],
      focusTagLabels: ['Retelling'],
      resourceFormatId: undefined,
    });
  });

  it('joins all canonical Assessment classifications and keeps archived values visible', () => {
    const values: CategoryValue[] = [
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
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: 'grade-3',
        familyId: 'grade-level',
        name: 'Grade 3',
        normalizedName: 'grade 3',
        aliases: [],
        normalizedAliases: [],
        sortOrder: 0,
        isDefault: false,
        lifecycleState: 'archived',
        archivedAt: createdAt,
        createdAt,
        updatedAt: createdAt,
      },
    ];
    const assignments: CategoryAssignment[] = [
      {
        id: 'subject-assignment',
        familyId: 'subject',
        categoryValueId: 'subject-mathematics',
        entityType: 'library-item',
        entityId: 'assessment-1',
        createdAt,
      },
      {
        id: 'grade-assignment',
        familyId: 'grade-level',
        categoryValueId: 'grade-3',
        entityType: 'library-item',
        entityId: 'assessment-1',
        createdAt,
      },
    ];

    const view = buildLibraryCatalogItemViews(
      [
        item({
          id: 'assessment-1',
          catalogType: 'assessment',
          title: 'Fraction explanation',
        }),
      ],
      assignments,
      values,
    )[0];

    if (!view) {
      throw new Error('Expected the Assessment Library view to be built.');
    }

    expect(view.classificationGroups).toEqual([
      {
        familyId: 'subject',
        familyLabel: 'Subjects',
        values: [
          {
            id: 'subject-mathematics',
            name: 'Mathematics',
            lifecycleState: 'active',
          },
        ],
      },
      {
        familyId: 'grade-level',
        familyLabel: 'Grade Levels',
        values: [{ id: 'grade-3', name: 'Grade 3', lifecycleState: 'archived' }],
      },
      {
        familyId: 'language',
        familyLabel: 'Languages',
        values: [],
      },
      {
        familyId: 'language-level',
        familyLabel: 'Language Levels',
        values: [],
      },
      {
        familyId: 'purpose-tag',
        familyLabel: 'Purpose Tags',
        values: [],
      },
      {
        familyId: 'focus-tag',
        familyLabel: 'Focus Tags',
        values: [],
      },
    ]);
    expect(filterLibraryCatalogItems([view], { ...defaults, query: 'mathematics' })).toHaveLength(
      1,
    );
  });

  it('searches title, description, tags, type, and Resource Format', () => {
    const values = [
      {
        ...item({
          id: 'resource-1',
          catalogType: 'resource',
          title: 'Weather cards',
          description: 'Picture prompts',
          tags: ['Speaking'],
        }),
        resourceFormatId: 'format-cards',
        resourceFormatLabel: 'Printable cards',
        purposeTagLabels: [],
        focusTagLabels: [],
      },
    ];
    for (const query of ['weather', 'picture', 'speaking', 'resource', 'printable']) {
      expect(filterLibraryCatalogItems(values, { ...defaults, query })).toHaveLength(1);
    }
  });

  it('searches Activity, Resource, and Assessment workflow fields', () => {
    const values = [
      item({
        id: 'activity-1',
        catalogType: 'activity',
        title: 'Partner routine',
        typedFields: {
          catalogType: 'activity',
          grouping: 'partners',
          estimatedMinutes: 8,
          directions: 'Explain one example to a partner.',
          materials: 'Picture cards',
          notes: 'Preparation\nSort the cards.',
        },
      }),
      item({
        id: 'assessment-1',
        catalogType: 'assessment',
        title: 'Exit check',
        typedFields: {
          catalogType: 'assessment',
          assessmentKind: 'formative',
          studentPrompt: 'Compare two unit fractions.',
          evidenceToCollect: 'A labeled model and one sentence.',
        },
      }),
    ];

    expect(filterLibraryCatalogItems(values, { ...defaults, query: 'partner' })).toHaveLength(1);
    expect(filterLibraryCatalogItems(values, { ...defaults, query: 'picture cards' })).toHaveLength(
      1,
    );
    expect(
      filterLibraryCatalogItems(values, { ...defaults, query: 'sort the cards' }),
    ).toHaveLength(1);
    expect(filterLibraryCatalogItems(values, { ...defaults, query: 'labeled model' })).toHaveLength(
      1,
    );
    expect(filterLibraryCatalogItems(values, { ...defaults, query: 'formative' })).toHaveLength(1);
  });

  it('combines type, status, tag, and Resource Format filters', () => {
    const values = [
      {
        ...item({
          id: 'resource-1',
          catalogType: 'resource',
          title: 'Active cards',
          tags: ['Reading'],
        }),
        resourceFormatId: 'format-cards',
        resourceFormatLabel: 'Cards',
        purposeTagLabels: [],
        focusTagLabels: [],
      },
      {
        ...item({
          id: 'resource-2',
          catalogType: 'resource',
          title: 'Archived slides',
          tags: ['Reading'],
          status: 'archived',
          archivedAt: createdAt,
        }),
        resourceFormatId: 'format-slides',
        resourceFormatLabel: 'Slides',
        purposeTagLabels: [],
        focusTagLabels: [],
      },
      item({
        id: 'activity-1',
        catalogType: 'activity',
        title: 'Reading activity',
        tags: ['Reading'],
      }),
    ];
    expect(
      filterLibraryCatalogItems(values, {
        ...defaults,
        catalogType: 'resource',
        status: 'active',
        tag: 'Reading',
        resourceFormatId: 'format-cards',
      }).map((value) => value.id),
    ).toEqual(['resource-1']);
  });

  it('lists a stable alphabetized tag vocabulary from current records', () => {
    expect(
      listLibraryCatalogTags([
        item({
          id: 'activity-1',
          catalogType: 'activity',
          title: 'A',
          tags: ['Speaking', 'Reading'],
        }),
        item({
          id: 'resource-1',
          catalogType: 'resource',
          title: 'B',
          tags: ['reading', 'Writing'],
        }),
      ]),
    ).toEqual(['Reading', 'Speaking', 'Writing']);
  });
});

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
} from './libraryCatalogReadModel';

const createdAt = '2026-07-23T12:00:00.000Z';

function item(
  overrides: Partial<LibraryCatalogItem> & Pick<LibraryCatalogItem, 'id' | 'catalogType' | 'title'>,
): LibraryCatalogItem {
  return {
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
      },
    ];
    for (const query of ['weather', 'picture', 'speaking', 'resource', 'printable']) {
      expect(filterLibraryCatalogItems(values, { ...defaults, query })).toHaveLength(1);
    }
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

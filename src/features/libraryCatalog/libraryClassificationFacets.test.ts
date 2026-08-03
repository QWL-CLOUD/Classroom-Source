import { describe, expect, it } from 'vitest';

import type { CategoryValue } from '@/domain/models/entities';

import {
  buildLibraryClassificationFacetModel,
  filterLibraryCatalogItemsByClassifications,
  hasLibraryClassificationSelections,
  pruneLibraryClassificationSelections,
  updateLibraryClassificationSelection,
} from './libraryClassificationFacets';
import type { LibraryCatalogFilters, LibraryCatalogItemView } from './libraryCatalogReadModel';

const timestamp = '2026-08-02T12:00:00.000Z';

function categoryValue(
  id: string,
  familyId: CategoryValue['familyId'],
  name: string,
  sortOrder = 0,
  lifecycleState: CategoryValue['lifecycleState'] = 'active',
): CategoryValue {
  return {
    id,
    familyId,
    name,
    normalizedName: name.toLocaleLowerCase('en'),
    aliases: [],
    normalizedAliases: [],
    sortOrder,
    isDefault: false,
    lifecycleState,
    archivedAt: lifecycleState === 'archived' ? timestamp : undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function item(
  id: string,
  catalogType: LibraryCatalogItemView['catalogType'],
  title: string,
  classifications: Partial<Record<CategoryValue['familyId'], readonly CategoryValue[]>>,
  tags: string[] = [],
): LibraryCatalogItemView {
  return {
    id,
    catalogType,
    title,
    tags,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
    purposeTagLabels: [],
    focusTagLabels: [],
    classificationGroups: Object.entries(classifications).map(([familyId, values]) => ({
      familyId: familyId as CategoryValue['familyId'],
      familyLabel: familyId,
      values: (values ?? []).map((value) => ({
        id: value.id,
        name: value.name,
        lifecycleState: value.lifecycleState,
      })),
    })),
  };
}

const math = categoryValue('subject-math', 'subject', 'Mathematics');
const science = categoryValue('subject-science', 'subject', 'Science', 1);
const grade3 = categoryValue('grade-3', 'grade-level', 'Grade 3');
const grade4 = categoryValue('grade-4', 'grade-level', 'Grade 4', 1);
const rolePlay = categoryValue('activity-role-play', 'activity-type', 'Role-play');
const slides = categoryValue('format-slides', 'resource-format', 'Slides');
const practice = categoryValue('purpose-practice', 'purpose-tag', 'Practice');
const archivedHistory = categoryValue('subject-history', 'subject', 'History', 2, 'archived');

const values = [math, science, grade3, grade4, rolePlay, slides, practice, archivedHistory];
const items = [
  item('activity-math-3', 'activity', 'Math role-play', {
    subject: [math],
    'grade-level': [grade3],
    'activity-type': [rolePlay],
    'purpose-tag': [practice],
  }),
  item('activity-science-3', 'activity', 'Science role-play', {
    subject: [science],
    'grade-level': [grade3],
    'activity-type': [rolePlay],
  }),
  item('resource-math-4', 'resource', 'Math slides', {
    subject: [math],
    'grade-level': [grade4],
    'resource-format': [slides],
  }),
  item('assessment-math-3', 'assessment', 'Math check', {
    subject: [math],
    'grade-level': [grade3],
    'purpose-tag': [practice],
  }),
];

const filters: LibraryCatalogFilters = {
  query: '',
  catalogType: 'all',
  status: 'active',
  tag: '',
};

describe('Library classification facets', () => {
  it('uses OR within one family and AND across different families', () => {
    expect(
      filterLibraryCatalogItemsByClassifications(items, {
        subject: ['subject-math', 'subject-science'],
      }).map((value) => value.id),
    ).toEqual(['activity-math-3', 'activity-science-3', 'resource-math-4', 'assessment-math-3']);

    expect(
      filterLibraryCatalogItemsByClassifications(items, {
        subject: ['subject-math', 'subject-science'],
        'grade-level': ['grade-3'],
      }).map((value) => value.id),
    ).toEqual(['activity-math-3', 'activity-science-3', 'assessment-math-3']);
  });

  it('builds disjunctive counts using all other selected families', () => {
    const model = buildLibraryClassificationFacetModel({
      items,
      categoryValues: values,
      filters: { ...filters, catalogType: 'activity' },
      selections: {
        subject: ['subject-math'],
        'grade-level': ['grade-3'],
      },
    });

    expect(model.visibleItems.map((value) => value.id)).toEqual(['activity-math-3']);
    expect(model.groups.find((group) => group.familyId === 'subject')?.values).toEqual([
      { id: 'subject-math', name: 'Mathematics', count: 1, selected: true },
      { id: 'subject-science', name: 'Science', count: 1, selected: false },
    ]);
    expect(model.groups.find((group) => group.familyId === 'grade-level')?.values).toEqual([
      { id: 'grade-3', name: 'Grade 3', count: 1, selected: true },
    ]);
  });

  it('keeps an active selected zero-count value visible and omits unused alternatives', () => {
    const model = buildLibraryClassificationFacetModel({
      items,
      categoryValues: [...values, categoryValue('grade-5', 'grade-level', 'Grade 5', 2)],
      filters: { ...filters, catalogType: 'activity', query: 'Science' },
      selections: { subject: ['subject-math'] },
    });

    expect(model.visibleItems).toHaveLength(0);
    expect(model.groups.find((group) => group.familyId === 'subject')?.values).toEqual([
      { id: 'subject-math', name: 'Mathematics', count: 0, selected: true },
      { id: 'subject-science', name: 'Science', count: 1, selected: false },
    ]);
    expect(
      model.groups.flatMap((group) => group.values).some((value) => value.name === 'Grade 5'),
    ).toBe(false);
  });

  it('prunes inactive, invalid, and tab-incompatible selections by stable ID', () => {
    expect(
      pruneLibraryClassificationSelections(
        {
          subject: ['subject-math', 'subject-history', 'missing'],
          'activity-type': ['activity-role-play'],
          'resource-format': ['format-slides'],
        },
        'resource',
        values,
      ),
    ).toEqual({
      subject: ['subject-math'],
      'resource-format': ['format-slides'],
    });
  });

  it('exposes only common families on All and no classification facets for Standards', () => {
    const allModel = buildLibraryClassificationFacetModel({
      items,
      categoryValues: values,
      filters,
      selections: {},
    });
    expect(allModel.groups.map((group) => group.familyId)).toEqual([
      'subject',
      'grade-level',
      'purpose-tag',
    ]);

    const standardsModel = buildLibraryClassificationFacetModel({
      items,
      categoryValues: values,
      filters: { ...filters, catalogType: 'standard' },
      selections: { subject: ['subject-math'] },
    });
    expect(standardsModel.groups).toEqual([]);
    expect(standardsModel.selections).toEqual({});
  });

  it('updates and detects selection state without retaining empty families', () => {
    const selected = updateLibraryClassificationSelection({}, 'subject', 'subject-math', true);
    expect(hasLibraryClassificationSelections(selected)).toBe(true);
    expect(
      updateLibraryClassificationSelection(selected, 'subject', 'subject-math', false),
    ).toEqual({});
  });
});

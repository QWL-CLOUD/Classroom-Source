import { libraryCatalogTypedFieldsSearchText } from '@/features/libraryCatalog/libraryCatalogTypedFields';

import type {
  CategoryAssignment,
  CategoryFamilyId,
  CategoryValue,
  CategoryValueLifecycleState,
  LibraryCatalogItem,
  LibraryCatalogStatus,
  LibraryCatalogType,
} from '@/domain/models/entities';
import { getCategoryFamily } from '@/features/categories/categoryFamilies';

import { categoryFamilyIdsForLibraryCatalogType } from './libraryClassificationFamilies';

export const libraryCatalogTypeLabels: Record<LibraryCatalogType, string> = {
  activity: 'Activity',
  resource: 'Resource',
  assessment: 'Assessment',
  standard: 'Standard',
};

export const libraryCatalogStatusLabels: Record<LibraryCatalogStatus, string> = {
  active: 'Active',
  archived: 'Archived',
};

export interface LibraryCatalogClassificationValueView {
  id: string;
  name: string;
  lifecycleState: CategoryValueLifecycleState;
}

export interface LibraryCatalogClassificationGroupView {
  familyId: CategoryFamilyId;
  familyLabel: string;
  values: LibraryCatalogClassificationValueView[];
}

export interface LibraryCatalogItemView extends LibraryCatalogItem {
  resourceFormatId?: string;
  resourceFormatLabel?: string;
  purposeTagLabels: string[];
  focusTagLabels: string[];
  classificationGroups: LibraryCatalogClassificationGroupView[];
}

export interface LibraryCatalogFilters {
  query: string;
  catalogType: 'all' | LibraryCatalogType;
  status: 'all' | LibraryCatalogStatus;
  tag: string;
  resourceFormatId: string;
}

export function normalizeLibraryCatalogTags(values: readonly string[]): string[] {
  const unique = new Map<string, string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase('en');
    if (!unique.has(key)) unique.set(key, trimmed);
  }
  return [...unique.values()].slice(0, 30);
}

export function parseLibraryCatalogTags(value: string): string[] {
  return normalizeLibraryCatalogTags(value.split(','));
}

export function buildLibraryCatalogItemViews(
  items: readonly LibraryCatalogItem[],
  assignments: readonly CategoryAssignment[],
  categoryValues: readonly CategoryValue[],
): LibraryCatalogItemView[] {
  const valueById = new Map(categoryValues.map((value) => [value.id, value] as const));
  const assignmentsByItemId = new Map<string, CategoryAssignment[]>();

  for (const assignment of assignments) {
    if (assignment.entityType !== 'library-item') continue;
    const values = assignmentsByItemId.get(assignment.entityId) ?? [];
    values.push(assignment);
    assignmentsByItemId.set(assignment.entityId, values);
  }

  return items.map((item) => {
    const itemAssignments = assignmentsByItemId.get(item.id) ?? [];
    const labelValues = (familyId: CategoryAssignment['familyId']) =>
      itemAssignments
        .filter((assignment) => assignment.familyId === familyId)
        .map((assignment) => valueById.get(assignment.categoryValueId))
        .filter((value): value is CategoryValue => Boolean(value))
        .sort(
          (first, second) =>
            first.sortOrder - second.sortOrder ||
            first.name.localeCompare(second.name, 'en', { sensitivity: 'base' }),
        );
    const resourceFormat = labelValues('resource-format')[0];
    const classificationGroups = categoryFamilyIdsForLibraryCatalogType(item.catalogType).map(
      (familyId): LibraryCatalogClassificationGroupView => ({
        familyId,
        familyLabel: getCategoryFamily(familyId).label,
        values: labelValues(familyId).map((value) => ({
          id: value.id,
          name: value.name,
          lifecycleState: value.lifecycleState,
        })),
      }),
    );
    return {
      ...item,
      resourceFormatId: resourceFormat?.id,
      resourceFormatLabel: resourceFormat?.name,
      purposeTagLabels: labelValues('purpose-tag').map((value) => value.name),
      focusTagLabels: labelValues('focus-tag').map((value) => value.name),
      classificationGroups,
    };
  });
}

function searchableText(item: LibraryCatalogItemView): string {
  return [
    item.title,
    item.description ?? '',
    item.tags.join(' '),
    item.resourceFormatLabel ?? '',
    item.purposeTagLabels.join(' '),
    item.focusTagLabels.join(' '),
    item.classificationGroups
      .flatMap((group) => [group.familyLabel, ...group.values.map((value) => value.name)])
      .join(' '),
    libraryCatalogTypeLabels[item.catalogType],
    libraryCatalogTypedFieldsSearchText(item),
  ]
    .join(' ')
    .toLocaleLowerCase('en');
}

export function filterLibraryCatalogItems(
  items: readonly LibraryCatalogItemView[],
  filters: LibraryCatalogFilters,
): LibraryCatalogItemView[] {
  const query = filters.query.trim().toLocaleLowerCase('en');

  return items
    .filter((item) => {
      if (filters.catalogType !== 'all' && item.catalogType !== filters.catalogType) {
        return false;
      }
      if (filters.status !== 'all' && item.status !== filters.status) {
        return false;
      }
      if (filters.tag && !item.tags.includes(filters.tag)) return false;
      if (filters.resourceFormatId && item.resourceFormatId !== filters.resourceFormatId) {
        return false;
      }
      return !query || searchableText(item).includes(query);
    })
    .sort(
      (first, second) =>
        (first.status === second.status ? 0 : first.status === 'active' ? -1 : 1) ||
        second.updatedAt.localeCompare(first.updatedAt) ||
        first.title.localeCompare(second.title, 'en', { sensitivity: 'base' }) ||
        first.id.localeCompare(second.id),
    );
}

export function listLibraryCatalogTags(items: readonly LibraryCatalogItemView[]): string[] {
  return normalizeLibraryCatalogTags(items.flatMap((item) => item.tags)).sort((first, second) =>
    first.localeCompare(second, 'en', { sensitivity: 'base' }),
  );
}

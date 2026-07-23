import type {
  CategoryAssignment,
  CategoryValue,
  LibraryCatalogItem,
  LibraryCatalogStatus,
  LibraryCatalogType,
} from '@/domain/models/entities';

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

export interface LibraryCatalogItemView extends LibraryCatalogItem {
  resourceFormatId?: string;
  resourceFormatLabel?: string;
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
  const resourceFormatById = new Map(
    categoryValues
      .filter((value) => value.familyId === 'resource-format')
      .map((value) => [value.id, value] as const),
  );
  const assignmentByItemId = new Map<string, CategoryAssignment>();

  for (const assignment of assignments) {
    if (assignment.entityType !== 'library-item' || assignment.familyId !== 'resource-format') {
      continue;
    }
    assignmentByItemId.set(assignment.entityId, assignment);
  }

  return items.map((item) => {
    const assignment = assignmentByItemId.get(item.id);
    const format = assignment ? resourceFormatById.get(assignment.categoryValueId) : undefined;
    return {
      ...item,
      resourceFormatId: format?.id,
      resourceFormatLabel: format?.name,
    };
  });
}

function searchableText(item: LibraryCatalogItemView): string {
  return [
    item.title,
    item.description ?? '',
    item.tags.join(' '),
    item.resourceFormatLabel ?? '',
    libraryCatalogTypeLabels[item.catalogType],
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

import type { CategoryFamilyId, CategoryValue, LibraryCatalogType } from '@/domain/models/entities';
import { getCategoryFamily } from '@/features/categories/categoryFamilies';

import { categoryFamilyIdsForLibraryFilterTab } from './libraryClassificationFamilies';
import {
  filterLibraryCatalogItems,
  type LibraryCatalogFilters,
  type LibraryCatalogItemView,
} from './libraryCatalogReadModel';

export type LibraryClassificationSelections = Partial<Record<CategoryFamilyId, readonly string[]>>;

export interface LibraryClassificationFacetValueView {
  id: string;
  name: string;
  count: number;
  selected: boolean;
}

export interface LibraryClassificationFacetGroupView {
  familyId: CategoryFamilyId;
  familyLabel: string;
  values: LibraryClassificationFacetValueView[];
}

export interface LibraryClassificationFacetModel {
  selections: LibraryClassificationSelections;
  visibleItems: LibraryCatalogItemView[];
  groups: LibraryClassificationFacetGroupView[];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function activeValuesByFamily(
  categoryValues: readonly CategoryValue[],
): Map<CategoryFamilyId, CategoryValue[]> {
  const result = new Map<CategoryFamilyId, CategoryValue[]>();
  for (const value of categoryValues) {
    if (value.lifecycleState !== 'active') continue;
    const values = result.get(value.familyId) ?? [];
    values.push(value);
    result.set(value.familyId, values);
  }
  for (const values of result.values()) {
    values.sort(
      (first, second) =>
        first.sortOrder - second.sortOrder ||
        first.name.localeCompare(second.name, 'en', { sensitivity: 'base' }) ||
        first.id.localeCompare(second.id),
    );
  }
  return result;
}

export function pruneLibraryClassificationSelections(
  selections: LibraryClassificationSelections,
  catalogType: 'all' | LibraryCatalogType,
  categoryValues: readonly CategoryValue[],
): LibraryClassificationSelections {
  const applicableFamilies = categoryFamilyIdsForLibraryFilterTab(catalogType);
  const activeByFamily = activeValuesByFamily(categoryValues);
  const result: LibraryClassificationSelections = {};

  for (const familyId of applicableFamilies) {
    const selectedIds = new Set(unique(selections[familyId] ?? []));
    if (selectedIds.size === 0) continue;
    const validIds = (activeByFamily.get(familyId) ?? [])
      .map((value) => value.id)
      .filter((valueId) => selectedIds.has(valueId));
    if (validIds.length > 0) result[familyId] = validIds;
  }

  return result;
}

export function libraryClassificationSelectionsEqual(
  first: LibraryClassificationSelections,
  second: LibraryClassificationSelections,
): boolean {
  const familyIds = new Set<CategoryFamilyId>([
    ...(Object.keys(first) as CategoryFamilyId[]),
    ...(Object.keys(second) as CategoryFamilyId[]),
  ]);
  for (const familyId of familyIds) {
    const firstValues = first[familyId] ?? [];
    const secondValues = second[familyId] ?? [];
    if (firstValues.length !== secondValues.length) return false;
    if (firstValues.some((value, index) => value !== secondValues[index])) return false;
  }
  return true;
}

export function hasLibraryClassificationSelections(
  selections: LibraryClassificationSelections,
): boolean {
  return Object.values(selections).some((values) => (values?.length ?? 0) > 0);
}

export function updateLibraryClassificationSelection(
  selections: LibraryClassificationSelections,
  familyId: CategoryFamilyId,
  categoryValueId: string,
  selected: boolean,
): LibraryClassificationSelections {
  const nextIds = new Set(selections[familyId] ?? []);
  if (selected) nextIds.add(categoryValueId);
  else nextIds.delete(categoryValueId);

  const next = { ...selections };
  if (nextIds.size > 0) next[familyId] = [...nextIds];
  else delete next[familyId];
  return next;
}

function itemValueIds(item: LibraryCatalogItemView, familyId: CategoryFamilyId): readonly string[] {
  return (
    item.classificationGroups
      .find((group) => group.familyId === familyId)
      ?.values.map((value) => value.id) ?? []
  );
}

function matchesSelections(
  item: LibraryCatalogItemView,
  selections: LibraryClassificationSelections,
  ignoredFamilyId?: CategoryFamilyId,
): boolean {
  for (const [rawFamilyId, selectedIds] of Object.entries(selections)) {
    const familyId = rawFamilyId as CategoryFamilyId;
    if (familyId === ignoredFamilyId || !selectedIds || selectedIds.length === 0) continue;
    const assignedIds = itemValueIds(item, familyId);
    if (!selectedIds.some((selectedId) => assignedIds.includes(selectedId))) return false;
  }
  return true;
}

export function filterLibraryCatalogItemsByClassifications(
  items: readonly LibraryCatalogItemView[],
  selections: LibraryClassificationSelections,
): LibraryCatalogItemView[] {
  return items.filter((item) => matchesSelections(item, selections));
}

export function buildLibraryClassificationFacetModel({
  items,
  categoryValues,
  filters,
  selections,
}: {
  items: readonly LibraryCatalogItemView[];
  categoryValues: readonly CategoryValue[];
  filters: LibraryCatalogFilters;
  selections: LibraryClassificationSelections;
}): LibraryClassificationFacetModel {
  const normalizedSelections = pruneLibraryClassificationSelections(
    selections,
    filters.catalogType,
    categoryValues,
  );
  const baseItems = filterLibraryCatalogItems(items, filters);
  const visibleItems = filterLibraryCatalogItemsByClassifications(baseItems, normalizedSelections);
  const activeByFamily = activeValuesByFamily(categoryValues);

  const groups = categoryFamilyIdsForLibraryFilterTab(filters.catalogType)
    .map((familyId): LibraryClassificationFacetGroupView | null => {
      const selectedIds = new Set(normalizedSelections[familyId] ?? []);
      const candidateItems = baseItems.filter((item) =>
        matchesSelections(item, normalizedSelections, familyId),
      );
      const values = (activeByFamily.get(familyId) ?? [])
        .map((value): LibraryClassificationFacetValueView => {
          const count = candidateItems.filter((item) =>
            itemValueIds(item, familyId).includes(value.id),
          ).length;
          return {
            id: value.id,
            name: value.name,
            count,
            selected: selectedIds.has(value.id),
          };
        })
        .filter((value) => value.count > 0 || value.selected);

      if (values.length === 0) return null;
      return {
        familyId,
        familyLabel: getCategoryFamily(familyId).label,
        values,
      };
    })
    .filter((group): group is LibraryClassificationFacetGroupView => Boolean(group));

  return {
    selections: normalizedSelections,
    visibleItems,
    groups,
  };
}

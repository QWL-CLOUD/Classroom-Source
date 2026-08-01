import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';

import { classroomDb } from '@/data/db/ClassroomDatabase';
import type { CategoryAssignableEntityType, CategoryFamilyId } from '@/domain/models/entities';

import {
  loadCategorySelectionSnapshot,
  type CategorySelectionMap,
} from './categoryAssignmentSelection';

function cloneSelections(selections: CategorySelectionMap): CategorySelectionMap {
  const clone: CategorySelectionMap = {};
  for (const [familyId, values] of Object.entries(selections)) {
    if (values !== undefined) clone[familyId as CategoryFamilyId] = [...values];
  }
  return clone;
}

function selectionKey(selections: CategorySelectionMap): string {
  return JSON.stringify(
    Object.entries(selections)
      .map(([familyId, values]) => [familyId, [...(values ?? [])].sort()] as const)
      .sort(([first], [second]) => first.localeCompare(second)),
  );
}

export function useCategorySelectionDraft(
  entityType: CategoryAssignableEntityType,
  entityId?: string,
  allowedFamilyIds?: readonly CategoryFamilyId[],
) {
  const allowedKey = [...(allowedFamilyIds ?? [])].sort().join('|');
  const snapshot = useLiveQuery(
    () => loadCategorySelectionSnapshot(classroomDb, entityType, entityId, allowedFamilyIds),
    [entityType, entityId, allowedKey],
  );
  const [selections, setSelections] = useState<CategorySelectionMap>({});
  const [initializedKey, setInitializedKey] = useState<string | null>(null);
  const snapshotKey = snapshot ? selectionKey(snapshot.initialSelections) : null;

  useEffect(() => {
    if (!snapshot || snapshotKey === null) return;
    const entityKey = `${entityType}:${entityId ?? 'new'}:${allowedKey}:${snapshotKey}`;
    if (initializedKey === entityKey) return;
    setSelections(cloneSelections(snapshot.initialSelections));
    setInitializedKey(entityKey);
  }, [allowedKey, entityId, entityType, initializedKey, snapshot, snapshotKey]);

  const selectedSets = useMemo(() => {
    const sets: Partial<Record<CategoryFamilyId, Set<string>>> = {};
    for (const family of snapshot?.families ?? []) {
      sets[family.family.id] = new Set(selections[family.family.id] ?? []);
    }
    return sets;
  }, [selections, snapshot]);

  function toggle(familyId: CategoryFamilyId, valueId: string, checked: boolean): void {
    setSelections((current) => {
      const currentValues = current[familyId] ?? [];
      const family = snapshot?.families.find((item) => item.family.id === familyId);
      const nextValues = checked
        ? family?.family.selectionMode === 'single'
          ? [valueId]
          : [...new Set([...currentValues, valueId])]
        : currentValues.filter((id) => id !== valueId);
      return { ...current, [familyId]: nextValues };
    });
  }

  function reset(): void {
    if (!snapshot) return;
    setSelections(cloneSelections(snapshot.initialSelections));
  }

  return {
    snapshot,
    selections,
    selectedSets,
    ready: Boolean(snapshot),
    toggle,
    reset,
  };
}

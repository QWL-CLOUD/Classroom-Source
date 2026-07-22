import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';

import { classroomDb } from '@/data/db/ClassroomDatabase';
import type { CategoryAssignableEntityType, CategoryFamilyId } from '@/domain/models/entities';

import {
  loadCategorySelectionSnapshot,
  type CategorySelectionMap,
} from './categoryAssignmentSelection';
import { CATEGORY_FAMILIES } from './categoryFamilies';

function cloneSelections(selections: CategorySelectionMap): CategorySelectionMap {
  const clone: CategorySelectionMap = {};
  for (const family of CATEGORY_FAMILIES) {
    const values = selections[family.id];
    if (values !== undefined) clone[family.id] = [...values];
  }
  return clone;
}

function selectionKey(selections: CategorySelectionMap): string {
  return JSON.stringify(
    CATEGORY_FAMILIES.map((family) => [family.id, [...(selections[family.id] ?? [])].sort()]),
  );
}

export function useCategorySelectionDraft(
  entityType: CategoryAssignableEntityType,
  entityId?: string,
) {
  const snapshot = useLiveQuery(
    () => loadCategorySelectionSnapshot(classroomDb, entityType, entityId),
    [entityType, entityId],
  );
  const [selections, setSelections] = useState<CategorySelectionMap>({});
  const [initializedKey, setInitializedKey] = useState<string | null>(null);
  const snapshotKey = snapshot ? selectionKey(snapshot.initialSelections) : null;

  useEffect(() => {
    if (!snapshot || snapshotKey === null) return;
    const entityKey = `${entityType}:${entityId ?? 'new'}:${snapshotKey}`;
    if (initializedKey === entityKey) return;
    setSelections(cloneSelections(snapshot.initialSelections));
    setInitializedKey(entityKey);
  }, [entityId, entityType, initializedKey, snapshot, snapshotKey]);

  const selectedSets = useMemo(() => {
    const sets: Partial<Record<CategoryFamilyId, Set<string>>> = {};
    for (const family of CATEGORY_FAMILIES) {
      sets[family.id] = new Set(selections[family.id] ?? []);
    }
    return sets;
  }, [selections]);

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

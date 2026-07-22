import type { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  categoryAssignmentSchema,
  categoryValueSchema,
  type CategoryAssignableEntityType,
  type CategoryAssignment,
  type CategoryFamilyId,
  type CategoryValue,
} from '@/domain/models/entities';

import {
  deleteCategoryAssignmentOperation,
  putCategoryAssignmentOperation,
  type CategoryAssignmentOperation,
} from './categoryCommands';
import {
  CATEGORY_FAMILIES,
  categoryFamilySupportsEntity,
  type CategoryFamilyDefinition,
} from './categoryFamilies';

export type CategorySelectionMap = Partial<Record<CategoryFamilyId, readonly string[]>>;

export interface CategorySelectionFamilySnapshot {
  family: CategoryFamilyDefinition;
  values: CategoryValue[];
  selectedValueIds: string[];
}

export interface CategorySelectionSnapshot {
  entityType: CategoryAssignableEntityType;
  entityId?: string;
  families: CategorySelectionFamilySnapshot[];
  initialSelections: CategorySelectionMap;
}

export interface CategoryAssignmentChangePlan {
  forward: CategoryAssignmentOperation[];
  inverse: CategoryAssignmentOperation[];
}

export interface BuildCategoryAssignmentChangePlanOptions {
  selections?: CategorySelectionMap;
  useDefaultsForMissingFamilies?: boolean;
  createId: () => string;
  now: string;
}

function lifecycleRank(value: CategoryValue): number {
  if (value.lifecycleState === 'active') return 0;
  if (value.lifecycleState === 'archived') return 1;
  return 2;
}

function compareValues(first: CategoryValue, second: CategoryValue): number {
  return (
    lifecycleRank(first) - lifecycleRank(second) ||
    first.sortOrder - second.sortOrder ||
    first.name.localeCompare(second.name, 'en', { sensitivity: 'base' }) ||
    first.id.localeCompare(second.id)
  );
}

function supportedFamilies(entityType: CategoryAssignableEntityType): CategoryFamilyDefinition[] {
  return CATEGORY_FAMILIES.filter(
    (family) =>
      family.assignmentAvailability === 'current' &&
      categoryFamilySupportsEntity(family.id, entityType),
  );
}

function uniqueIds(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).filter(Boolean))];
}

function hasOwnSelection(
  selections: CategorySelectionMap | undefined,
  familyId: CategoryFamilyId,
): boolean {
  return Boolean(selections && Object.prototype.hasOwnProperty.call(selections, familyId));
}

async function listEntityAssignments(
  db: ClassroomDatabase,
  entityType: CategoryAssignableEntityType,
  entityId: string | undefined,
): Promise<CategoryAssignment[]> {
  if (!entityId) return [];
  return (
    await db.categoryAssignments
      .where('[entityType+entityId]')
      .equals([entityType, entityId])
      .toArray()
  ).map((assignment) => categoryAssignmentSchema.parse(assignment));
}

export async function loadCategorySelectionSnapshot(
  db: ClassroomDatabase,
  entityType: CategoryAssignableEntityType,
  entityId?: string,
): Promise<CategorySelectionSnapshot> {
  const families = supportedFamilies(entityType);
  const familyIds = new Set(families.map((family) => family.id));
  const [allValues, allAssignments] = await Promise.all([
    db.categoryValues.toArray(),
    listEntityAssignments(db, entityType, entityId),
  ]);
  const values = allValues
    .map((value) => categoryValueSchema.parse(value))
    .filter((value) => familyIds.has(value.familyId));
  const assignments = allAssignments.filter((assignment) => familyIds.has(assignment.familyId));
  const initialSelections: CategorySelectionMap = {};

  const snapshots = families.map((family): CategorySelectionFamilySnapshot => {
    const familyValues = values.filter((value) => value.familyId === family.id).sort(compareValues);
    const assignedIds = assignments
      .filter((assignment) => assignment.familyId === family.id)
      .map((assignment) => assignment.categoryValueId);
    const selectedValueIds = entityId
      ? uniqueIds(assignedIds)
      : familyValues
          .filter((value) => value.lifecycleState === 'active' && value.isDefault)
          .map((value) => value.id);
    initialSelections[family.id] = selectedValueIds;
    const selectedIds = new Set(selectedValueIds);
    return {
      family,
      values: familyValues.filter(
        (value) => value.lifecycleState === 'active' || selectedIds.has(value.id),
      ),
      selectedValueIds,
    };
  });

  return { entityType, entityId, families: snapshots, initialSelections };
}

export async function buildCategoryAssignmentChangePlan(
  db: ClassroomDatabase,
  entityType: CategoryAssignableEntityType,
  entityId: string,
  options: BuildCategoryAssignmentChangePlanOptions,
): Promise<CategoryAssignmentChangePlan> {
  const families = supportedFamilies(entityType);
  const familyIds = new Set(families.map((family) => family.id));
  const [allValues, existingAssignments] = await Promise.all([
    db.categoryValues.toArray(),
    listEntityAssignments(db, entityType, entityId),
  ]);
  const values = allValues
    .map((value) => categoryValueSchema.parse(value))
    .filter((value) => familyIds.has(value.familyId));
  const existing = existingAssignments.filter((assignment) => familyIds.has(assignment.familyId));
  const valueById = new Map<string, CategoryValue>(
    values.map((value): [string, CategoryValue] => [value.id, value]),
  );
  const existingByFamily = new Map<CategoryFamilyId, CategoryAssignment[]>();
  for (const assignment of existing) {
    const group = existingByFamily.get(assignment.familyId) ?? [];
    group.push(assignment);
    existingByFamily.set(assignment.familyId, group);
  }

  const forward: CategoryAssignmentOperation[] = [];
  const inverse: CategoryAssignmentOperation[] = [];

  for (const family of families) {
    const familyExisting = existingByFamily.get(family.id) ?? [];
    const existingIds = familyExisting.map((assignment) => assignment.categoryValueId);
    let requestedIds: string[];
    if (hasOwnSelection(options.selections, family.id)) {
      requestedIds = uniqueIds(options.selections?.[family.id]);
    } else if (options.useDefaultsForMissingFamilies) {
      requestedIds = values
        .filter(
          (value) =>
            value.familyId === family.id && value.lifecycleState === 'active' && value.isDefault,
        )
        .map((value) => value.id);
    } else {
      requestedIds = uniqueIds(existingIds);
    }

    if (family.selectionMode === 'single' && requestedIds.length > 1) {
      throw new Error(`${family.label} allows only one selected value.`);
    }

    const existingIdSet = new Set(existingIds);
    for (const categoryValueId of requestedIds) {
      const value = valueById.get(categoryValueId);
      if (!value || value.familyId !== family.id) {
        throw new Error(`A selected ${family.label} value no longer exists.`);
      }
      if (value.lifecycleState !== 'active' && !existingIdSet.has(value.id)) {
        throw new Error(`Archived ${family.label} values cannot be newly assigned.`);
      }
      if (value.lifecycleState === 'merged') {
        throw new Error(`Merged ${family.label} values cannot remain assigned.`);
      }
    }

    const requestedSet = new Set(requestedIds);
    for (const assignment of familyExisting) {
      if (requestedSet.has(assignment.categoryValueId)) continue;
      forward.push(deleteCategoryAssignmentOperation(assignment.id));
      inverse.unshift(putCategoryAssignmentOperation(assignment));
    }

    for (const categoryValueId of requestedIds) {
      if (existingIdSet.has(categoryValueId)) continue;
      const assignment = categoryAssignmentSchema.parse({
        id: options.createId(),
        familyId: family.id,
        categoryValueId,
        entityType,
        entityId,
        createdAt: options.now,
      });
      forward.push(putCategoryAssignmentOperation(assignment));
      inverse.unshift(deleteCategoryAssignmentOperation(assignment.id));
    }
  }

  return { forward, inverse };
}

export async function listCategoryAssignmentsForDeletion(
  db: ClassroomDatabase,
  entityType: CategoryAssignableEntityType,
  entityId: string,
): Promise<CategoryAssignment[]> {
  return listEntityAssignments(db, entityType, entityId);
}

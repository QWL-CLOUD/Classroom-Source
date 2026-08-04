import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  categoryAssignmentSchema,
  categoryValueSchema,
  classificationMappingPresetSchema,
  type CategoryAssignment,
  type CategoryValue,
  type ClassificationMappingPreset,
} from '@/domain/models/entities';
import type {
  CategoryAssignmentQuery,
  ClassificationMappingPresetQuery,
  CategoryRepository,
  CategoryValueQuery,
} from '@/domain/repositories/CategoryRepository';

function compareValues(first: CategoryValue, second: CategoryValue): number {
  return (
    first.familyId.localeCompare(second.familyId) ||
    first.sortOrder - second.sortOrder ||
    first.name.localeCompare(second.name, 'en', { sensitivity: 'base' }) ||
    first.id.localeCompare(second.id)
  );
}

function compareAssignments(first: CategoryAssignment, second: CategoryAssignment): number {
  return (
    first.entityType.localeCompare(second.entityType) ||
    first.entityId.localeCompare(second.entityId) ||
    first.familyId.localeCompare(second.familyId) ||
    first.categoryValueId.localeCompare(second.categoryValueId) ||
    first.id.localeCompare(second.id)
  );
}

function compareMappingPresets(
  first: ClassificationMappingPreset,
  second: ClassificationMappingPreset,
): number {
  return (
    first.familyId.localeCompare(second.familyId) ||
    first.sourceText.localeCompare(second.sourceText, 'en', { sensitivity: 'base' }) ||
    first.id.localeCompare(second.id)
  );
}

export class DexieCategoryRepository implements CategoryRepository {
  constructor(private readonly db: ClassroomDatabase = classroomDb) {}

  async listValues(query: CategoryValueQuery = {}): Promise<CategoryValue[]> {
    const source = query.familyId
      ? await this.db.categoryValues.where('familyId').equals(query.familyId).toArray()
      : await this.db.categoryValues.toArray();
    return source
      .map((value) => categoryValueSchema.parse(value))
      .filter(
        (value) =>
          (!query.familyId || value.familyId === query.familyId) &&
          (!query.lifecycleStates || query.lifecycleStates.includes(value.lifecycleState)),
      )
      .sort(compareValues);
  }

  async getValue(id: string): Promise<CategoryValue | null> {
    const value = await this.db.categoryValues.get(id);
    return value ? categoryValueSchema.parse(value) : null;
  }

  async listAssignments(query: CategoryAssignmentQuery = {}): Promise<CategoryAssignment[]> {
    let source: CategoryAssignment[];
    if (query.categoryValueId) {
      source = await this.db.categoryAssignments
        .where('categoryValueId')
        .equals(query.categoryValueId)
        .toArray();
    } else if (query.entityType && query.entityId) {
      source = await this.db.categoryAssignments
        .where('[entityType+entityId]')
        .equals([query.entityType, query.entityId])
        .toArray();
    } else {
      source = await this.db.categoryAssignments.toArray();
    }

    return source
      .map((assignment) => categoryAssignmentSchema.parse(assignment))
      .filter(
        (assignment) =>
          (!query.categoryValueId || assignment.categoryValueId === query.categoryValueId) &&
          (!query.familyId || assignment.familyId === query.familyId) &&
          (!query.entityType || assignment.entityType === query.entityType) &&
          (!query.entityId || assignment.entityId === query.entityId),
      )
      .sort(compareAssignments);
  }

  async countAssignments(categoryValueId: string): Promise<number> {
    return this.db.categoryAssignments.where('categoryValueId').equals(categoryValueId).count();
  }

  async countMergedSources(categoryValueId: string): Promise<number> {
    return this.db.categoryValues.where('mergedIntoId').equals(categoryValueId).count();
  }

  async listMappingPresets(
    query: ClassificationMappingPresetQuery = {},
  ): Promise<ClassificationMappingPreset[]> {
    let source: ClassificationMappingPreset[];
    if (query.targetCategoryValueId) {
      source = await this.db.classificationMappingPresets
        .where('targetCategoryValueId')
        .equals(query.targetCategoryValueId)
        .toArray();
    } else if (query.familyId && query.status) {
      source = await this.db.classificationMappingPresets
        .where('[familyId+status]')
        .equals([query.familyId, query.status])
        .toArray();
    } else if (query.familyId) {
      source = await this.db.classificationMappingPresets
        .where('familyId')
        .equals(query.familyId)
        .toArray();
    } else {
      source = await this.db.classificationMappingPresets.toArray();
    }

    return source
      .map((preset) => classificationMappingPresetSchema.parse(preset))
      .filter(
        (preset) =>
          (!query.familyId || preset.familyId === query.familyId) &&
          (!query.status || preset.status === query.status) &&
          (!query.targetCategoryValueId ||
            preset.targetCategoryValueId === query.targetCategoryValueId),
      )
      .sort(compareMappingPresets);
  }

  async getMappingPreset(id: string): Promise<ClassificationMappingPreset | null> {
    const preset = await this.db.classificationMappingPresets.get(id);
    return preset ? classificationMappingPresetSchema.parse(preset) : null;
  }

  async countMappingPresets(
    categoryValueId: string,
    status?: ClassificationMappingPreset['status'],
  ): Promise<number> {
    const values = await this.db.classificationMappingPresets
      .where('targetCategoryValueId')
      .equals(categoryValueId)
      .toArray();
    return status
      ? values.filter((value) => classificationMappingPresetSchema.parse(value).status === status)
          .length
      : values.length;
  }
}

export const categoryRepository = new DexieCategoryRepository();

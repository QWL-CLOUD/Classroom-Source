import type {
  CategoryAssignableEntityType,
  CategoryAssignment,
  CategoryFamilyId,
  CategoryValue,
  ClassificationMappingPreset,
  ClassificationMappingPresetStatus,
  CategoryValueLifecycleState,
} from '@/domain/models/entities';

export interface CategoryValueQuery {
  familyId?: CategoryFamilyId;
  lifecycleStates?: readonly CategoryValueLifecycleState[];
}

export interface ClassificationMappingPresetQuery {
  familyId?: CategoryFamilyId;
  status?: ClassificationMappingPresetStatus;
  targetCategoryValueId?: string;
}

export interface CategoryAssignmentQuery {
  categoryValueId?: string;
  familyId?: CategoryFamilyId;
  entityType?: CategoryAssignableEntityType;
  entityId?: string;
}

export interface CategoryRepository {
  listValues(query?: CategoryValueQuery): Promise<CategoryValue[]>;
  getValue(id: string): Promise<CategoryValue | null>;
  listAssignments(query?: CategoryAssignmentQuery): Promise<CategoryAssignment[]>;
  countAssignments(categoryValueId: string): Promise<number>;
  countMergedSources(categoryValueId: string): Promise<number>;
  listMappingPresets(
    query?: ClassificationMappingPresetQuery,
  ): Promise<ClassificationMappingPreset[]>;
  getMappingPreset(id: string): Promise<ClassificationMappingPreset | null>;
  countMappingPresets(
    categoryValueId: string,
    status?: ClassificationMappingPresetStatus,
  ): Promise<number>;
}

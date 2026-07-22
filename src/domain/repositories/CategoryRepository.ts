import type {
  CategoryAssignableEntityType,
  CategoryAssignment,
  CategoryFamilyId,
  CategoryValue,
  CategoryValueLifecycleState,
} from '@/domain/models/entities';

export interface CategoryValueQuery {
  familyId?: CategoryFamilyId;
  lifecycleStates?: readonly CategoryValueLifecycleState[];
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
}

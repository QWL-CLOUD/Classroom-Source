import type {
  CategoryAssignableEntityType,
  CategoryAssignment,
  CategoryFamilyId,
  CategoryValue,
} from '@/domain/models/entities';
import type { CategoryRepository } from '@/domain/repositories/CategoryRepository';
import { categoryRepository } from '@/data/repositories/DexieCategoryRepository';

import { CATEGORY_FAMILIES, type CategoryFamilyDefinition } from './categoryFamilies';
import { normalizeCategoryName } from './categoryNormalization';

export interface CategoryResolution {
  requested: string;
  matchedBy: 'id' | 'name' | 'alias';
  matchedValueId: string;
  value: CategoryValue;
}

export interface CategoryUsageSummary {
  total: number;
  byEntityType: Partial<Record<CategoryAssignableEntityType, number>>;
  mergedSourceCount: number;
}

export class CategoryReadService {
  constructor(private readonly repository: CategoryRepository = categoryRepository) {}

  listFamilies(): readonly CategoryFamilyDefinition[] {
    return CATEGORY_FAMILIES;
  }

  async listValues(
    familyId: CategoryFamilyId,
    options: { includeArchived?: boolean; includeMerged?: boolean } = {},
  ): Promise<CategoryValue[]> {
    const lifecycleStates: Array<CategoryValue['lifecycleState']> = ['active'];
    if (options.includeArchived) lifecycleStates.push('archived');
    if (options.includeMerged) lifecycleStates.push('merged');
    return this.repository.listValues({ familyId, lifecycleStates });
  }

  async listSelectableValues(familyId: CategoryFamilyId): Promise<CategoryValue[]> {
    return this.repository.listValues({ familyId, lifecycleStates: ['active'] });
  }

  async listAssignmentsForEntity(
    entityType: CategoryAssignableEntityType,
    entityId: string,
    familyId?: CategoryFamilyId,
  ): Promise<CategoryAssignment[]> {
    return this.repository.listAssignments({ entityType, entityId, familyId });
  }

  async getUsageSummary(categoryValueId: string): Promise<CategoryUsageSummary> {
    const assignments = await this.repository.listAssignments({ categoryValueId });
    const byEntityType: CategoryUsageSummary['byEntityType'] = {};
    for (const assignment of assignments) {
      byEntityType[assignment.entityType] = (byEntityType[assignment.entityType] ?? 0) + 1;
    }
    return {
      total: assignments.length,
      byEntityType,
      mergedSourceCount: await this.repository.countMergedSources(categoryValueId),
    };
  }

  async resolveReference(
    familyId: CategoryFamilyId,
    reference: string,
  ): Promise<CategoryResolution | null> {
    const values = await this.repository.listValues({ familyId });
    const byId = new Map(values.map((value) => [value.id, value]));
    const normalized = normalizeCategoryName(reference);
    const direct = byId.get(reference);
    let matched = direct;
    let matchedBy: CategoryResolution['matchedBy'] = 'id';

    if (!matched) {
      matched = values.find((value) => value.normalizedName === normalized);
      matchedBy = 'name';
    }
    if (!matched) {
      matched = values.find((value) => value.normalizedAliases.includes(normalized));
      matchedBy = 'alias';
    }
    if (!matched) return null;

    const resolved = this.followMergedTarget(matched, byId);
    return {
      requested: reference,
      matchedBy,
      matchedValueId: matched.id,
      value: resolved,
    };
  }

  private followMergedTarget(
    initial: CategoryValue,
    byId: ReadonlyMap<string, CategoryValue>,
  ): CategoryValue {
    let current = initial;
    const visited = new Set<string>();
    while (current.lifecycleState === 'merged') {
      if (!current.mergedIntoId || visited.has(current.id)) {
        throw new Error('Category merge history contains a cycle or missing target.');
      }
      visited.add(current.id);
      const target = byId.get(current.mergedIntoId);
      if (!target) throw new Error('Category merge history references a missing target.');
      current = target;
    }
    return current;
  }
}

export const categoryReadService = new CategoryReadService();

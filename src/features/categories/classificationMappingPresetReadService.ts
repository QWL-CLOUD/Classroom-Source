import { categoryRepository } from '@/data/repositories/DexieCategoryRepository';
import type {
  CategoryFamilyId,
  CategoryValue,
  ClassificationMappingPreset,
} from '@/domain/models/entities';
import type { CategoryRepository } from '@/domain/repositories/CategoryRepository';

import { normalizeCategoryName } from './categoryNormalization';

export type ClassificationMappingPresetHealth =
  | 'ready'
  | 'inactive'
  | 'shadowed-by-canonical'
  | 'target-archived'
  | 'target-merged'
  | 'target-missing'
  | 'wrong-family';

export interface ClassificationMappingPresetWorkspaceItem {
  preset: ClassificationMappingPreset;
  target: CategoryValue | null;
  health: ClassificationMappingPresetHealth;
}

function compareItems(
  first: ClassificationMappingPresetWorkspaceItem,
  second: ClassificationMappingPresetWorkspaceItem,
): number {
  return (
    first.preset.sourceText.localeCompare(second.preset.sourceText, 'en', {
      sensitivity: 'base',
    }) || first.preset.id.localeCompare(second.preset.id)
  );
}

export class ClassificationMappingPresetReadService {
  constructor(private readonly repository: CategoryRepository = categoryRepository) {}

  async listForFamily(
    familyId: CategoryFamilyId,
  ): Promise<ClassificationMappingPresetWorkspaceItem[]> {
    const [presets, values] = await Promise.all([
      this.repository.listMappingPresets({ familyId }),
      this.repository.listValues(),
    ]);
    const valuesById = new Map(values.map((value) => [value.id, value]));
    const familyValues = values.filter((value) => value.familyId === familyId);

    return presets
      .map((preset) => {
        const target = valuesById.get(preset.targetCategoryValueId) ?? null;
        return {
          preset,
          target,
          health: this.healthFor(preset, target, familyValues),
        } satisfies ClassificationMappingPresetWorkspaceItem;
      })
      .sort(compareItems);
  }

  async getDependencyCounts(categoryValueId: string): Promise<{
    total: number;
    active: number;
  }> {
    const [total, active] = await Promise.all([
      this.repository.countMappingPresets(categoryValueId),
      this.repository.countMappingPresets(categoryValueId, 'active'),
    ]);
    return { total, active };
  }

  private healthFor(
    preset: ClassificationMappingPreset,
    target: CategoryValue | null,
    values: readonly CategoryValue[],
  ): ClassificationMappingPresetHealth {
    if (!target) return 'target-missing';
    if (target.familyId !== preset.familyId) return 'wrong-family';
    if (target.lifecycleState === 'archived') return 'target-archived';
    if (target.lifecycleState === 'merged') return 'target-merged';

    const shadowed = values.some(
      (value) =>
        value.lifecycleState === 'active' &&
        (value.normalizedName === preset.normalizedSourceText ||
          value.normalizedAliases.includes(preset.normalizedSourceText)),
    );
    if (shadowed) return 'shadowed-by-canonical';
    if (preset.status === 'inactive') return 'inactive';
    return 'ready';
  }
}

export function classificationMappingPresetHealthLabel(
  health: ClassificationMappingPresetHealth,
): string {
  if (health === 'ready') return 'Ready';
  if (health === 'inactive') return 'Inactive';
  if (health === 'shadowed-by-canonical') return 'Shadowed by controlled vocabulary';
  if (health === 'target-archived') return 'Target archived';
  if (health === 'target-merged') return 'Target merged';
  if (health === 'wrong-family') return 'Wrong family';
  return 'Target missing';
}

export function normalizedMappingSource(value: string): string {
  return normalizeCategoryName(value);
}

export const classificationMappingPresetReadService = new ClassificationMappingPresetReadService();

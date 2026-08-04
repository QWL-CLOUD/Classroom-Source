import type { CategoryColorKey, CategoryIconKey, CategoryValue } from '@/domain/models/entities';

import type { CategoryUsageSummary } from './categoryReadService';

export type CategoryWorkspaceView = 'active' | 'archived' | 'history';

export interface CategoryWorkspaceItem {
  value: CategoryValue;
  usage: CategoryUsageSummary;
}

export const CATEGORY_COLOR_OPTIONS: ReadonlyArray<{
  value: CategoryColorKey;
  label: string;
}> = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'blue', label: 'Blue' },
  { value: 'teal', label: 'Teal' },
  { value: 'green', label: 'Green' },
  { value: 'amber', label: 'Amber' },
  { value: 'orange', label: 'Orange' },
  { value: 'red', label: 'Red' },
  { value: 'pink', label: 'Pink' },
  { value: 'purple', label: 'Purple' },
  { value: 'indigo', label: 'Indigo' },
];

export const CATEGORY_ICON_OPTIONS: ReadonlyArray<{
  value: CategoryIconKey;
  label: string;
}> = [
  { value: 'tag', label: 'Tag' },
  { value: 'focus', label: 'Focus' },
  { value: 'target', label: 'Target' },
  { value: 'shapes', label: 'Shapes' },
  { value: 'file', label: 'File' },
  { value: 'check-square', label: 'Check square' },
  { value: 'heart-handshake', label: 'Support' },
  { value: 'book-open', label: 'Book' },
  { value: 'star', label: 'Star' },
  { value: 'flag', label: 'Flag' },
  { value: 'bookmark', label: 'Bookmark' },
  { value: 'palette', label: 'Palette' },
];

export function filterCategoryWorkspaceItems(
  items: readonly CategoryWorkspaceItem[],
  view: CategoryWorkspaceView,
): CategoryWorkspaceItem[] {
  const lifecycleState = view === 'history' ? 'merged' : view;
  return items.filter((item) => item.value.lifecycleState === lifecycleState);
}

export function categoryUsageLabel(usage: CategoryUsageSummary): string {
  const parts: string[] = [];
  if (usage.total > 0) parts.push(`${usage.total} ${usage.total === 1 ? 'use' : 'uses'}`);
  const mappingPresetCount = usage.mappingPresetCount ?? 0;
  if (mappingPresetCount > 0) {
    parts.push(`${mappingPresetCount} import ${mappingPresetCount === 1 ? 'mapping' : 'mappings'}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Not in use';
}

export function canArchiveDirectly(item: CategoryWorkspaceItem): boolean {
  return (
    item.usage.total === 0 &&
    item.usage.mergedSourceCount === 0 &&
    (item.usage.activeMappingPresetCount ?? 0) === 0
  );
}

export function canDeleteDirectly(item: CategoryWorkspaceItem): boolean {
  return (
    item.usage.total === 0 &&
    item.usage.mergedSourceCount === 0 &&
    (item.usage.mappingPresetCount ?? 0) === 0
  );
}

export function replacementGuidance(item: CategoryWorkspaceItem): string {
  if (item.usage.mergedSourceCount > 0) {
    return `${item.usage.mergedSourceCount} historical ${
      item.usage.mergedSourceCount === 1 ? 'value resolves' : 'values resolve'
    } through this value. Merge it into the replacement to preserve those aliases.`;
  }
  const dependencies: string[] = [];
  if (item.usage.total > 0) {
    dependencies.push(`${item.usage.total} ${item.usage.total === 1 ? 'use' : 'uses'}`);
  }
  const activeMappingPresetCount = item.usage.activeMappingPresetCount ?? 0;
  if (activeMappingPresetCount > 0) {
    dependencies.push(
      `${activeMappingPresetCount} active import ${
        activeMappingPresetCount === 1 ? 'mapping' : 'mappings'
      }`,
    );
  }
  if (dependencies.length > 0) {
    return `${dependencies.join(' and ')} will move to the replacement in one undoable transaction.`;
  }
  return 'This value can be archived without replacing any references.';
}

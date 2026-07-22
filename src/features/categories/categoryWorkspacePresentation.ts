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
  if (usage.total === 0) return 'Not in use';
  return `${usage.total} ${usage.total === 1 ? 'use' : 'uses'}`;
}

export function canArchiveDirectly(item: CategoryWorkspaceItem): boolean {
  return item.usage.total === 0 && item.usage.mergedSourceCount === 0;
}

export function replacementGuidance(item: CategoryWorkspaceItem): string {
  if (item.usage.mergedSourceCount > 0) {
    return `${item.usage.mergedSourceCount} historical ${
      item.usage.mergedSourceCount === 1 ? 'value resolves' : 'values resolve'
    } through this value. Merge it into the replacement to preserve those aliases.`;
  }
  if (item.usage.total > 0) {
    return `${categoryUsageLabel(item.usage)} must be moved to another value before this one can be archived.`;
  }
  return 'This value can be archived without replacing any references.';
}

import { describe, expect, it } from 'vitest';

import type { CategoryValue } from '@/domain/models/entities';

import {
  canArchiveDirectly,
  categoryUsageLabel,
  filterCategoryWorkspaceItems,
  replacementGuidance,
  type CategoryWorkspaceItem,
} from './categoryWorkspacePresentation';

const timestamp = '2026-07-22T01:00:00.000Z';

function item(
  id: string,
  lifecycleState: CategoryValue['lifecycleState'],
  total = 0,
  mergedSourceCount = 0,
): CategoryWorkspaceItem {
  return {
    value: {
      id,
      familyId: 'purpose-tag',
      name: id,
      normalizedName: id,
      aliases: [],
      normalizedAliases: [],
      sortOrder: 0,
      isDefault: false,
      lifecycleState,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: lifecycleState === 'archived' ? timestamp : undefined,
      mergedAt: lifecycleState === 'merged' ? timestamp : undefined,
      mergedIntoId: lifecycleState === 'merged' ? 'target' : undefined,
    },
    usage: { total, byEntityType: {}, mergedSourceCount },
  };
}

describe('category workspace presentation', () => {
  it('filters active, archived, and merge-history values without changing order', () => {
    const items = [item('active', 'active'), item('archived', 'archived'), item('old', 'merged')];
    expect(filterCategoryWorkspaceItems(items, 'active').map(({ value }) => value.id)).toEqual([
      'active',
    ]);
    expect(filterCategoryWorkspaceItems(items, 'archived').map(({ value }) => value.id)).toEqual([
      'archived',
    ]);
    expect(filterCategoryWorkspaceItems(items, 'history').map(({ value }) => value.id)).toEqual([
      'old',
    ]);
  });

  it('presents stable usage labels', () => {
    expect(categoryUsageLabel(item('unused', 'active').usage)).toBe('Not in use');
    expect(categoryUsageLabel(item('once', 'active', 1).usage)).toBe('1 use');
    expect(categoryUsageLabel(item('many', 'active', 4).usage)).toBe('4 uses');
  });

  it('only allows direct archive when no assignments or merge history depend on the value', () => {
    expect(canArchiveDirectly(item('unused', 'active'))).toBe(true);
    expect(canArchiveDirectly(item('assigned', 'active', 1))).toBe(false);
    expect(canArchiveDirectly(item('historical-target', 'active', 0, 1))).toBe(false);
  });

  it('explains whether assignments or alias history require a safe replacement path', () => {
    expect(replacementGuidance(item('assigned', 'active', 2))).toMatch(/2 uses/);
    expect(replacementGuidance(item('historical-target', 'active', 0, 2))).toMatch(
      /2 historical values resolve/,
    );
    expect(replacementGuidance(item('unused', 'active'))).toMatch(/without replacing/);
  });
});

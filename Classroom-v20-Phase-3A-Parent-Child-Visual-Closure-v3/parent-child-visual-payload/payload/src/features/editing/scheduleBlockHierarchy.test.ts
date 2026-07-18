import { describe, expect, it } from 'vitest';

import type { ScheduleBlock } from '@/domain/models/entities';
import {
  buildScheduleBlockHierarchy,
  buildScheduleBlockHierarchyMetadata,
  getScheduleBlockDescendantIds,
} from './scheduleBlockHierarchy';

function block(
  overrides: Partial<ScheduleBlock> & Pick<ScheduleBlock, 'id' | 'title'>,
): ScheduleBlock {
  return {
    id: overrides.id,
    title: overrides.title,
    subject: '',
    category: 'Schedule',
    kind: 'teachable',
    weekdays: [1],
    startMinute: 480,
    endMinute: 540,
    planningEnabled: false,
    bumpEnabled: false,
    showInWeek: true,
    sortOrder: 0,
    ...overrides,
  };
}

describe('Schedule Block hierarchy', () => {
  it('places parents before children and sorts siblings deterministically', () => {
    const entries = buildScheduleBlockHierarchy([
      block({
        id: 'child-b',
        title: 'B child',
        parentId: 'parent',
        sortOrder: 2,
      }),
      block({ id: 'other', title: 'Other', sortOrder: 3 }),
      block({ id: 'parent', title: 'Parent', kind: 'container', sortOrder: 1 }),
      block({
        id: 'child-a',
        title: 'A child',
        parentId: 'parent',
        sortOrder: 1,
      }),
    ]);

    expect(entries.map((entry) => entry.blockId)).toEqual([
      'parent',
      'child-a',
      'child-b',
      'other',
    ]);
    expect(entries[0]?.directChildCount).toBe(2);
    expect(entries[1]?.parentTitle).toBe('Parent');
  });

  it('keeps orphaned children visible and labels the missing relationship', () => {
    const [entry] = buildScheduleBlockHierarchy([
      block({ id: 'orphan', title: 'Orphan', parentId: 'missing' }),
    ]);

    expect(entry).toMatchObject({
      blockId: 'orphan',
      parentUnavailable: true,
      visualDepth: 1,
    });
  });

  it('keeps an invalid self-parent record visible as a root', () => {
    const [entry] = buildScheduleBlockHierarchy([
      block({ id: 'self', title: 'Self', parentId: 'self' }),
    ]);

    expect(entry).toMatchObject({
      blockId: 'self',
      parentTitle: undefined,
      parentUnavailable: false,
      visualDepth: 0,
    });
  });

  it('returns every descendant so the editor can exclude cycle-forming parents', () => {
    const blocks = [
      block({ id: 'root', title: 'Root' }),
      block({ id: 'child', title: 'Child', parentId: 'root' }),
      block({ id: 'grandchild', title: 'Grandchild', parentId: 'child' }),
    ];

    expect([...getScheduleBlockDescendantIds(blocks, 'root')].sort()).toEqual([
      'child',
      'grandchild',
    ]);
  });

  it('uses the same stable group tone for a parent and its descendants', () => {
    const metadata = buildScheduleBlockHierarchyMetadata([
      block({ id: 'root', title: 'Root' }),
      block({ id: 'child', title: 'Child', parentId: 'root' }),
    ]);

    expect(metadata.get('child')?.groupTone).toBe(metadata.get('root')?.groupTone);
  });

  it('excludes archived records from child counts and hierarchy output', () => {
    const entries = buildScheduleBlockHierarchy([
      block({ id: 'root', title: 'Root' }),
      block({ id: 'active', title: 'Active', parentId: 'root' }),
      block({
        id: 'archived',
        title: 'Archived',
        parentId: 'root',
        archivedAt: '2026-07-17',
      }),
    ]);

    expect(entries.map((entry) => entry.blockId)).toEqual(['root', 'active']);
    expect(entries[0]?.directChildCount).toBe(1);
  });
});

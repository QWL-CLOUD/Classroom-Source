import { describe, expect, it } from 'vitest';

import type { ScheduleBlock } from '@/domain/models/entities';

import {
  assertScheduleBlockCanBeArchived,
  assertValidScheduleBlockParent,
} from './scheduleBlockGraph';

function block(id: string, parentId?: string): ScheduleBlock {
  return {
    id,
    parentId,
    title: id,
    subject: '',
    category: 'Teaching',
    kind: 'teachable',
    weekdays: [1],
    startMinute: 540,
    endMinute: 600,
    planningEnabled: false,
    bumpEnabled: false,
    showInWeek: true,
    sortOrder: 0,
  };
}

describe('scheduleBlockGraph', () => {
  it('prevents self-parenting and descendant cycles', () => {
    const blocks = [block('parent'), block('child', 'parent'), block('grandchild', 'child')];

    expect(() => assertValidScheduleBlockParent(blocks, 'parent', 'parent')).toThrow(
      'cannot be its own parent',
    );
    expect(() => assertValidScheduleBlockParent(blocks, 'parent', 'grandchild')).toThrow(
      'create a schedule cycle',
    );
  });

  it('rejects unavailable parents and allows a valid parent', () => {
    const blocks = [block('parent'), block('child')];
    expect(() => assertValidScheduleBlockParent(blocks, 'child', 'missing')).toThrow(
      'no longer available',
    );
    expect(() => assertValidScheduleBlockParent(blocks, 'child', 'parent')).not.toThrow();
  });

  it('prevents archiving a block with active children', () => {
    const blocks = [block('parent'), block('child', 'parent')];
    expect(() => assertScheduleBlockCanBeArchived(blocks, 'parent')).toThrow('child blocks first');
    expect(() => assertScheduleBlockCanBeArchived(blocks, 'child')).not.toThrow();
  });
});

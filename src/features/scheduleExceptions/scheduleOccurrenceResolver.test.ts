import { describe, expect, it } from 'vitest';

import type { ScheduleBlock, ScheduleException } from '@/domain/models/entities';

import { resolveScheduleOccurrence } from './scheduleOccurrenceResolver';

function block(overrides: Partial<ScheduleBlock> = {}): ScheduleBlock {
  return {
    id: 'block',
    title: 'Default class',
    subject: '',
    category: 'Teaching',
    kind: 'teachable',
    weekdays: [1, 5, 6, 7],
    startMinute: 540,
    endMinute: 600,
    planningEnabled: false,
    bumpEnabled: false,
    showInWeek: true,
    sortOrder: 0,
    ...overrides,
  };
}

function exception(overrides: Partial<ScheduleException> = {}): ScheduleException {
  return {
    id: 'exception',
    date: '2026-07-17',
    scheduleBlockId: 'block',
    action: 'modify',
    ...overrides,
  };
}

describe('schedule occurrence resolution', () => {
  it('applies a single-date title and time modification without changing other dates', () => {
    const modified = resolveScheduleOccurrence(block(), '2026-07-17', [
      exception({
        replacementTitle: 'Adjusted Friday class',
        replacementStartMinute: 600,
        replacementEndMinute: 660,
      }),
    ]);
    const monday = resolveScheduleOccurrence(block(), '2026-07-20', []);

    expect(modified?.block).toMatchObject({
      title: 'Adjusted Friday class',
      startMinute: 600,
      endMinute: 660,
    });
    expect(modified?.adjusted).toBe(true);
    expect(monday?.block.title).toBe('Default class');
  });

  it('cancels one date and supports explicit weekend additions', () => {
    expect(
      resolveScheduleOccurrence(block(), '2026-07-17', [exception({ action: 'cancel' })]),
    ).toBeNull();

    const added = resolveScheduleOccurrence(block({ weekdays: [1] }), '2026-07-18', [
      exception({
        date: '2026-07-18',
        action: 'add',
        replacementTitle: 'Saturday studio',
      }),
    ]);
    expect(added?.block.title).toBe('Saturday studio');
  });

  it('does not revive archived or out-of-range blocks with add exceptions', () => {
    const added = exception({ date: '2026-07-18', action: 'add' });
    expect(
      resolveScheduleOccurrence(block({ archivedAt: '2026-07-01' }), '2026-07-18', [added]),
    ).toBeNull();
    expect(
      resolveScheduleOccurrence(block({ effectiveTo: '2026-07-17' }), '2026-07-18', [added]),
    ).toBeNull();
  });

  it('rejects duplicate exceptions for the same block and date', () => {
    expect(() =>
      resolveScheduleOccurrence(block(), '2026-07-17', [
        exception(),
        exception({ id: 'duplicate', action: 'cancel' }),
      ]),
    ).toThrow('Multiple schedule exceptions');
  });

  it('honors showInWeek only when the caller requests it', () => {
    const hidden = block({ showInWeek: false });
    expect(resolveScheduleOccurrence(hidden, '2026-07-17', [])).not.toBeNull();
    expect(
      resolveScheduleOccurrence(hidden, '2026-07-17', [], {
        requireShowInWeek: true,
      }),
    ).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { scheduleBlockSchema, sessionOccurrenceSchema } from './entities';

describe('domain schemas', () => {
  it('accepts a Friday-only schedule block as ordinary recurrence data', () => {
    const block = scheduleBlockSchema.parse({
      id: 'fr-math',
      title: 'Math',
      subject: 'Math',
      kind: 'teachable',
      weekdays: [5],
      startMinute: 530,
      endMinute: 590,
      planningEnabled: true,
      bumpEnabled: true,
      showInWeek: true,
    });
    expect(block.weekdays).toEqual([5]);
  });

  it('rejects sessions whose end is not after the start', () => {
    expect(() =>
      sessionOccurrenceSchema.parse({
        id: 'session-1',
        lessonPlanId: 'lesson-1',
        contextId: 'class-1',
        date: '2026-07-14',
        startMinute: 600,
        endMinute: 590,
        deliveryState: 'scheduled',
      }),
    ).toThrow();
  });
});

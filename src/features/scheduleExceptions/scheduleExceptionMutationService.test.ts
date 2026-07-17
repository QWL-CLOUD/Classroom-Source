import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { scheduleBlockSchema, scheduleExceptionSchema } from '@/domain/models/entities';
import { EditHistoryService } from '@/features/editing/editHistoryService';

import { ScheduleExceptionMutationService } from './scheduleExceptionMutationService';

function values(scope: 'occurrence' | 'future' | 'default' = 'occurrence') {
  return {
    title: 'Adjusted class',
    startTime: '10:00',
    endTime: '11:00',
    reason: 'Synthetic reason',
    scope,
  } as const;
}

describe('schedule exception mutations', () => {
  let db: ClassroomDatabase;
  let nextId = 0;
  let service: ScheduleExceptionMutationService;

  beforeEach(async () => {
    nextId = 0;
    db = new ClassroomDatabase(`schedule-exception-test-${crypto.randomUUID()}`);
    service = new ScheduleExceptionMutationService(db, {
      createId: () => `generated-${++nextId}`,
      now: () => '2026-07-17T12:00:00.000Z',
    });
    await db.open();
    await db.scheduleBlocks.bulkPut([
      scheduleBlockSchema.parse({
        id: 'parent',
        title: 'Parent day',
        kind: 'container',
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        startMinute: 480,
        endMinute: 900,
        effectiveFrom: '2026-07-01',
      }),
      scheduleBlockSchema.parse({
        id: 'child',
        parentId: 'parent',
        title: 'Child class',
        kind: 'teachable',
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        startMinute: 540,
        endMinute: 600,
        effectiveFrom: '2026-07-01',
      }),
    ]);
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it('upserts and restores a single occurrence atomically', async () => {
    await service.saveOccurrence('child', '2026-07-17', values());
    expect(await db.scheduleExceptions.count()).toBe(1);
    await service.restoreDefault('child', '2026-07-17');
    expect(await db.scheduleExceptions.count()).toBe(0);
    expect(await db.changeLog.count()).toBe(2);
  });

  it('rejects a future split on a date when the block does not occur', async () => {
    await db.scheduleBlocks.update('child', { weekdays: [1] });
    await expect(service.splitFuture('child', '2026-07-18', values('future'))).rejects.toThrow(
      'not an occurrence',
    );
    expect(await db.changeLog.count()).toBe(0);
  });

  it('defers parent subtree splitting when active children exist', async () => {
    await expect(service.splitFuture('parent', '2026-07-18', values('future'))).rejects.toThrow(
      'parent block with active children',
    );
    expect(await db.scheduleBlocks.count()).toBe(2);
    expect(await db.changeLog.count()).toBe(0);
  });

  it('splits only the selected child, migrates future exceptions, and Undo restores it', async () => {
    await db.scheduleExceptions.bulkPut([
      scheduleExceptionSchema.parse({
        id: 'boundary',
        date: '2026-07-18',
        scheduleBlockId: 'child',
        action: 'modify',
        replacementTitle: 'Boundary override',
      }),
      scheduleExceptionSchema.parse({
        id: 'future',
        date: '2026-07-20',
        scheduleBlockId: 'child',
        action: 'cancel',
      }),
    ]);

    const future = await service.splitFuture('child', '2026-07-18', values('future'));
    expect(future).toMatchObject({
      id: 'generated-1',
      parentId: 'parent',
      effectiveFrom: '2026-07-18',
      title: 'Adjusted class',
    });
    expect(await db.scheduleBlocks.get('child')).toMatchObject({
      effectiveTo: '2026-07-17',
    });
    expect(await db.scheduleExceptions.get('boundary')).toBeUndefined();
    expect(await db.scheduleExceptions.get('future')).toMatchObject({
      scheduleBlockId: 'generated-1',
    });

    const history = new EditHistoryService(db, {
      now: () => '2026-07-17T13:00:00.000Z',
    });
    await history.undo();
    expect(await db.scheduleBlocks.get('generated-1')).toBeUndefined();
    expect(await db.scheduleBlocks.get('child')).not.toHaveProperty('effectiveTo');
    expect(await db.scheduleExceptions.get('boundary')).toMatchObject({
      scheduleBlockId: 'child',
    });
    expect(await db.scheduleExceptions.get('future')).toMatchObject({
      scheduleBlockId: 'child',
    });
  });
});

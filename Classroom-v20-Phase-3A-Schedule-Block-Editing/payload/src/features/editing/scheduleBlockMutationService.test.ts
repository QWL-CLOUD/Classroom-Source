import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { calendarEventSchema, scheduleBlockSchema } from '@/domain/models/entities';

import {
  deleteCalendarEventCommand,
  putCalendarEventCommand,
  serializeCalendarEventCommand,
} from './calendarEventCommands';
import { createScheduleBlockEditorValues } from './scheduleBlockEditorModel';
import { ScheduleBlockMutationService } from './scheduleBlockMutationService';

let database: ClassroomDatabase;
let ids: string[];
let service: ScheduleBlockMutationService;

beforeEach(async () => {
  database = new ClassroomDatabase(`phase-3a-mutation-${crypto.randomUUID()}`);
  await database.open();
  ids = [];
  service = new ScheduleBlockMutationService(database, {
    createId: () => ids.shift() ?? crypto.randomUUID(),
    now: () => '2026-07-16T20:00:00.000Z',
  });
});

afterEach(async () => {
  await database.delete();
});

describe('ScheduleBlockMutationService', () => {
  it('creates, edits, and archives a block while preserving deferred fields', async () => {
    ids.push('new-block', 'create-log');
    const created = await service.create({
      ...createScheduleBlockEditorValues(),
      title: 'Weekend enrichment',
      weekdays: [7, 6, 7],
    });

    expect(created).toMatchObject({
      id: 'new-block',
      weekdays: [6, 7],
      planningEnabled: false,
      bumpEnabled: false,
      showInWeek: true,
      sortOrder: 0,
    });
    expect(await database.changeLog.count()).toBe(1);

    await database.scheduleBlocks.put(
      scheduleBlockSchema.parse({
        ...created,
        subject: 'Chinese',
        contextId: 'context-1',
        planningEnabled: true,
        bumpEnabled: true,
        sortOrder: 9,
      }),
    );

    ids.push('update-log');
    const updated = await service.update('new-block', {
      ...createScheduleBlockEditorValues(),
      title: 'Weekend studio',
      weekdays: [5, 6, 7],
      showInWeek: false,
    });
    expect(updated).toMatchObject({
      title: 'Weekend studio',
      subject: 'Chinese',
      contextId: 'context-1',
      planningEnabled: true,
      bumpEnabled: true,
      sortOrder: 9,
      weekdays: [5, 6, 7],
      showInWeek: false,
    });

    ids.push('archive-log');
    await service.archive('new-block');
    expect(await database.scheduleBlocks.get('new-block')).toMatchObject({
      archivedAt: '2026-07-16T20:00:00.000Z',
    });
    expect(await database.changeLog.count()).toBe(3);
  });

  it('rejects parent cycles without writing a record or change log', async () => {
    await database.scheduleBlocks.bulkPut([
      scheduleBlockSchema.parse({
        id: 'parent',
        parentId: 'child',
        title: 'Parent',
        kind: 'container',
        weekdays: [1],
        startMinute: 480,
        endMinute: 900,
      }),
      scheduleBlockSchema.parse({
        id: 'child',
        title: 'Child',
        kind: 'teachable',
        weekdays: [1],
        startMinute: 540,
        endMinute: 600,
      }),
    ]);

    ids.push('cycle-log');
    await expect(
      service.update('child', {
        ...createScheduleBlockEditorValues(),
        title: 'Child',
        parentId: 'parent',
      }),
    ).rejects.toThrow('schedule cycle');
    expect(await database.changeLog.count()).toBe(0);
    expect((await database.scheduleBlocks.get('child'))?.parentId).toBeUndefined();
  });

  it('prevents archiving a parent with active children', async () => {
    await database.scheduleBlocks.bulkPut([
      scheduleBlockSchema.parse({
        id: 'parent',
        title: 'Parent',
        kind: 'container',
        weekdays: [1],
        startMinute: 480,
        endMinute: 900,
      }),
      scheduleBlockSchema.parse({
        id: 'child',
        parentId: 'parent',
        title: 'Child',
        kind: 'teachable',
        weekdays: [1],
        startMinute: 540,
        endMinute: 600,
      }),
    ]);

    ids.push('archive-log');
    await expect(service.archive('parent')).rejects.toThrow('child blocks first');
    expect(await database.changeLog.count()).toBe(0);
    expect((await database.scheduleBlocks.get('parent'))?.archivedAt).toBeUndefined();
  });

  it('clears a mixed Calendar redo branch after a new schedule edit', async () => {
    const event = calendarEventSchema.parse({
      id: 'event-1',
      title: 'Synthetic event',
      startDate: '2026-07-16',
    });
    await database.changeLog.put({
      id: 'calendar-redo',
      label: 'Create synthetic event',
      commandType: 'calendar-event.create',
      forwardJson: serializeCalendarEventCommand(putCalendarEventCommand(event)),
      inverseJson: serializeCalendarEventCommand(deleteCalendarEventCommand(event.id)),
      createdAt: '2026-07-16T19:00:00.000Z',
      undoneAt: '2026-07-16T19:30:00.000Z',
    });

    ids.push('block-1', 'schedule-log');
    await service.create({
      ...createScheduleBlockEditorValues(),
      title: 'New schedule work',
    });

    expect(await database.changeLog.get('calendar-redo')).toBeUndefined();
    expect(await database.changeLog.get('schedule-log')).toBeDefined();
  });
});

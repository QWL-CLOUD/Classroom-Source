import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';

import { CalendarEventMutationService } from './calendarEventMutationService';
import { createCalendarEventEditorValues } from './calendarEventEditorModel';
import { EditHistoryService } from './editHistoryService';
import { createScheduleBlockEditorValues } from './scheduleBlockEditorModel';
import { ScheduleBlockMutationService } from './scheduleBlockMutationService';

let database: ClassroomDatabase;

beforeEach(async () => {
  database = new ClassroomDatabase(`phase-3a-history-${crypto.randomUUID()}`);
  await database.open();
});

afterEach(async () => {
  await database.delete();
});

describe('mixed edit history', () => {
  it('undoes and redoes Schedule Block and Calendar commands on one history line', async () => {
    const scheduleIds = ['block-1', 'schedule-log'];
    const calendarIds = ['event-1', 'calendar-log'];
    const scheduleService = new ScheduleBlockMutationService(database, {
      createId: () => scheduleIds.shift() ?? crypto.randomUUID(),
      now: () => '2026-07-16T18:00:00.000Z',
    });
    const calendarService = new CalendarEventMutationService(database, {
      createId: () => calendarIds.shift() ?? crypto.randomUUID(),
      now: () => '2026-07-16T19:00:00.000Z',
    });
    const history = new EditHistoryService(database, {
      now: () => '2026-07-16T20:00:00.000Z',
    });

    await scheduleService.create({
      ...createScheduleBlockEditorValues(),
      title: 'Synthetic schedule',
    });
    await calendarService.create({
      ...createCalendarEventEditorValues('2026-07-16'),
      title: 'Synthetic event',
    });

    expect(await history.getState()).toMatchObject({
      canUndo: true,
      canRedo: false,
    });

    await history.undo();
    expect(await database.calendarEvents.get('event-1')).toBeUndefined();
    expect(await database.scheduleBlocks.get('block-1')).toBeDefined();
    expect(await history.getState()).toMatchObject({
      canUndo: true,
      canRedo: true,
    });

    await history.undo();
    expect(await database.scheduleBlocks.get('block-1')).toBeUndefined();

    await history.redo();
    expect(await database.scheduleBlocks.get('block-1')).toBeDefined();
    await history.redo();
    expect(await database.calendarEvents.get('event-1')).toBeDefined();
    expect(await history.getState()).toMatchObject({
      canUndo: true,
      canRedo: false,
    });
  });
});

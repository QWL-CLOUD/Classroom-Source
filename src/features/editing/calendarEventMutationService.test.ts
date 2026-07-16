import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { CalendarEventMutationService } from './calendarEventMutationService';
import { createCalendarEventEditorValues } from './calendarEventEditorModel';
import { EditHistoryService } from './editHistoryService';

let db: ClassroomDatabase;
let idSequence: number;
let timeSequence: number;
let mutationService: CalendarEventMutationService;
let historyService: EditHistoryService;

function createId(): string {
  idSequence += 1;
  return `phase-2f-id-${idSequence}`;
}

function now(): string {
  timeSequence += 1;
  return `2026-07-16T12:00:${timeSequence.toString().padStart(2, '0')}.000Z`;
}

beforeEach(() => {
  idSequence = 0;
  timeSequence = 0;
  db = new ClassroomDatabase(`phase-2f-test-${crypto.randomUUID()}`);
  mutationService = new CalendarEventMutationService(db, { createId, now });
  historyService = new EditHistoryService(db, { now });
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe('calendar event mutation history', () => {
  it('commits a validated event and matching change log atomically', async () => {
    const created = await mutationService.create({
      ...createCalendarEventEditorValues('2026-07-20'),
      title: 'Synthetic conference',
    });

    expect(await db.calendarEvents.get(created.id)).toEqual(created);
    const logs = await db.changeLog.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      commandType: 'calendar-event.create',
      label: 'Create “Synthetic conference”',
    });
    await expect(historyService.getState()).resolves.toMatchObject({
      canUndo: true,
      canRedo: false,
    });
  });

  it('undoes and redoes create, update, and delete commands', async () => {
    const created = await mutationService.create({
      ...createCalendarEventEditorValues('2026-07-20'),
      title: 'Original title',
    });

    await mutationService.update(created.id, {
      ...createCalendarEventEditorValues('2026-07-20'),
      title: 'Edited title',
      category: 'Meeting',
    });
    expect((await db.calendarEvents.get(created.id))?.title).toBe('Edited title');

    await mutationService.delete(created.id);
    expect(await db.calendarEvents.get(created.id)).toBeUndefined();

    await historyService.undo();
    expect((await db.calendarEvents.get(created.id))?.title).toBe('Edited title');

    await historyService.undo();
    expect((await db.calendarEvents.get(created.id))?.title).toBe('Original title');

    await historyService.redo();
    expect((await db.calendarEvents.get(created.id))?.title).toBe('Edited title');

    await historyService.redo();
    expect(await db.calendarEvents.get(created.id)).toBeUndefined();
  });

  it('clears the redo branch when a new command follows undo', async () => {
    const first = await mutationService.create({
      ...createCalendarEventEditorValues('2026-07-20'),
      title: 'First event',
    });
    await mutationService.update(first.id, {
      ...createCalendarEventEditorValues('2026-07-20'),
      title: 'Edited first event',
    });

    await historyService.undo();
    await expect(historyService.getState()).resolves.toMatchObject({
      canRedo: true,
    });

    await mutationService.create({
      ...createCalendarEventEditorValues('2026-07-21'),
      title: 'Branch event',
    });

    await expect(historyService.getState()).resolves.toMatchObject({
      canUndo: true,
      canRedo: false,
    });
    const logs = await db.changeLog.toArray();
    expect(logs.some((log) => Boolean(log.undoneAt))).toBe(false);
  });

  it('does not overwrite an existing record when a generated ID collides', async () => {
    await db.calendarEvents.put({
      id: 'phase-2f-id-1',
      title: 'Existing event',
      startDate: '2026-07-20',
      category: 'Calendar',
      source: 'user',
    });

    await expect(
      mutationService.create({
        ...createCalendarEventEditorValues('2026-07-20'),
        title: 'Conflicting event',
      }),
    ).rejects.toThrow('Calendar event ID already exists.');

    expect((await db.calendarEvents.get('phase-2f-id-1'))?.title).toBe('Existing event');
    expect(await db.changeLog.count()).toBe(0);
  });

  it('does not write a calendar event when validation fails', async () => {
    await expect(
      mutationService.create({
        ...createCalendarEventEditorValues('2026-07-20'),
        title: '',
      }),
    ).rejects.toThrow('Enter an event title.');

    expect(await db.calendarEvents.count()).toBe(0);
    expect(await db.changeLog.count()).toBe(0);
  });
});

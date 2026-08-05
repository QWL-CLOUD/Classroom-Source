import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { CalendarEventMutationService } from './calendarEventMutationService';
import { createCalendarEventEditorValues } from './calendarEventEditorModel';
import { EditHistoryService } from './editHistoryService';

let db: ClassroomDatabase;
let ids: string[];
let timeSequence: number;
let mutationService: CalendarEventMutationService;
let historyService: EditHistoryService;

function createId(): string {
  return ids.shift() ?? crypto.randomUUID();
}

function now(): string {
  timeSequence += 1;
  return `2026-08-04T12:00:${timeSequence.toString().padStart(2, '0')}.000Z`;
}

beforeEach(async () => {
  ids = [];
  timeSequence = 0;
  db = new ClassroomDatabase(`calendar-foundation-${crypto.randomUUID()}`);
  await db.open();
  mutationService = new CalendarEventMutationService(db, { createId, now });
  historyService = new EditHistoryService(db, { now });
  await db.schoolYears.put({
    id: 'year-1',
    label: '2026–2027',
    startsOn: '2026-08-24',
    endsOn: '2027-06-14',
    active: true,
    lifecycleState: 'active',
  });
  await db.categoryValues.put({
    id: 'event-type-pd',
    familyId: 'calendar-event-type',
    name: 'Professional Development',
    normalizedName: 'professional development',
    aliases: ['PD'],
    normalizedAliases: ['pd'],
    sortOrder: 0,
    isDefault: false,
    lifecycleState: 'active',
    createdAt: '2026-08-04T11:00:00.000Z',
    updatedAt: '2026-08-04T11:00:00.000Z',
  });
});

afterEach(async () => {
  await db.delete();
});

describe('CalendarEventMutationService', () => {
  it('creates Event, School Year ownership, and canonical type assignment atomically', async () => {
    ids = ['event-1', 'assignment-1', 'log-1'];
    const created = await mutationService.create({
      ...createCalendarEventEditorValues('2026-08-28'),
      title: 'PD Day',
      schoolYearId: 'year-1',
      categoryValueId: 'event-type-pd',
      location: 'Main campus',
      timeZone: 'America/New_York',
    });

    expect(created).toMatchObject({
      id: 'event-1',
      schoolYearId: 'year-1',
      category: 'Professional Development',
      location: 'Main campus',
      timeZone: 'America/New_York',
    });
    expect(await db.categoryAssignments.get('assignment-1')).toMatchObject({
      familyId: 'calendar-event-type',
      categoryValueId: 'event-type-pd',
      entityType: 'calendar-event',
      entityId: 'event-1',
    });

    await historyService.undo();
    expect(await db.calendarEvents.get('event-1')).toBeUndefined();
    expect(await db.categoryAssignments.get('assignment-1')).toBeUndefined();
    await historyService.redo();
    expect(await db.calendarEvents.get('event-1')).toBeDefined();
    expect(await db.categoryAssignments.get('assignment-1')).toBeDefined();
  });

  it('updates and deletes Event plus assignment through one global history action', async () => {
    ids = ['event-1', 'assignment-1', 'log-create'];
    await mutationService.create({
      ...createCalendarEventEditorValues('2026-08-28'),
      title: 'Original title',
      schoolYearId: 'year-1',
      categoryValueId: 'event-type-pd',
    });

    ids = ['log-update'];
    await mutationService.update('event-1', {
      ...createCalendarEventEditorValues('2026-08-28'),
      title: 'Edited title',
      schoolYearId: 'year-1',
      categoryValueId: '',
      category: 'Legacy meeting',
    });
    expect(await db.calendarEvents.get('event-1')).toMatchObject({
      title: 'Edited title',
      category: 'Legacy meeting',
    });
    expect(await db.categoryAssignments.count()).toBe(0);

    ids = ['log-delete'];
    await mutationService.delete('event-1');
    expect(await db.calendarEvents.get('event-1')).toBeUndefined();

    await historyService.undo();
    expect(await db.calendarEvents.get('event-1')).toMatchObject({ title: 'Edited title' });
    await historyService.undo();
    expect(await db.calendarEvents.get('event-1')).toMatchObject({
      title: 'Original title',
      category: 'Professional Development',
    });
    expect(await db.categoryAssignments.get('assignment-1')).toBeDefined();
  });

  it('accepts overnight Events and rejects missing or newly selected archived ownership values', async () => {
    ids = ['event-overnight', 'log-overnight'];
    await expect(
      mutationService.create({
        ...createCalendarEventEditorValues('2026-10-12'),
        title: 'Overnight conference',
        endDate: '2026-10-13',
        allDay: false,
        startTime: '17:00',
        endTime: '09:00',
        schoolYearId: 'year-1',
      }),
    ).resolves.toMatchObject({ startMinute: 1020, endMinute: 540 });

    await expect(
      mutationService.create({
        ...createCalendarEventEditorValues('2026-08-28'),
        title: 'Missing year',
        schoolYearId: 'missing-year',
      }),
    ).rejects.toThrow('selected School Year no longer exists');

    await db.schoolYears.put({
      id: 'archived-year',
      label: '2025–2026',
      startsOn: '2025-08-25',
      endsOn: '2026-06-15',
      active: false,
      lifecycleState: 'archived',
      archivedAt: '2026-08-04T12:20:00.000Z',
    });
    await expect(
      mutationService.create({
        ...createCalendarEventEditorValues('2026-08-28'),
        title: 'Archived year',
        schoolYearId: 'archived-year',
      }),
    ).rejects.toThrow('Archived School Years cannot be newly assigned');

    await db.categoryValues.update('event-type-pd', {
      lifecycleState: 'archived',
      archivedAt: '2026-08-04T12:30:00.000Z',
    });
    await expect(
      mutationService.create({
        ...createCalendarEventEditorValues('2026-08-29'),
        title: 'Archived type',
        categoryValueId: 'event-type-pd',
      }),
    ).rejects.toThrow('Archived Calendar Event Types cannot be newly assigned');
  });

  it('rejects invalid editor values without writing any Event or history record', async () => {
    ids = ['unused-event', 'unused-log'];
    await expect(
      mutationService.create({
        ...createCalendarEventEditorValues('2026-08-28'),
        title: '',
      }),
    ).rejects.toThrow('Enter an event title.');

    expect(await db.calendarEvents.count()).toBe(0);
    expect(await db.changeLog.count()).toBe(0);
  });

  it('clears the redo branch when a new Calendar Event command follows Undo', async () => {
    ids = ['event-first', 'log-create'];
    await mutationService.create({
      ...createCalendarEventEditorValues('2026-08-28'),
      title: 'First event',
    });
    ids = ['log-update'];
    await mutationService.update('event-first', {
      ...createCalendarEventEditorValues('2026-08-28'),
      title: 'Edited first event',
    });

    await historyService.undo();
    await expect(historyService.getState()).resolves.toMatchObject({ canRedo: true });

    ids = ['event-branch', 'log-branch'];
    await mutationService.create({
      ...createCalendarEventEditorValues('2026-08-29'),
      title: 'Branch event',
    });

    await expect(historyService.getState()).resolves.toMatchObject({
      canUndo: true,
      canRedo: false,
    });
    expect((await db.changeLog.toArray()).some((log) => Boolean(log.undoneAt))).toBe(false);
  });

  it('does not overwrite an existing record when a generated ID collides', async () => {
    await db.calendarEvents.put({
      id: 'event-collision',
      title: 'Existing event',
      startDate: '2026-07-20',
      category: 'Calendar',
      source: 'user',
    });
    ids = ['event-collision'];

    await expect(
      mutationService.create({
        ...createCalendarEventEditorValues('2026-07-20'),
        title: 'Conflicting event',
      }),
    ).rejects.toThrow('Calendar event ID already exists.');

    expect((await db.calendarEvents.get('event-collision'))?.title).toBe('Existing event');
    expect(await db.changeLog.count()).toBe(0);
  });
});

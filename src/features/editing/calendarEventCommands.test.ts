import { describe, expect, it } from 'vitest';

import {
  createCalendarEventCommand,
  deleteCalendarEventCategoryAssignmentOperation,
  parseCalendarEventCommand,
  putCalendarEventCategoryAssignmentOperation,
  putCalendarEventOperation,
  serializeCalendarEventCommand,
} from './calendarEventCommands';

const event = {
  id: 'event-1',
  title: 'Professional learning',
  startDate: '2026-08-24',
  schoolYearId: 'year-1',
  category: 'Professional Development',
};

const assignment = {
  id: 'assignment-1',
  familyId: 'calendar-event-type' as const,
  categoryValueId: 'type-pd',
  entityType: 'calendar-event' as const,
  entityId: 'event-1',
  createdAt: '2026-08-04T12:00:00.000Z',
};

describe('Calendar Event commands', () => {
  it('serializes Event and type-assignment operations together', () => {
    const command = createCalendarEventCommand([
      putCalendarEventOperation(event),
      putCalendarEventCategoryAssignmentOperation(assignment),
      deleteCalendarEventCategoryAssignmentOperation('old-assignment'),
    ]);

    expect(parseCalendarEventCommand(serializeCalendarEventCommand(command))).toEqual(command);
  });

  it('parses legacy single-record Calendar Event commands', () => {
    expect(
      parseCalendarEventCommand(
        JSON.stringify({ table: 'calendarEvents', action: 'put', record: event }),
      ),
    ).toEqual(createCalendarEventCommand([putCalendarEventOperation(event)]));
  });
});

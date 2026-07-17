import { describe, expect, it } from 'vitest';

import {
  deleteScheduleBlockCommand,
  parseScheduleBlockCommand,
  putScheduleBlockCommand,
  serializeScheduleBlockCommand,
} from './scheduleBlockCommands';

const record = {
  id: 'block-1',
  title: 'Morning meeting',
  subject: '',
  category: 'Routine',
  kind: 'routine' as const,
  weekdays: [1, 2, 3, 4, 5],
  startMinute: 510,
  endMinute: 540,
  planningEnabled: false,
  bumpEnabled: false,
  showInWeek: true,
  sortOrder: 0,
};

describe('scheduleBlockCommands', () => {
  it('serializes and parses put commands', () => {
    const command = putScheduleBlockCommand(record);
    expect(parseScheduleBlockCommand(serializeScheduleBlockCommand(command))).toEqual(command);
  });

  it('serializes and parses delete commands', () => {
    const command = deleteScheduleBlockCommand(record.id);
    expect(parseScheduleBlockCommand(serializeScheduleBlockCommand(command))).toEqual(command);
  });
});

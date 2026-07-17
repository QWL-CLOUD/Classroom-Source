import { describe, expect, it } from 'vitest';

import {
  createScheduleExceptionCommand,
  parseScheduleExceptionCommand,
  serializeScheduleExceptionCommand,
} from './scheduleExceptionCommands';

describe('schedule exception commands', () => {
  it('round-trips composite block and exception operations', () => {
    const command = createScheduleExceptionCommand([
      {
        table: 'scheduleExceptions',
        action: 'delete',
        id: 'exception',
      },
      {
        table: 'scheduleBlocks',
        action: 'delete',
        id: 'future-block',
      },
    ]);
    expect(parseScheduleExceptionCommand(serializeScheduleExceptionCommand(command))).toEqual(
      command,
    );
  });
});

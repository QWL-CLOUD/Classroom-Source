import { describe, expect, it } from 'vitest';

import type { SessionOccurrence, TeachingReflectionRecord } from '@/domain/models/entities';

import {
  createTeachingReflectionCommand,
  deleteTeachingReflectionOperation,
  parseTeachingReflectionCommand,
  putReflectionSessionOperation,
  putTeachingReflectionOperation,
  serializeTeachingReflectionCommand,
} from './teachingReflectionCommands';

const reflection: TeachingReflectionRecord = {
  id: 'reflection-1',
  sessionOccurrenceId: 'session-1',
  schoolYearId: 'year-1',
  contextId: 'class-1',
  lessonPlanId: 'plan-1',
  occurredOn: '2026-09-01',
  whatWorked: 'Learners used the target language independently.',
  sourceSnapshots: {
    context: { kind: 'class', name: 'Grade 3 Chinese' },
    lessonPlan: { title: 'Reading workshop' },
    sessionOccurrence: { date: '2026-09-01', startMinute: 540, endMinute: 600 },
  },
  status: 'active',
  createdAt: '2026-09-01T15:00:00.000Z',
  updatedAt: '2026-09-01T15:00:00.000Z',
};

const session: SessionOccurrence = {
  id: 'session-1',
  lessonPlanId: 'plan-1',
  contextId: 'class-1',
  date: '2026-09-01',
  startMinute: 540,
  endMinute: 600,
  deliveryState: 'completed',
  completedAt: '2026-09-01T14:00:00.000Z',
  reflectionId: 'reflection-1',
};

describe('Teaching Reflection commands', () => {
  it('round-trips Reflection and Session operations through the command schema', () => {
    const command = createTeachingReflectionCommand([
      putTeachingReflectionOperation(reflection),
      putReflectionSessionOperation(session),
    ]);

    expect(parseTeachingReflectionCommand(serializeTeachingReflectionCommand(command))).toEqual(
      command,
    );
  });

  it('rejects empty commands and malformed Reflection records', () => {
    expect(() => createTeachingReflectionCommand([])).toThrow();
    expect(() =>
      createTeachingReflectionCommand([
        deleteTeachingReflectionOperation('reflection-1'),
        putTeachingReflectionOperation({ ...reflection, whatWorked: undefined }),
      ]),
    ).toThrow(/requires at least one narrative field/i);
  });
});

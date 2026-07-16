import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { lessonPlanSchema, sessionOccurrenceSchema } from '@/domain/models/entities';

import { DexieClassroomRepository } from './DexieClassroomRepository';

let databaseSequence = 0;
let database: ClassroomDatabase;
let repository: DexieClassroomRepository;

beforeEach(() => {
  databaseSequence += 1;
  database = new ClassroomDatabase(`classroom-v20-learner-repository-test-${databaseSequence}`);
  repository = new DexieClassroomRepository(database);
});

afterEach(async () => {
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

describe('Dexie learner planning queries', () => {
  it('filters lesson plans by context and workflow state in stable order', async () => {
    await database.lessonPlans.bulkPut([
      lessonPlanSchema.parse({
        id: 'ready-new',
        contextId: 'context-a',
        title: 'New ready plan',
        subject: '',
        workflowState: 'ready',
        createdAt: '2026-07-01T12:00:00.000Z',
        updatedAt: '2026-07-14T12:00:00.000Z',
      }),
      lessonPlanSchema.parse({
        id: 'ready-old',
        contextId: 'context-a',
        title: 'Old ready plan',
        subject: '',
        workflowState: 'ready',
        createdAt: '2026-07-01T12:00:00.000Z',
        updatedAt: '2026-07-10T12:00:00.000Z',
      }),
      lessonPlanSchema.parse({
        id: 'draft-plan',
        contextId: 'context-a',
        title: 'Draft plan',
        subject: '',
        workflowState: 'draft',
        createdAt: '2026-07-01T12:00:00.000Z',
        updatedAt: '2026-07-15T12:00:00.000Z',
      }),
      lessonPlanSchema.parse({
        id: 'other-context',
        contextId: 'context-b',
        title: 'Other context',
        subject: '',
        workflowState: 'ready',
        createdAt: '2026-07-01T12:00:00.000Z',
        updatedAt: '2026-07-16T12:00:00.000Z',
      }),
    ]);

    const plans = await repository.listLessonPlans({
      contextId: 'context-a',
      workflowStates: ['ready'],
    });

    expect(plans.map((plan) => plan.id)).toEqual(['ready-new', 'ready-old']);
  });

  it('filters session occurrences by context, delivery state, and local-date range', async () => {
    await database.sessionOccurrences.bulkPut([
      sessionOccurrenceSchema.parse({
        id: 'session-in-range',
        lessonPlanId: 'plan-a',
        contextId: 'context-a',
        date: '2026-07-20',
        startMinute: 540,
        endMinute: 600,
        deliveryState: 'scheduled',
      }),
      sessionOccurrenceSchema.parse({
        id: 'session-completed',
        lessonPlanId: 'plan-b',
        contextId: 'context-a',
        date: '2026-07-18',
        startMinute: 600,
        endMinute: 660,
        deliveryState: 'completed',
      }),
      sessionOccurrenceSchema.parse({
        id: 'session-outside',
        lessonPlanId: 'plan-c',
        contextId: 'context-a',
        date: '2026-08-01',
        startMinute: 600,
        endMinute: 660,
        deliveryState: 'scheduled',
      }),
      sessionOccurrenceSchema.parse({
        id: 'session-other-context',
        lessonPlanId: 'plan-d',
        contextId: 'context-b',
        date: '2026-07-21',
        startMinute: 600,
        endMinute: 660,
        deliveryState: 'scheduled',
      }),
    ]);

    const sessions = await repository.listSessionOccurrences({
      contextId: 'context-a',
      deliveryStates: ['scheduled'],
      startDate: '2026-07-19',
      endDate: '2026-07-31',
    });

    expect(sessions.map((session) => session.id)).toEqual(['session-in-range']);
  });

  it('rejects malformed persisted sessions instead of silently hiding them', async () => {
    await database.table('sessionOccurrences').put({
      id: 'malformed-session',
      lessonPlanId: 'plan-a',
      contextId: 'context-a',
      date: '07/20/2026',
      startMinute: 540,
      endMinute: 600,
      deliveryState: 'scheduled',
    });

    await expect(repository.listSessionOccurrences()).rejects.toThrow();
  });
});

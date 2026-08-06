import { describe, expect, it } from 'vitest';

import type { Task, TeachingReflectionRecord } from '@/domain/models/entities';

import {
  buildTaskWorkspaceReadModel,
  buildTeachingReflectionTaskSourcePresentation,
  selectTodayTasks,
} from './taskReadModel';

function task(overrides: Partial<Task> & Pick<Task, 'id' | 'title' | 'status'>): Task {
  return {
    order: 0,
    createdAt: '2026-07-18T12:00:00.000Z',
    updatedAt: '2026-07-18T12:00:00.000Z',
    ...overrides,
  };
}

function reflection(overrides: Partial<TeachingReflectionRecord> = {}): TeachingReflectionRecord {
  return {
    id: 'reflection-1',
    sessionOccurrenceId: 'session-1',
    schoolYearId: 'year-1',
    contextId: 'context-1',
    lessonPlanId: 'plan-1',
    occurredOn: '2026-07-18',
    whatWorked: 'The visual model helped.',
    sourceSnapshots: {
      context: { kind: 'class', name: 'Grade 3' },
      lessonPlan: { title: 'Fraction workshop' },
      sessionOccurrence: { date: '2026-07-18', startMinute: 540, endMinute: 600 },
    },
    status: 'active',
    createdAt: '2026-07-18T12:00:00.000Z',
    updatedAt: '2026-07-18T12:00:00.000Z',
    ...overrides,
  };
}

describe('task read models', () => {
  it('organizes tasks into stable lifecycle sections', () => {
    const model = buildTaskWorkspaceReadModel([
      task({ id: 'completed', title: 'Completed', status: 'completed' }),
      task({ id: 'waiting', title: 'Waiting', status: 'waiting' }),
      task({ id: 'cancelled', title: 'Cancelled', status: 'cancelled' }),
      task({ id: 'active-later', title: 'Later', status: 'active', scheduledDate: '2026-07-22' }),
      task({
        id: 'active-first',
        title: 'First',
        status: 'active',
        scheduledDate: '2026-07-20',
        scheduledMinute: 600,
      }),
      task({ id: 'active-unscheduled', title: 'Unscheduled', status: 'active' }),
    ]);

    expect(model.sections.map((section) => section.label)).toEqual([
      'Active',
      'Waiting',
      'Completed',
      'Cancelled',
    ]);
    expect(model.sections[0]?.tasks.map((value) => value.id)).toEqual([
      'active-first',
      'active-later',
      'active-unscheduled',
    ]);
    expect(model.sections.map((section) => section.tasks.length)).toEqual([3, 1, 1, 1]);
  });

  it('shows Today only active tasks scheduled for the selected date', () => {
    const values = [
      task({
        id: 'scheduled',
        title: 'Scheduled today',
        status: 'active',
        scheduledDate: '2026-07-20',
      }),
      task({
        id: 'due-only',
        title: 'Due today only',
        status: 'active',
        dueDate: '2026-07-20',
      }),
      task({ id: 'undated', title: 'Undated', status: 'active' }),
      task({
        id: 'waiting',
        title: 'Waiting today',
        status: 'waiting',
        scheduledDate: '2026-07-20',
      }),
      task({
        id: 'completed',
        title: 'Completed today',
        status: 'completed',
        scheduledDate: '2026-07-20',
      }),
    ];

    expect(selectTodayTasks(values, '2026-07-20').map((value) => value.id)).toEqual(['scheduled']);
  });

  it('presents available, archived, and unavailable Teaching Reflection sources', () => {
    const nextStep = task({
      id: 'next-step',
      title: 'Prepare a visual model',
      status: 'active',
      linkedEntityType: 'teaching-reflection',
      linkedEntityId: 'reflection-1',
    });

    expect(buildTeachingReflectionTaskSourcePresentation(nextStep, [reflection()])).toMatchObject({
      state: 'available',
      label: 'Reflection Next Step',
      detail: 'From Teaching Reflection: Fraction workshop',
    });
    expect(
      buildTeachingReflectionTaskSourcePresentation(nextStep, [
        reflection({ status: 'archived', archivedAt: '2026-07-19T12:00:00.000Z' }),
      ]),
    ).toMatchObject({
      state: 'available',
      detail: 'From Teaching Reflection: Fraction workshop · archived reflection',
    });
    expect(buildTeachingReflectionTaskSourcePresentation(nextStep, [])).toEqual({
      state: 'unavailable',
      label: 'Reflection Next Step',
      detail: 'From Teaching Reflection: unavailable source',
    });
    expect(
      buildTeachingReflectionTaskSourcePresentation(
        task({ id: 'ordinary', title: 'Ordinary', status: 'active' }),
        [reflection()],
      ),
    ).toBeUndefined();
  });
});

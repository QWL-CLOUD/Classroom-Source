import { describe, expect, it } from 'vitest';

import type { Task } from '@/domain/models/entities';

import { buildTaskWorkspaceReadModel, selectTodayTasks } from './taskReadModel';

function task(overrides: Partial<Task> & Pick<Task, 'id' | 'title' | 'status'>): Task {
  return {
    order: 0,
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
});

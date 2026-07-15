import { randomUUID } from '@/shared/ids/randomId';
import { taskSchema, type Task } from '@/domain/models/entities';

export function createTask(title: string, dueDate?: string): Task {
  const now = new Date().toISOString();
  return taskSchema.parse({
    id: randomUUID(),
    title: title.trim(),
    status: 'active',
    dueDate,
    order: Date.now(),
    createdAt: now,
    updatedAt: now,
  });
}

export function toggleTask(task: Task): Task {
  const now = new Date().toISOString();
  const completed = task.status !== 'completed';
  return taskSchema.parse({
    ...task,
    status: completed ? 'completed' : 'active',
    completedAt: completed ? now : undefined,
    updatedAt: now,
  });
}

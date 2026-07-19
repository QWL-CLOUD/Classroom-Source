import { z } from 'zod';

import { taskSchema, type ChangeLog, type Task } from '@/domain/models/entities';

export const TASK_COMMAND_PREFIX = 'task.';

const putTaskOperationSchema = z.object({
  table: z.literal('tasks'),
  action: z.literal('put'),
  record: taskSchema,
});

const deleteTaskOperationSchema = z.object({
  table: z.literal('tasks'),
  action: z.literal('delete'),
  id: z.string().min(1),
});

export const taskOperationSchema = z.union([putTaskOperationSchema, deleteTaskOperationSchema]);

export const taskCommandSchema = z.object({
  operations: z.array(taskOperationSchema).min(1),
});

export type TaskOperation = z.infer<typeof taskOperationSchema>;
export type TaskCommand = z.infer<typeof taskCommandSchema>;

export interface TaskCommandPair {
  forward: TaskCommand;
  inverse: TaskCommand;
}

export function putTaskOperation(record: Task): TaskOperation {
  return taskOperationSchema.parse({ table: 'tasks', action: 'put', record });
}

export function deleteTaskOperation(id: string): TaskOperation {
  return taskOperationSchema.parse({ table: 'tasks', action: 'delete', id });
}

export function createTaskCommand(operations: readonly TaskOperation[]): TaskCommand {
  return taskCommandSchema.parse({ operations });
}

export function serializeTaskCommand(command: TaskCommand): string {
  return JSON.stringify(taskCommandSchema.parse(command));
}

export function parseTaskCommand(json: string): TaskCommand {
  return taskCommandSchema.parse(JSON.parse(json) as unknown);
}

export function isTaskChangeLog(log: ChangeLog): boolean {
  return log.commandType.startsWith(TASK_COMMAND_PREFIX);
}

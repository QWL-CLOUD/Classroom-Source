import { z } from 'zod';

import {
  learnerNoticeSchema,
  taskSchema,
  type ChangeLog,
  type LearnerNotice,
  type Task,
} from '@/domain/models/entities';

export const LEARNER_NOTICE_COMMAND_PREFIX = 'learner-notice.';

const putLearnerNoticeOperationSchema = z.object({
  table: z.literal('learnerNotices'),
  action: z.literal('put'),
  record: learnerNoticeSchema,
});

const deleteLearnerNoticeOperationSchema = z.object({
  table: z.literal('learnerNotices'),
  action: z.literal('delete'),
  id: z.string().min(1),
});

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

export const learnerNoticeOperationSchema = z.union([
  putLearnerNoticeOperationSchema,
  deleteLearnerNoticeOperationSchema,
  putTaskOperationSchema,
  deleteTaskOperationSchema,
]);

export const learnerNoticeCommandSchema = z.object({
  operations: z.array(learnerNoticeOperationSchema).min(1),
});

export type LearnerNoticeOperation = z.infer<typeof learnerNoticeOperationSchema>;
export type LearnerNoticeCommand = z.infer<typeof learnerNoticeCommandSchema>;

export interface LearnerNoticeCommandPair {
  forward: LearnerNoticeCommand;
  inverse: LearnerNoticeCommand;
}

export function putLearnerNoticeOperation(record: LearnerNotice): LearnerNoticeOperation {
  return learnerNoticeOperationSchema.parse({
    table: 'learnerNotices',
    action: 'put',
    record,
  });
}

export function deleteLearnerNoticeOperation(id: string): LearnerNoticeOperation {
  return learnerNoticeOperationSchema.parse({ table: 'learnerNotices', action: 'delete', id });
}

export function putFollowUpTaskOperation(record: Task): LearnerNoticeOperation {
  return learnerNoticeOperationSchema.parse({ table: 'tasks', action: 'put', record });
}

export function deleteFollowUpTaskOperation(id: string): LearnerNoticeOperation {
  return learnerNoticeOperationSchema.parse({ table: 'tasks', action: 'delete', id });
}

export function createLearnerNoticeCommand(
  operations: readonly LearnerNoticeOperation[],
): LearnerNoticeCommand {
  return learnerNoticeCommandSchema.parse({ operations });
}

export function serializeLearnerNoticeCommand(command: LearnerNoticeCommand): string {
  return JSON.stringify(learnerNoticeCommandSchema.parse(command));
}

export function parseLearnerNoticeCommand(json: string): LearnerNoticeCommand {
  return learnerNoticeCommandSchema.parse(JSON.parse(json) as unknown);
}

export function isLearnerNoticeChangeLog(log: ChangeLog): boolean {
  return log.commandType.startsWith(LEARNER_NOTICE_COMMAND_PREFIX);
}

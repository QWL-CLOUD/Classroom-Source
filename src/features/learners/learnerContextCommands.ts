import { z } from 'zod';

import {
  contextMembershipSchema,
  learnerContextSchema,
  type ChangeLog,
  type ContextMembership,
  type LearnerContext,
} from '@/domain/models/entities';

export const LEARNER_CONTEXT_COMMAND_PREFIX = 'learner-context.';

const putLearnerContextOperationSchema = z.object({
  table: z.literal('learnerContexts'),
  action: z.literal('put'),
  record: learnerContextSchema,
});

const deleteLearnerContextOperationSchema = z.object({
  table: z.literal('learnerContexts'),
  action: z.literal('delete'),
  id: z.string().min(1),
});

const putContextMembershipOperationSchema = z.object({
  table: z.literal('contextMemberships'),
  action: z.literal('put'),
  record: contextMembershipSchema,
});

const deleteContextMembershipOperationSchema = z.object({
  table: z.literal('contextMemberships'),
  action: z.literal('delete'),
  id: z.string().min(1),
});

export const learnerContextOperationSchema = z.union([
  putLearnerContextOperationSchema,
  deleteLearnerContextOperationSchema,
  putContextMembershipOperationSchema,
  deleteContextMembershipOperationSchema,
]);

export const learnerContextCommandSchema = z.object({
  operations: z.array(learnerContextOperationSchema).min(1),
});

export type LearnerContextOperation = z.infer<typeof learnerContextOperationSchema>;
export type LearnerContextCommand = z.infer<typeof learnerContextCommandSchema>;

export interface LearnerContextCommandPair {
  forward: LearnerContextCommand;
  inverse: LearnerContextCommand;
}

export function putLearnerContextOperation(record: LearnerContext): LearnerContextOperation {
  return learnerContextOperationSchema.parse({
    table: 'learnerContexts',
    action: 'put',
    record,
  });
}

export function deleteLearnerContextOperation(id: string): LearnerContextOperation {
  return learnerContextOperationSchema.parse({
    table: 'learnerContexts',
    action: 'delete',
    id,
  });
}

export function putContextMembershipOperation(record: ContextMembership): LearnerContextOperation {
  return learnerContextOperationSchema.parse({
    table: 'contextMemberships',
    action: 'put',
    record,
  });
}

export function deleteContextMembershipOperation(id: string): LearnerContextOperation {
  return learnerContextOperationSchema.parse({
    table: 'contextMemberships',
    action: 'delete',
    id,
  });
}

export function createLearnerContextCommand(
  operations: readonly LearnerContextOperation[],
): LearnerContextCommand {
  return learnerContextCommandSchema.parse({ operations });
}

export function serializeLearnerContextCommand(command: LearnerContextCommand): string {
  return JSON.stringify(learnerContextCommandSchema.parse(command));
}

export function parseLearnerContextCommand(json: string): LearnerContextCommand {
  return learnerContextCommandSchema.parse(JSON.parse(json) as unknown);
}

export function isLearnerContextChangeLog(log: ChangeLog): boolean {
  return log.commandType.startsWith(LEARNER_CONTEXT_COMMAND_PREFIX);
}

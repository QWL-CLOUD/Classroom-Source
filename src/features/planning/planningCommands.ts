import { z } from 'zod';

import {
  lessonPlanSchema,
  sessionOccurrenceSchema,
  type ChangeLog,
  type LessonPlan,
  type SessionOccurrence,
} from '@/domain/models/entities';

export const PLANNING_COMMAND_PREFIX = 'planning.';

const putLessonPlanOperationSchema = z.object({
  table: z.literal('lessonPlans'),
  action: z.literal('put'),
  record: lessonPlanSchema,
});

const deleteLessonPlanOperationSchema = z.object({
  table: z.literal('lessonPlans'),
  action: z.literal('delete'),
  id: z.string().min(1),
});

const putSessionOperationSchema = z.object({
  table: z.literal('sessionOccurrences'),
  action: z.literal('put'),
  record: sessionOccurrenceSchema,
});

const deleteSessionOperationSchema = z.object({
  table: z.literal('sessionOccurrences'),
  action: z.literal('delete'),
  id: z.string().min(1),
});

export const planningOperationSchema = z.union([
  putLessonPlanOperationSchema,
  deleteLessonPlanOperationSchema,
  putSessionOperationSchema,
  deleteSessionOperationSchema,
]);

export const planningCommandSchema = z.object({
  operations: z.array(planningOperationSchema).min(1),
});

export type PlanningOperation = z.infer<typeof planningOperationSchema>;
export type PlanningCommand = z.infer<typeof planningCommandSchema>;

export interface PlanningCommandPair {
  forward: PlanningCommand;
  inverse: PlanningCommand;
}

export function putLessonPlanOperation(record: LessonPlan): PlanningOperation {
  return planningOperationSchema.parse({
    table: 'lessonPlans',
    action: 'put',
    record,
  });
}

export function deleteLessonPlanOperation(id: string): PlanningOperation {
  return planningOperationSchema.parse({
    table: 'lessonPlans',
    action: 'delete',
    id,
  });
}

export function putSessionOperation(record: SessionOccurrence): PlanningOperation {
  return planningOperationSchema.parse({
    table: 'sessionOccurrences',
    action: 'put',
    record,
  });
}

export function deleteSessionOperation(id: string): PlanningOperation {
  return planningOperationSchema.parse({
    table: 'sessionOccurrences',
    action: 'delete',
    id,
  });
}

export function createPlanningCommand(operations: readonly PlanningOperation[]): PlanningCommand {
  return planningCommandSchema.parse({ operations });
}

export function serializePlanningCommand(command: PlanningCommand): string {
  return JSON.stringify(planningCommandSchema.parse(command));
}

export function parsePlanningCommand(json: string): PlanningCommand {
  return planningCommandSchema.parse(JSON.parse(json) as unknown);
}

export function isPlanningChangeLog(log: ChangeLog): boolean {
  return log.commandType.startsWith(PLANNING_COMMAND_PREFIX);
}

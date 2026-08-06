import { z } from 'zod';

import {
  sessionOccurrenceSchema,
  teachingReflectionRecordSchema,
  type SessionOccurrence,
  type TeachingReflectionRecord,
} from '@/domain/models/entities';

export const TEACHING_REFLECTION_COMMAND_PREFIX = 'teaching-reflection.';

const putTeachingReflectionOperationSchema = z.object({
  table: z.literal('teachingReflections'),
  action: z.literal('put'),
  record: teachingReflectionRecordSchema,
});

const deleteTeachingReflectionOperationSchema = z.object({
  table: z.literal('teachingReflections'),
  action: z.literal('delete'),
  id: z.string().min(1),
});

const putSessionOccurrenceOperationSchema = z.object({
  table: z.literal('sessionOccurrences'),
  action: z.literal('put'),
  record: sessionOccurrenceSchema,
});

const deleteSessionOccurrenceOperationSchema = z.object({
  table: z.literal('sessionOccurrences'),
  action: z.literal('delete'),
  id: z.string().min(1),
});

export const teachingReflectionOperationSchema = z.union([
  putTeachingReflectionOperationSchema,
  deleteTeachingReflectionOperationSchema,
  putSessionOccurrenceOperationSchema,
  deleteSessionOccurrenceOperationSchema,
]);

export const teachingReflectionCommandSchema = z.object({
  operations: z.array(teachingReflectionOperationSchema).min(1),
});

export type TeachingReflectionOperation = z.infer<typeof teachingReflectionOperationSchema>;
export type TeachingReflectionCommand = z.infer<typeof teachingReflectionCommandSchema>;

export interface TeachingReflectionCommandPair {
  forward: TeachingReflectionCommand;
  inverse: TeachingReflectionCommand;
}

export function putTeachingReflectionOperation(
  record: TeachingReflectionRecord,
): TeachingReflectionOperation {
  return teachingReflectionOperationSchema.parse({
    table: 'teachingReflections',
    action: 'put',
    record,
  });
}

export function deleteTeachingReflectionOperation(id: string): TeachingReflectionOperation {
  return teachingReflectionOperationSchema.parse({
    table: 'teachingReflections',
    action: 'delete',
    id,
  });
}

export function putReflectionSessionOperation(
  record: SessionOccurrence,
): TeachingReflectionOperation {
  return teachingReflectionOperationSchema.parse({
    table: 'sessionOccurrences',
    action: 'put',
    record,
  });
}

export function deleteReflectionSessionOperation(id: string): TeachingReflectionOperation {
  return teachingReflectionOperationSchema.parse({
    table: 'sessionOccurrences',
    action: 'delete',
    id,
  });
}

export function createTeachingReflectionCommand(
  operations: readonly TeachingReflectionOperation[],
): TeachingReflectionCommand {
  return teachingReflectionCommandSchema.parse({ operations });
}

export function serializeTeachingReflectionCommand(command: TeachingReflectionCommand): string {
  return JSON.stringify(teachingReflectionCommandSchema.parse(command));
}

export function parseTeachingReflectionCommand(json: string): TeachingReflectionCommand {
  return teachingReflectionCommandSchema.parse(JSON.parse(json) as unknown);
}

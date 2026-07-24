import { z } from 'zod';

import {
  lessonTemplateSchema,
  type ChangeLog,
  type LessonTemplate,
} from '@/domain/models/entities';
import {
  categoryAssignmentOperationSchema,
  type CategoryAssignmentOperation,
} from '@/features/categories/categoryCommands';

export const LESSON_TEMPLATE_COMMAND_PREFIX = 'lesson-template.';

const putLessonTemplateOperationSchema = z.object({
  table: z.literal('lessonTemplates'),
  action: z.literal('put'),
  record: lessonTemplateSchema,
});

const deleteLessonTemplateOperationSchema = z.object({
  table: z.literal('lessonTemplates'),
  action: z.literal('delete'),
  id: z.string().min(1),
});

export const lessonTemplateOperationSchema = z.union([
  putLessonTemplateOperationSchema,
  deleteLessonTemplateOperationSchema,
  categoryAssignmentOperationSchema,
]);

export const lessonTemplateCommandSchema = z.object({
  operations: z.array(lessonTemplateOperationSchema).min(1),
});

export type LessonTemplateOperation =
  z.infer<typeof lessonTemplateOperationSchema> | CategoryAssignmentOperation;
export type LessonTemplateCommand = z.infer<typeof lessonTemplateCommandSchema>;

export interface LessonTemplateCommandPair {
  forward: LessonTemplateCommand;
  inverse: LessonTemplateCommand;
}

export function putLessonTemplateOperation(record: LessonTemplate): LessonTemplateOperation {
  return lessonTemplateOperationSchema.parse({
    table: 'lessonTemplates',
    action: 'put',
    record,
  });
}

export function deleteLessonTemplateOperation(id: string): LessonTemplateOperation {
  return lessonTemplateOperationSchema.parse({
    table: 'lessonTemplates',
    action: 'delete',
    id,
  });
}

export function createLessonTemplateCommand(
  operations: readonly LessonTemplateOperation[],
): LessonTemplateCommand {
  return lessonTemplateCommandSchema.parse({ operations });
}

export function serializeLessonTemplateCommand(command: LessonTemplateCommand): string {
  return JSON.stringify(lessonTemplateCommandSchema.parse(command));
}

export function parseLessonTemplateCommand(json: string): LessonTemplateCommand {
  return lessonTemplateCommandSchema.parse(JSON.parse(json) as unknown);
}

export function isLessonTemplateChangeLog(log: ChangeLog): boolean {
  return log.commandType.startsWith(LESSON_TEMPLATE_COMMAND_PREFIX);
}

import { z } from 'zod';

import {
  calendarEventSchema,
  categoryAssignmentSchema,
  categoryValueSchema,
  classificationMappingPresetSchema,
  type CalendarEvent,
  type CategoryAssignment,
  type CategoryValue,
  type ClassificationMappingPreset,
  type ChangeLog,
} from '@/domain/models/entities';

export const CATEGORY_COMMAND_PREFIX = 'category.';

const putCategoryValueOperationSchema = z.object({
  table: z.literal('categoryValues'),
  action: z.literal('put'),
  record: categoryValueSchema,
});

const deleteCategoryValueOperationSchema = z.object({
  table: z.literal('categoryValues'),
  action: z.literal('delete'),
  id: z.string().min(1),
});

const putClassificationMappingPresetOperationSchema = z.object({
  table: z.literal('classificationMappingPresets'),
  action: z.literal('put'),
  record: classificationMappingPresetSchema,
});

const deleteClassificationMappingPresetOperationSchema = z.object({
  table: z.literal('classificationMappingPresets'),
  action: z.literal('delete'),
  id: z.string().min(1),
});

export const putCategoryAssignmentOperationSchema = z.object({
  table: z.literal('categoryAssignments'),
  action: z.literal('put'),
  record: categoryAssignmentSchema,
});

export const deleteCategoryAssignmentOperationSchema = z.object({
  table: z.literal('categoryAssignments'),
  action: z.literal('delete'),
  id: z.string().min(1),
});

const putCalendarEventOperationSchema = z.object({
  table: z.literal('calendarEvents'),
  action: z.literal('put'),
  record: calendarEventSchema,
});

const deleteCalendarEventOperationSchema = z.object({
  table: z.literal('calendarEvents'),
  action: z.literal('delete'),
  id: z.string().min(1),
});

export const categoryAssignmentOperationSchema = z.union([
  putCategoryAssignmentOperationSchema,
  deleteCategoryAssignmentOperationSchema,
]);

export const categoryOperationSchema = z.union([
  putCategoryValueOperationSchema,
  deleteCategoryValueOperationSchema,
  putClassificationMappingPresetOperationSchema,
  deleteClassificationMappingPresetOperationSchema,
  putCalendarEventOperationSchema,
  deleteCalendarEventOperationSchema,
  putCategoryAssignmentOperationSchema,
  deleteCategoryAssignmentOperationSchema,
]);

export const categoryCommandSchema = z.object({
  operations: z.array(categoryOperationSchema).min(1),
});

export type CategoryAssignmentOperation = z.infer<typeof categoryAssignmentOperationSchema>;
export type CategoryOperation = z.infer<typeof categoryOperationSchema>;
export type CategoryCommand = z.infer<typeof categoryCommandSchema>;

export interface CategoryCommandPair {
  forward: CategoryCommand;
  inverse: CategoryCommand;
}

export function putCategoryValueOperation(record: CategoryValue): CategoryOperation {
  return categoryOperationSchema.parse({ table: 'categoryValues', action: 'put', record });
}

export function deleteCategoryValueOperation(id: string): CategoryOperation {
  return categoryOperationSchema.parse({ table: 'categoryValues', action: 'delete', id });
}

export function putClassificationMappingPresetOperation(
  record: ClassificationMappingPreset,
): CategoryOperation {
  return categoryOperationSchema.parse({
    table: 'classificationMappingPresets',
    action: 'put',
    record,
  });
}

export function deleteClassificationMappingPresetOperation(id: string): CategoryOperation {
  return categoryOperationSchema.parse({
    table: 'classificationMappingPresets',
    action: 'delete',
    id,
  });
}

export function putCategoryCalendarEventOperation(record: CalendarEvent): CategoryOperation {
  return categoryOperationSchema.parse({ table: 'calendarEvents', action: 'put', record });
}

export function deleteCategoryCalendarEventOperation(id: string): CategoryOperation {
  return categoryOperationSchema.parse({ table: 'calendarEvents', action: 'delete', id });
}

export function putCategoryAssignmentOperation(
  record: CategoryAssignment,
): CategoryAssignmentOperation {
  return categoryAssignmentOperationSchema.parse({
    table: 'categoryAssignments',
    action: 'put',
    record,
  });
}

export function deleteCategoryAssignmentOperation(id: string): CategoryAssignmentOperation {
  return categoryAssignmentOperationSchema.parse({
    table: 'categoryAssignments',
    action: 'delete',
    id,
  });
}

export function createCategoryCommand(operations: readonly CategoryOperation[]): CategoryCommand {
  return categoryCommandSchema.parse({ operations });
}

export function serializeCategoryCommand(command: CategoryCommand): string {
  return JSON.stringify(categoryCommandSchema.parse(command));
}

export function parseCategoryCommand(json: string): CategoryCommand {
  return categoryCommandSchema.parse(JSON.parse(json) as unknown);
}

export function isCategoryChangeLog(log: ChangeLog): boolean {
  return log.commandType.startsWith(CATEGORY_COMMAND_PREFIX);
}

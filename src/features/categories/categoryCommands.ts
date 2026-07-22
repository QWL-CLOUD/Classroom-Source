import { z } from 'zod';

import {
  categoryAssignmentSchema,
  categoryValueSchema,
  type CategoryAssignment,
  type CategoryValue,
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

const putCategoryAssignmentOperationSchema = z.object({
  table: z.literal('categoryAssignments'),
  action: z.literal('put'),
  record: categoryAssignmentSchema,
});

const deleteCategoryAssignmentOperationSchema = z.object({
  table: z.literal('categoryAssignments'),
  action: z.literal('delete'),
  id: z.string().min(1),
});

export const categoryOperationSchema = z.union([
  putCategoryValueOperationSchema,
  deleteCategoryValueOperationSchema,
  putCategoryAssignmentOperationSchema,
  deleteCategoryAssignmentOperationSchema,
]);

export const categoryCommandSchema = z.object({
  operations: z.array(categoryOperationSchema).min(1),
});

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

export function putCategoryAssignmentOperation(record: CategoryAssignment): CategoryOperation {
  return categoryOperationSchema.parse({ table: 'categoryAssignments', action: 'put', record });
}

export function deleteCategoryAssignmentOperation(id: string): CategoryOperation {
  return categoryOperationSchema.parse({ table: 'categoryAssignments', action: 'delete', id });
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

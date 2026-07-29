import { z } from 'zod';

import {
  categoryAssignmentSchema,
  importRunSchema,
  libraryCatalogItemSchema,
  standardAlignmentSchema,
  type CategoryAssignment,
  type ImportRun,
  type LibraryCatalogItem,
  type StandardAlignment,
} from '@/domain/models/entities';

export const IMPORT_CENTER_COMMAND_PREFIX = 'import-center.';

const putImportRunOperationSchema = z.object({
  action: z.literal('put'),
  table: z.literal('importRuns'),
  record: importRunSchema,
});
const deleteImportRunOperationSchema = z.object({
  action: z.literal('delete'),
  table: z.literal('importRuns'),
  id: z.string().min(1),
});
const putLibraryItemOperationSchema = z.object({
  action: z.literal('put'),
  table: z.literal('libraryItems'),
  record: libraryCatalogItemSchema,
});
const deleteLibraryItemOperationSchema = z.object({
  action: z.literal('delete'),
  table: z.literal('libraryItems'),
  id: z.string().min(1),
});
const putCategoryAssignmentOperationSchema = z.object({
  action: z.literal('put'),
  table: z.literal('categoryAssignments'),
  record: categoryAssignmentSchema,
});
const deleteCategoryAssignmentOperationSchema = z.object({
  action: z.literal('delete'),
  table: z.literal('categoryAssignments'),
  id: z.string().min(1),
});
const putStandardAlignmentOperationSchema = z.object({
  action: z.literal('put'),
  table: z.literal('standardAlignments'),
  record: standardAlignmentSchema,
});
const deleteStandardAlignmentOperationSchema = z.object({
  action: z.literal('delete'),
  table: z.literal('standardAlignments'),
  id: z.string().min(1),
});

export const importOperationSchema = z.union([
  putImportRunOperationSchema,
  deleteImportRunOperationSchema,
  putLibraryItemOperationSchema,
  deleteLibraryItemOperationSchema,
  putCategoryAssignmentOperationSchema,
  deleteCategoryAssignmentOperationSchema,
  putStandardAlignmentOperationSchema,
  deleteStandardAlignmentOperationSchema,
]);

export const importCommandSchema = z.object({
  operations: z.array(importOperationSchema).max(200_000),
});

export type ImportOperation = z.infer<typeof importOperationSchema>;
export type ImportCommand = z.infer<typeof importCommandSchema>;

export function createImportCommand(operations: ImportOperation[]): ImportCommand {
  return importCommandSchema.parse({ operations });
}

export function serializeImportCommand(command: ImportCommand): string {
  return JSON.stringify(importCommandSchema.parse(command));
}

export function parseImportCommand(json: string): ImportCommand {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error('The import command is not valid JSON.');
  }
  return importCommandSchema.parse(value);
}

export function putImportRunOperation(record: ImportRun): ImportOperation {
  return { action: 'put', table: 'importRuns', record: importRunSchema.parse(record) };
}

export function deleteImportRunOperation(id: string): ImportOperation {
  return { action: 'delete', table: 'importRuns', id };
}

export function putImportedLibraryItemOperation(record: LibraryCatalogItem): ImportOperation {
  return {
    action: 'put',
    table: 'libraryItems',
    record: libraryCatalogItemSchema.parse(record),
  };
}

export function deleteImportedLibraryItemOperation(id: string): ImportOperation {
  return { action: 'delete', table: 'libraryItems', id };
}

export function putImportCategoryAssignmentOperation(record: CategoryAssignment): ImportOperation {
  return {
    action: 'put',
    table: 'categoryAssignments',
    record: categoryAssignmentSchema.parse(record),
  };
}

export function deleteImportCategoryAssignmentOperation(id: string): ImportOperation {
  return { action: 'delete', table: 'categoryAssignments', id };
}

export function putImportStandardAlignmentOperation(record: StandardAlignment): ImportOperation {
  return {
    action: 'put',
    table: 'standardAlignments',
    record: standardAlignmentSchema.parse(record),
  };
}

export function deleteImportStandardAlignmentOperation(id: string): ImportOperation {
  return { action: 'delete', table: 'standardAlignments', id };
}

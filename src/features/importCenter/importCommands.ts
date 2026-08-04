import { z } from 'zod';

import {
  categoryAssignmentSchema,
  categoryValueSchema,
  classificationMappingPresetSchema,
  importRunSchema,
  libraryCatalogItemSchema,
  rosterMembershipSchema,
  standardAlignmentSchema,
  standardSchema,
  studentRecordSchema,
  type CategoryAssignment,
  type CategoryValue,
  type ClassificationMappingPreset,
  type ImportRun,
  type LibraryCatalogItem,
  type RosterMembership,
  type Standard,
  type StandardAlignment,
  type StudentRecord,
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
const putCategoryValueOperationSchema = z.object({
  action: z.literal('put'),
  table: z.literal('categoryValues'),
  record: categoryValueSchema,
});
const deleteCategoryValueOperationSchema = z.object({
  action: z.literal('delete'),
  table: z.literal('categoryValues'),
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
const putClassificationMappingPresetOperationSchema = z.object({
  action: z.literal('put'),
  table: z.literal('classificationMappingPresets'),
  record: classificationMappingPresetSchema,
});
const deleteClassificationMappingPresetOperationSchema = z.object({
  action: z.literal('delete'),
  table: z.literal('classificationMappingPresets'),
  id: z.string().min(1),
});

const putStandardOperationSchema = z.object({
  action: z.literal('put'),
  table: z.literal('standards'),
  record: standardSchema,
});
const deleteStandardOperationSchema = z.object({
  action: z.literal('delete'),
  table: z.literal('standards'),
  id: z.string().min(1),
});
const putStudentRecordOperationSchema = z.object({
  action: z.literal('put'),
  table: z.literal('studentRecords'),
  record: studentRecordSchema,
});
const deleteStudentRecordOperationSchema = z.object({
  action: z.literal('delete'),
  table: z.literal('studentRecords'),
  id: z.string().min(1),
});
const putRosterMembershipOperationSchema = z.object({
  action: z.literal('put'),
  table: z.literal('rosterMemberships'),
  record: rosterMembershipSchema,
});
const deleteRosterMembershipOperationSchema = z.object({
  action: z.literal('delete'),
  table: z.literal('rosterMemberships'),
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
  putCategoryValueOperationSchema,
  deleteCategoryValueOperationSchema,
  putCategoryAssignmentOperationSchema,
  deleteCategoryAssignmentOperationSchema,
  putClassificationMappingPresetOperationSchema,
  deleteClassificationMappingPresetOperationSchema,
  putStandardAlignmentOperationSchema,
  deleteStandardAlignmentOperationSchema,
  putStandardOperationSchema,
  deleteStandardOperationSchema,
  putStudentRecordOperationSchema,
  deleteStudentRecordOperationSchema,
  putRosterMembershipOperationSchema,
  deleteRosterMembershipOperationSchema,
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

export function putImportCategoryValueOperation(record: CategoryValue): ImportOperation {
  return {
    action: 'put',
    table: 'categoryValues',
    record: categoryValueSchema.parse(record),
  };
}

export function deleteImportCategoryValueOperation(id: string): ImportOperation {
  return { action: 'delete', table: 'categoryValues', id };
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

export function putImportClassificationMappingPresetOperation(
  record: ClassificationMappingPreset,
): ImportOperation {
  return {
    action: 'put',
    table: 'classificationMappingPresets',
    record: classificationMappingPresetSchema.parse(record),
  };
}

export function deleteImportClassificationMappingPresetOperation(id: string): ImportOperation {
  return { action: 'delete', table: 'classificationMappingPresets', id };
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

export function putImportedStandardOperation(record: Standard): ImportOperation {
  return { action: 'put', table: 'standards', record: standardSchema.parse(record) };
}

export function deleteImportedStandardOperation(id: string): ImportOperation {
  return { action: 'delete', table: 'standards', id };
}

export function putImportedStudentOperation(record: StudentRecord): ImportOperation {
  return { action: 'put', table: 'studentRecords', record: studentRecordSchema.parse(record) };
}

export function deleteImportedStudentOperation(id: string): ImportOperation {
  return { action: 'delete', table: 'studentRecords', id };
}

export function putImportedRosterMembershipOperation(record: RosterMembership): ImportOperation {
  return {
    action: 'put',
    table: 'rosterMemberships',
    record: rosterMembershipSchema.parse(record),
  };
}

export function deleteImportedRosterMembershipOperation(id: string): ImportOperation {
  return { action: 'delete', table: 'rosterMemberships', id };
}

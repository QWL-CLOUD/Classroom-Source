import { z } from 'zod';

import {
  standardAlignmentSchema,
  standardImportBatchSchema,
  standardSchema,
  type ChangeLog,
  type Standard,
  type StandardAlignment,
  type StandardImportBatch,
} from '@/domain/models/entities';

export const STANDARD_COMMAND_PREFIX = 'standard.';

const putStandardOperationSchema = z.object({
  table: z.literal('standards'),
  action: z.literal('put'),
  record: standardSchema,
});

const deleteStandardOperationSchema = z.object({
  table: z.literal('standards'),
  action: z.literal('delete'),
  id: z.string().min(1),
});

const putStandardImportBatchOperationSchema = z.object({
  table: z.literal('standardImportBatches'),
  action: z.literal('put'),
  record: standardImportBatchSchema,
});

const deleteStandardImportBatchOperationSchema = z.object({
  table: z.literal('standardImportBatches'),
  action: z.literal('delete'),
  id: z.string().min(1),
});

export const putStandardAlignmentOperationSchema = z.object({
  table: z.literal('standardAlignments'),
  action: z.literal('put'),
  record: standardAlignmentSchema,
});

export const deleteStandardAlignmentOperationSchema = z.object({
  table: z.literal('standardAlignments'),
  action: z.literal('delete'),
  id: z.string().min(1),
});

export const standardAlignmentOperationSchema = z.union([
  putStandardAlignmentOperationSchema,
  deleteStandardAlignmentOperationSchema,
]);

export const standardOperationSchema = z.union([
  putStandardOperationSchema,
  deleteStandardOperationSchema,
  standardAlignmentOperationSchema,
  putStandardImportBatchOperationSchema,
  deleteStandardImportBatchOperationSchema,
]);

export const standardCommandSchema = z.object({
  operations: z.array(standardOperationSchema).min(1),
});

export type StandardAlignmentOperation = z.infer<typeof standardAlignmentOperationSchema>;
export type StandardOperation = z.infer<typeof standardOperationSchema>;
export type StandardCommand = z.infer<typeof standardCommandSchema>;

export interface StandardCommandPair {
  forward: StandardCommand;
  inverse: StandardCommand;
}

export function putStandardOperation(record: Standard): StandardOperation {
  return standardOperationSchema.parse({
    table: 'standards',
    action: 'put',
    record,
  });
}

export function deleteStandardOperation(id: string): StandardOperation {
  return standardOperationSchema.parse({
    table: 'standards',
    action: 'delete',
    id,
  });
}

export function putStandardImportBatchOperation(record: StandardImportBatch): StandardOperation {
  return standardOperationSchema.parse({
    table: 'standardImportBatches',
    action: 'put',
    record,
  });
}

export function deleteStandardImportBatchOperation(id: string): StandardOperation {
  return standardOperationSchema.parse({
    table: 'standardImportBatches',
    action: 'delete',
    id,
  });
}

export function putStandardAlignmentOperation(
  record: StandardAlignment,
): StandardAlignmentOperation {
  return standardAlignmentOperationSchema.parse({
    table: 'standardAlignments',
    action: 'put',
    record,
  });
}

export function deleteStandardAlignmentOperation(id: string): StandardAlignmentOperation {
  return standardAlignmentOperationSchema.parse({
    table: 'standardAlignments',
    action: 'delete',
    id,
  });
}

export function createStandardCommand(operations: readonly StandardOperation[]): StandardCommand {
  return standardCommandSchema.parse({ operations });
}

export function serializeStandardCommand(command: StandardCommand): string {
  return JSON.stringify(standardCommandSchema.parse(command));
}

export function parseStandardCommand(json: string): StandardCommand {
  return standardCommandSchema.parse(JSON.parse(json) as unknown);
}

export function isStandardChangeLog(log: ChangeLog): boolean {
  return log.commandType.startsWith(STANDARD_COMMAND_PREFIX);
}

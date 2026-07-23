import { z } from 'zod';

import {
  libraryCatalogItemSchema,
  type ChangeLog,
  type LibraryCatalogItem,
} from '@/domain/models/entities';
import {
  categoryAssignmentOperationSchema,
  type CategoryAssignmentOperation,
} from '@/features/categories/categoryCommands';

export const LIBRARY_CATALOG_COMMAND_PREFIX = 'library-catalog.';

const putLibraryCatalogItemOperationSchema = z.object({
  table: z.literal('libraryItems'),
  action: z.literal('put'),
  record: libraryCatalogItemSchema,
});

const deleteLibraryCatalogItemOperationSchema = z.object({
  table: z.literal('libraryItems'),
  action: z.literal('delete'),
  id: z.string().min(1),
});

export const libraryCatalogOperationSchema = z.union([
  putLibraryCatalogItemOperationSchema,
  deleteLibraryCatalogItemOperationSchema,
  categoryAssignmentOperationSchema,
]);

export const libraryCatalogCommandSchema = z.object({
  operations: z.array(libraryCatalogOperationSchema).min(1),
});

export type LibraryCatalogOperation =
  z.infer<typeof libraryCatalogOperationSchema> | CategoryAssignmentOperation;
export type LibraryCatalogCommand = z.infer<typeof libraryCatalogCommandSchema>;

export interface LibraryCatalogCommandPair {
  forward: LibraryCatalogCommand;
  inverse: LibraryCatalogCommand;
}

export function putLibraryCatalogItemOperation(
  record: LibraryCatalogItem,
): LibraryCatalogOperation {
  return libraryCatalogOperationSchema.parse({
    table: 'libraryItems',
    action: 'put',
    record,
  });
}

export function deleteLibraryCatalogItemOperation(id: string): LibraryCatalogOperation {
  return libraryCatalogOperationSchema.parse({
    table: 'libraryItems',
    action: 'delete',
    id,
  });
}

export function createLibraryCatalogCommand(
  operations: readonly LibraryCatalogOperation[],
): LibraryCatalogCommand {
  return libraryCatalogCommandSchema.parse({ operations });
}

export function serializeLibraryCatalogCommand(command: LibraryCatalogCommand): string {
  return JSON.stringify(libraryCatalogCommandSchema.parse(command));
}

export function parseLibraryCatalogCommand(json: string): LibraryCatalogCommand {
  return libraryCatalogCommandSchema.parse(JSON.parse(json) as unknown);
}

export function isLibraryCatalogChangeLog(log: ChangeLog): boolean {
  return log.commandType.startsWith(LIBRARY_CATALOG_COMMAND_PREFIX);
}

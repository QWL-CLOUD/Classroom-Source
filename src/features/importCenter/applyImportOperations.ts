import type { ClassroomDatabase } from '@/data/db/ClassroomDatabase';

import type { ImportOperation } from './importCommands';

export async function applyImportOperations(
  db: ClassroomDatabase,
  operations: readonly ImportOperation[],
): Promise<void> {
  for (const operation of operations) {
    if (operation.table === 'importRuns') {
      if (operation.action === 'put') await db.importRuns.put(operation.record);
      else await db.importRuns.delete(operation.id);
    } else if (operation.table === 'libraryItems') {
      if (operation.action === 'put') await db.libraryItems.put(operation.record);
      else await db.libraryItems.delete(operation.id);
    } else if (operation.table === 'categoryAssignments') {
      if (operation.action === 'put') await db.categoryAssignments.put(operation.record);
      else await db.categoryAssignments.delete(operation.id);
    } else if (operation.action === 'put') {
      await db.standardAlignments.put(operation.record);
    } else {
      await db.standardAlignments.delete(operation.id);
    }
  }
}

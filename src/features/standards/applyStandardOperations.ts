import type { ClassroomDatabase } from '@/data/db/ClassroomDatabase';

import type { StandardOperation } from './standardCommands';

export async function applyStandardOperations(
  db: ClassroomDatabase,
  operations: readonly StandardOperation[],
): Promise<void> {
  for (const operation of operations) {
    if (operation.table === 'standards') {
      if (operation.action === 'put') await db.standards.put(operation.record);
      else await db.standards.delete(operation.id);
    } else if (operation.table === 'standardAlignments') {
      if (operation.action === 'put') await db.standardAlignments.put(operation.record);
      else await db.standardAlignments.delete(operation.id);
    } else if (operation.action === 'put') {
      await db.standardImportBatches.put(operation.record);
    } else {
      await db.standardImportBatches.delete(operation.id);
    }
  }
}

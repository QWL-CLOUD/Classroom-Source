import type { ClassroomDatabase } from '@/data/db/ClassroomDatabase';

import type { SchoolYearRolloverOperation } from './schoolYearRolloverCommands';

export async function applySchoolYearRolloverOperations(
  db: ClassroomDatabase,
  operations: readonly SchoolYearRolloverOperation[],
): Promise<void> {
  for (const operation of operations) {
    if (operation.table === 'learnerContexts') {
      if (operation.action === 'put') await db.learnerContexts.put(operation.record);
      else await db.learnerContexts.delete(operation.id);
    } else if (operation.table === 'contextMemberships') {
      if (operation.action === 'put') await db.contextMemberships.put(operation.record);
      else await db.contextMemberships.delete(operation.id);
    } else if (operation.action === 'put') {
      await db.scheduleBlocks.put(operation.record);
    } else {
      await db.scheduleBlocks.delete(operation.id);
    }
  }
}

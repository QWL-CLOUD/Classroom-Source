import type { ClassroomDatabase } from '@/data/db/ClassroomDatabase';

import type { SchoolYearRolloverOperation } from './schoolYearRolloverCommands';

export async function applySchoolYearRolloverOperations(
  db: ClassroomDatabase,
  operations: readonly SchoolYearRolloverOperation[],
): Promise<void> {
  for (const operation of operations) {
    const table = db.table(operation.table);
    if (operation.action === 'put') await table.put(operation.record);
    else await table.delete(operation.id);
  }
}

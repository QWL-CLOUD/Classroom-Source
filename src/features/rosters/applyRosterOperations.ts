import type { ClassroomDatabase } from '@/data/db/ClassroomDatabase';

import type { RosterOperation } from './rosterCommands';

export async function applyRosterOperations(
  db: ClassroomDatabase,
  operations: readonly RosterOperation[],
): Promise<void> {
  for (const operation of operations) {
    if (operation.table === 'studentRecords') {
      if (operation.action === 'put') await db.studentRecords.put(operation.record);
      else await db.studentRecords.delete(operation.id);
      continue;
    }

    if (operation.table === 'rosterMemberships') {
      if (operation.action === 'put') await db.rosterMemberships.put(operation.record);
      else await db.rosterMemberships.delete(operation.id);
      continue;
    }

    await db.learnerContexts.put(operation.record);
  }
}

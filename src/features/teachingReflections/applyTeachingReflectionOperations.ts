import type { ClassroomDatabase } from '@/data/db/ClassroomDatabase';

import type { TeachingReflectionOperation } from './teachingReflectionCommands';

export async function applyTeachingReflectionOperations(
  db: ClassroomDatabase,
  operations: readonly TeachingReflectionOperation[],
): Promise<void> {
  for (const operation of operations) {
    if (operation.table === 'teachingReflections') {
      if (operation.action === 'put') await db.teachingReflections.put(operation.record);
      else await db.teachingReflections.delete(operation.id);
      continue;
    }

    if (operation.action === 'put') await db.sessionOccurrences.put(operation.record);
    else await db.sessionOccurrences.delete(operation.id);
  }
}

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
    } else if (operation.table === 'calendarEvents') {
      if (operation.action === 'put') await db.calendarEvents.put(operation.record);
      else await db.calendarEvents.delete(operation.id);
    } else if (operation.table === 'calendarEventImportSeries') {
      if (operation.action === 'put') await db.calendarEventImportSeries.put(operation.record);
      else await db.calendarEventImportSeries.delete(operation.id);
    } else if (operation.table === 'calendarEventImportOccurrences') {
      if (operation.action === 'put') await db.calendarEventImportOccurrences.put(operation.record);
      else await db.calendarEventImportOccurrences.delete(operation.id);
    } else if (operation.table === 'libraryItems') {
      if (operation.action === 'put') await db.libraryItems.put(operation.record);
      else await db.libraryItems.delete(operation.id);
    } else if (operation.table === 'categoryValues') {
      if (operation.action === 'put') await db.categoryValues.put(operation.record);
      else await db.categoryValues.delete(operation.id);
    } else if (operation.table === 'categoryAssignments') {
      if (operation.action === 'put') await db.categoryAssignments.put(operation.record);
      else await db.categoryAssignments.delete(operation.id);
    } else if (operation.table === 'classificationMappingPresets') {
      if (operation.action === 'put') {
        await db.classificationMappingPresets.put(operation.record);
      } else {
        await db.classificationMappingPresets.delete(operation.id);
      }
    } else if (operation.table === 'standardAlignments') {
      if (operation.action === 'put') await db.standardAlignments.put(operation.record);
      else await db.standardAlignments.delete(operation.id);
    } else if (operation.table === 'standards') {
      if (operation.action === 'put') await db.standards.put(operation.record);
      else await db.standards.delete(operation.id);
    } else if (operation.table === 'studentRecords') {
      if (operation.action === 'put') await db.studentRecords.put(operation.record);
      else await db.studentRecords.delete(operation.id);
    } else if (operation.action === 'put') {
      await db.rosterMemberships.put(operation.record);
    } else {
      await db.rosterMemberships.delete(operation.id);
    }
  }
}

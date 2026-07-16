import type {
  LearnerContextQuery,
  LocalDateRange,
  WorkspaceReadSnapshot,
} from '@/domain/readModels/workspaceReadModels';
import type { ClassroomRepository } from '@/domain/repositories/ClassroomRepository';

export async function loadWorkspaceReadSnapshot(
  repository: ClassroomRepository,
  range: LocalDateRange,
  learnerQuery: LearnerContextQuery = {},
): Promise<WorkspaceReadSnapshot> {
  const activeSchoolYear = await repository.getActiveSchoolYear();
  const scopedLearnerQuery =
    learnerQuery.schoolYearId || !activeSchoolYear
      ? learnerQuery
      : { ...learnerQuery, schoolYearId: activeSchoolYear.id };

  const [scheduleBlocks, calendarEvents, learnerContexts, quarantineCount] = await Promise.all([
    repository.listScheduleBlocksForRange(range),
    repository.listCalendarEventsForRange(range),
    repository.listLearnerContexts(scopedLearnerQuery),
    repository.countQuarantineRecords(),
  ]);

  return {
    activeSchoolYear,
    scheduleBlocks,
    calendarEvents,
    learnerContexts,
    quarantineCount,
  };
}

export function toReadErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to read Classroom data.';
}

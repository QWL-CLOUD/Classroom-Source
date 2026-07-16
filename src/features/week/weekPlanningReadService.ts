import type { LessonPlan, SessionOccurrence } from '@/domain/models/entities';
import type { LocalDateRange } from '@/domain/readModels/workspaceReadModels';
import type { ClassroomRepository } from '@/domain/repositories/ClassroomRepository';

export interface WeekPlanningSnapshot {
  lessonPlans: LessonPlan[];
  sessionOccurrences: SessionOccurrence[];
}

export async function loadWeekPlanningSnapshot(
  repository: ClassroomRepository,
  range: LocalDateRange,
): Promise<WeekPlanningSnapshot> {
  const [lessonPlans, sessionOccurrences] = await Promise.all([
    repository.listLessonPlans(),
    repository.listSessionOccurrences({
      startDate: range.startDate,
      endDate: range.endDate,
    }),
  ]);

  return { lessonPlans, sessionOccurrences };
}

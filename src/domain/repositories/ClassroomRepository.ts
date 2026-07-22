import type {
  CalendarEvent,
  LearnerContext,
  LessonPlan,
  LessonSeries,
  ScheduleBlock,
  SchoolYear,
  SessionOccurrence,
  Task,
} from '@/domain/models/entities';
import type {
  LessonPlanQuery,
  LessonSeriesQuery,
  SessionOccurrenceQuery,
} from '@/domain/readModels/learnerReadModels';
import type {
  CoreRecordCounts,
  LearnerContextQuery,
  LocalDateRange,
  WorkspaceDataSummary,
} from '@/domain/readModels/workspaceReadModels';

export interface ClassroomRepository {
  listTasks(): Promise<Task[]>;
  putTask(task: Task): Promise<void>;
  deleteTask(id: string): Promise<void>;
  getActiveSchoolYear(): Promise<SchoolYear | null>;
  listSchoolYears(): Promise<SchoolYear[]>;
  listScheduleBlocks(): Promise<ScheduleBlock[]>;
  listScheduleBlocksForRange(range: LocalDateRange): Promise<ScheduleBlock[]>;
  listCalendarEventsForRange(range: LocalDateRange): Promise<CalendarEvent[]>;
  listLearnerContexts(query?: LearnerContextQuery): Promise<LearnerContext[]>;
  listLessonSeries(query?: LessonSeriesQuery): Promise<LessonSeries[]>;
  listLessonPlans(query?: LessonPlanQuery): Promise<LessonPlan[]>;
  listSessionOccurrences(query?: SessionOccurrenceQuery): Promise<SessionOccurrence[]>;
  countQuarantineRecords(): Promise<number>;
  countCoreRecords(): Promise<CoreRecordCounts>;
  getWorkspaceDataSummary(): Promise<WorkspaceDataSummary>;
}

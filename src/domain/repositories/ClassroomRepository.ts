import type {
  CalendarEvent,
  LearnerContext,
  ScheduleBlock,
  SchoolYear,
  Task,
} from '@/domain/models/entities';
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
  listScheduleBlocksForRange(range: LocalDateRange): Promise<ScheduleBlock[]>;
  listCalendarEventsForRange(range: LocalDateRange): Promise<CalendarEvent[]>;
  listLearnerContexts(query?: LearnerContextQuery): Promise<LearnerContext[]>;
  countQuarantineRecords(): Promise<number>;
  countCoreRecords(): Promise<CoreRecordCounts>;
  getWorkspaceDataSummary(): Promise<WorkspaceDataSummary>;
}

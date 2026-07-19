import type {
  CalendarEvent,
  LearnerContext,
  ScheduleBlock,
  SchoolYear,
} from '@/domain/models/entities';

export interface LocalDateRange {
  startDate: string;
  endDate: string;
}

export interface LearnerContextQuery {
  schoolYearId?: string;
  kind?: LearnerContext['kind'];
  status?: LearnerContext['status'];
}

export interface CoreRecordCounts {
  schoolYears: number;
  learnerContexts: number;
  scheduleBlocks: number;
  calendarEvents: number;
  lessonPlans: number;
  sessions: number;
  tasks: number;
  reminders: number;
  migrationRuns: number;
  quarantine: number;
}

export interface WorkspaceDataSummary {
  activeSchoolYear: SchoolYear | null;
  counts: CoreRecordCounts;
}

export interface WorkspaceReadSnapshot {
  activeSchoolYear: SchoolYear | null;
  scheduleBlocks: ScheduleBlock[];
  calendarEvents: CalendarEvent[];
  learnerContexts: LearnerContext[];
  quarantineCount: number;
}

export type WorkspaceReadState<T> =
  { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; message: string };

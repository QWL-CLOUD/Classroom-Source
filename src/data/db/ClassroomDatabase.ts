import Dexie, { type EntityTable } from 'dexie';
import type {
  AppSetting,
  CalendarEvent,
  ChangeLog,
  ContextMembership,
  LearnerContext,
  LessonPlan,
  LessonSeries,
  MigrationRun,
  QuarantineRecord,
  QuickCapture,
  ScheduleBlock,
  ScheduleException,
  SchoolYear,
  SessionOccurrence,
  Task,
} from '@/domain/models/entities';

export class ClassroomDatabase extends Dexie {
  schoolYears!: EntityTable<SchoolYear, 'id'>;
  learnerContexts!: EntityTable<LearnerContext, 'id'>;
  contextMemberships!: EntityTable<ContextMembership, 'id'>;
  scheduleBlocks!: EntityTable<ScheduleBlock, 'id'>;
  scheduleExceptions!: EntityTable<ScheduleException, 'id'>;
  calendarEvents!: EntityTable<CalendarEvent, 'id'>;
  lessonSeries!: EntityTable<LessonSeries, 'id'>;
  lessonPlans!: EntityTable<LessonPlan, 'id'>;
  sessionOccurrences!: EntityTable<SessionOccurrence, 'id'>;
  tasks!: EntityTable<Task, 'id'>;
  quickCaptures!: EntityTable<QuickCapture, 'id'>;
  migrationRuns!: EntityTable<MigrationRun, 'id'>;
  quarantineRecords!: EntityTable<QuarantineRecord, 'id'>;
  changeLog!: EntityTable<ChangeLog, 'id'>;
  appSettings!: EntityTable<AppSetting, 'key'>;

  constructor(name = 'classroom-v20') {
    super(name);

    this.version(1).stores({
      schoolYears: 'id, active, startsOn, endsOn',
      learnerContexts: 'id, kind, schoolYearId, status, name',
      contextMemberships: 'id, containerContextId, memberContextId',
      scheduleBlocks: 'id, parentId, contextId, *weekdays, effectiveFrom, effectiveTo, sortOrder',
      scheduleExceptions: 'id, date, scheduleBlockId, action',
      calendarEvents: 'id, startDate, endDate, category, contextId',
      lessonSeries: 'id, contextId, subject',
      lessonPlans: 'id, contextId, workflowState, seriesId, preferredScheduleBlockId, updatedAt',
      sessionOccurrences: 'id, date, lessonPlanId, contextId, scheduleBlockId, deliveryState',
      tasks: 'id, status, dueDate, contextId, order, updatedAt',
      quickCaptures: 'id, capturedOn, createdAt',
      migrationRuns: 'id, status, startedAt',
      quarantineRecords: 'id, migrationRunId, entityType, legacyStoreKey, createdAt',
      changeLog: 'id, createdAt, undoneAt, commandType',
      appSettings: 'key, updatedAt',
    });
  }
}

export const classroomDb = new ClassroomDatabase();

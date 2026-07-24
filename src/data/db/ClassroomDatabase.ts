import Dexie, { type EntityTable } from 'dexie';
import type {
  AppSetting,
  CalendarEvent,
  CategoryAssignment,
  CategoryValue,
  ChangeLog,
  ContextMembership,
  LearnerContext,
  LearnerNotice,
  LearnerServiceOccurrence,
  LibraryCatalogItem,
  LessonPlan,
  LessonTemplate,
  LessonSeries,
  MigrationRun,
  QuarantineRecord,
  QuickCapture,
  Reminder,
  ScheduleBlock,
  ScheduleException,
  SchoolYear,
  SessionOccurrence,
  Task,
} from '@/domain/models/entities';

export class ClassroomDatabase extends Dexie {
  schoolYears!: EntityTable<SchoolYear, 'id'>;
  learnerContexts!: EntityTable<LearnerContext, 'id'>;
  learnerNotices!: EntityTable<LearnerNotice, 'id'>;
  learnerServiceOccurrences!: EntityTable<LearnerServiceOccurrence, 'id'>;
  contextMemberships!: EntityTable<ContextMembership, 'id'>;
  scheduleBlocks!: EntityTable<ScheduleBlock, 'id'>;
  scheduleExceptions!: EntityTable<ScheduleException, 'id'>;
  calendarEvents!: EntityTable<CalendarEvent, 'id'>;
  categoryValues!: EntityTable<CategoryValue, 'id'>;
  categoryAssignments!: EntityTable<CategoryAssignment, 'id'>;
  libraryItems!: EntityTable<LibraryCatalogItem, 'id'>;
  lessonSeries!: EntityTable<LessonSeries, 'id'>;
  lessonPlans!: EntityTable<LessonPlan, 'id'>;
  lessonTemplates!: EntityTable<LessonTemplate, 'id'>;
  sessionOccurrences!: EntityTable<SessionOccurrence, 'id'>;
  tasks!: EntityTable<Task, 'id'>;
  quickCaptures!: EntityTable<QuickCapture, 'id'>;
  reminders!: EntityTable<Reminder, 'id'>;
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

    this.version(2).stores({
      schoolYears: 'id, active, startsOn, endsOn',
      learnerContexts: 'id, kind, schoolYearId, status, name',
      contextMemberships: 'id, containerContextId, memberContextId',
      scheduleBlocks: 'id, parentId, contextId, *weekdays, effectiveFrom, effectiveTo, sortOrder',
      scheduleExceptions: 'id, date, scheduleBlockId, action',
      calendarEvents: 'id, startDate, endDate, category, contextId',
      lessonSeries: 'id, contextId, subject',
      lessonPlans: 'id, contextId, workflowState, seriesId, preferredScheduleBlockId, updatedAt',
      sessionOccurrences: 'id, date, lessonPlanId, contextId, scheduleBlockId, deliveryState',
      tasks: 'id, status, scheduledDate, dueDate, contextId, order, updatedAt',
      quickCaptures: 'id, capturedOn, createdAt',
      reminders:
        'id, [sourceType+sourceId], sourceType, sourceId, status, remindDate, remindMinute, updatedAt',
      migrationRuns: 'id, status, startedAt',
      quarantineRecords: 'id, migrationRunId, entityType, legacyStoreKey, createdAt',
      changeLog: 'id, createdAt, undoneAt, commandType',
      appSettings: 'key, updatedAt',
    });

    this.version(3).stores({
      schoolYears: 'id, active, startsOn, endsOn',
      learnerContexts: 'id, kind, schoolYearId, status, name',
      learnerNotices: 'id, contextId, kind, status, noticeDate, updatedAt',
      contextMemberships: 'id, containerContextId, memberContextId',
      scheduleBlocks: 'id, parentId, contextId, *weekdays, effectiveFrom, effectiveTo, sortOrder',
      scheduleExceptions: 'id, date, scheduleBlockId, action',
      calendarEvents: 'id, startDate, endDate, category, contextId',
      lessonSeries: 'id, contextId, subject',
      lessonPlans: 'id, contextId, workflowState, seriesId, preferredScheduleBlockId, updatedAt',
      sessionOccurrences: 'id, date, lessonPlanId, contextId, scheduleBlockId, deliveryState',
      tasks: 'id, status, scheduledDate, dueDate, contextId, order, updatedAt',
      quickCaptures: 'id, capturedOn, createdAt',
      reminders:
        'id, [sourceType+sourceId], sourceType, sourceId, status, remindDate, remindMinute, updatedAt',
      migrationRuns: 'id, status, startedAt',
      quarantineRecords: 'id, migrationRunId, entityType, legacyStoreKey, createdAt',
      changeLog: 'id, createdAt, undoneAt, commandType',
      appSettings: 'key, updatedAt',
    });

    this.version(4).stores({
      schoolYears: 'id, active, startsOn, endsOn',
      learnerContexts: 'id, kind, schoolYearId, status, name',
      learnerNotices: 'id, contextId, kind, status, noticeDate, updatedAt',
      contextMemberships: 'id, containerContextId, memberContextId',
      scheduleBlocks: 'id, parentId, contextId, *weekdays, effectiveFrom, effectiveTo, sortOrder',
      scheduleExceptions: 'id, date, scheduleBlockId, action',
      calendarEvents: 'id, startDate, endDate, category, contextId',
      categoryValues:
        'id, familyId, &[familyId+normalizedName], [familyId+lifecycleState], [familyId+sortOrder], lifecycleState, isDefault, mergedIntoId, *normalizedAliases',
      categoryAssignments:
        'id, categoryValueId, [entityType+entityId], [familyId+entityType+entityId], &[categoryValueId+entityType+entityId], entityType, entityId',
      lessonSeries: 'id, contextId, subject',
      lessonPlans: 'id, contextId, workflowState, seriesId, preferredScheduleBlockId, updatedAt',
      sessionOccurrences: 'id, date, lessonPlanId, contextId, scheduleBlockId, deliveryState',
      tasks: 'id, status, scheduledDate, dueDate, contextId, order, updatedAt',
      quickCaptures: 'id, capturedOn, createdAt',
      reminders:
        'id, [sourceType+sourceId], sourceType, sourceId, status, remindDate, remindMinute, updatedAt',
      migrationRuns: 'id, status, startedAt',
      quarantineRecords: 'id, migrationRunId, entityType, legacyStoreKey, createdAt',
      changeLog: 'id, createdAt, undoneAt, commandType',
      appSettings: 'key, updatedAt',
    });

    this.version(5).stores({
      schoolYears: 'id, active, startsOn, endsOn',
      learnerContexts: 'id, kind, schoolYearId, status, name',
      learnerNotices: 'id, contextId, kind, status, noticeDate, updatedAt',
      contextMemberships: 'id, containerContextId, memberContextId',
      scheduleBlocks: 'id, parentId, contextId, *weekdays, effectiveFrom, effectiveTo, sortOrder',
      scheduleExceptions: 'id, date, scheduleBlockId, action',
      calendarEvents: 'id, startDate, endDate, category, contextId',
      categoryValues:
        'id, familyId, &[familyId+normalizedName], [familyId+lifecycleState], [familyId+sortOrder], lifecycleState, isDefault, mergedIntoId, *normalizedAliases',
      categoryAssignments:
        'id, categoryValueId, [entityType+entityId], [familyId+entityType+entityId], &[categoryValueId+entityType+entityId], entityType, entityId',
      lessonSeries: 'id, contextId, subject',
      lessonPlans: 'id, contextId, workflowState, seriesId, preferredScheduleBlockId, updatedAt',
      sessionOccurrences: 'id, date, lessonPlanId, contextId, scheduleBlockId, deliveryState',
      tasks: 'id, status, scheduledDate, dueDate, contextId, order, updatedAt',
      quickCaptures: 'id, capturedOn, createdAt',
      reminders:
        'id, [sourceType+sourceId], sourceType, sourceId, status, remindDate, remindMinute, updatedAt',
      migrationRuns: 'id, status, startedAt',
      quarantineRecords: 'id, migrationRunId, entityType, legacyStoreKey, createdAt',
      changeLog: 'id, createdAt, undoneAt, commandType',
      appSettings: 'key, updatedAt',
      learnerServiceOccurrences:
        'id, &[learnerNoticeId+date], learnerNoticeId, date, status, updatedAt',
    });

    this.version(6).stores({
      schoolYears: 'id, active, startsOn, endsOn',
      learnerContexts: 'id, kind, schoolYearId, status, name',
      learnerNotices: 'id, contextId, kind, status, noticeDate, updatedAt',
      contextMemberships: 'id, containerContextId, memberContextId',
      scheduleBlocks: 'id, parentId, contextId, *weekdays, effectiveFrom, effectiveTo, sortOrder',
      scheduleExceptions: 'id, date, scheduleBlockId, action',
      calendarEvents: 'id, startDate, endDate, category, contextId',
      categoryValues:
        'id, familyId, &[familyId+normalizedName], [familyId+lifecycleState], [familyId+sortOrder], lifecycleState, isDefault, mergedIntoId, *normalizedAliases',
      categoryAssignments:
        'id, categoryValueId, [entityType+entityId], [familyId+entityType+entityId], &[categoryValueId+entityType+entityId], entityType, entityId',
      lessonSeries: 'id, contextId, subject',
      lessonPlans: 'id, contextId, workflowState, seriesId, preferredScheduleBlockId, updatedAt',
      sessionOccurrences: 'id, date, lessonPlanId, contextId, scheduleBlockId, deliveryState',
      tasks: 'id, status, scheduledDate, dueDate, contextId, order, updatedAt',
      quickCaptures: 'id, capturedOn, createdAt',
      reminders:
        'id, [sourceType+sourceId], sourceType, sourceId, status, remindDate, remindMinute, updatedAt',
      migrationRuns: 'id, status, startedAt',
      quarantineRecords: 'id, migrationRunId, entityType, legacyStoreKey, createdAt',
      changeLog: 'id, createdAt, undoneAt, commandType',
      appSettings: 'key, updatedAt',
      learnerServiceOccurrences:
        'id, &[learnerNoticeId+date], learnerNoticeId, date, status, updatedAt',
      libraryItems: 'id, catalogType, status, updatedAt, *tags',
    });

    this.version(7).stores({
      schoolYears: 'id, active, startsOn, endsOn',
      learnerContexts: 'id, kind, schoolYearId, status, name',
      learnerNotices: 'id, contextId, kind, status, noticeDate, updatedAt',
      contextMemberships: 'id, containerContextId, memberContextId',
      scheduleBlocks: 'id, parentId, contextId, *weekdays, effectiveFrom, effectiveTo, sortOrder',
      scheduleExceptions: 'id, date, scheduleBlockId, action',
      calendarEvents: 'id, startDate, endDate, category, contextId',
      categoryValues:
        'id, familyId, &[familyId+normalizedName], [familyId+lifecycleState], [familyId+sortOrder], lifecycleState, isDefault, mergedIntoId, *normalizedAliases',
      categoryAssignments:
        'id, categoryValueId, [entityType+entityId], [familyId+entityType+entityId], &[categoryValueId+entityType+entityId], entityType, entityId',
      lessonSeries: 'id, contextId, subject',
      lessonPlans: 'id, contextId, workflowState, seriesId, preferredScheduleBlockId, updatedAt',
      lessonTemplates: 'id, status, updatedAt, title',
      sessionOccurrences: 'id, date, lessonPlanId, contextId, scheduleBlockId, deliveryState',
      tasks: 'id, status, scheduledDate, dueDate, contextId, order, updatedAt',
      quickCaptures: 'id, capturedOn, createdAt',
      reminders:
        'id, [sourceType+sourceId], sourceType, sourceId, status, remindDate, remindMinute, updatedAt',
      migrationRuns: 'id, status, startedAt',
      quarantineRecords: 'id, migrationRunId, entityType, legacyStoreKey, createdAt',
      changeLog: 'id, createdAt, undoneAt, commandType',
      appSettings: 'key, updatedAt',
      learnerServiceOccurrences:
        'id, &[learnerNoticeId+date], learnerNoticeId, date, status, updatedAt',
      libraryItems: 'id, catalogType, status, updatedAt, *tags',
    });
  }
}

export const classroomDb = new ClassroomDatabase();

import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  calendarEventSchema,
  learnerContextSchema,
  lessonPlanSchema,
  lessonSeriesSchema,
  scheduleBlockSchema,
  scheduleExceptionSchema,
  schoolYearSchema,
  sessionOccurrenceSchema,
  taskSchema,
  type CalendarEvent,
  type LearnerContext,
  type LessonPlan,
  type LessonSeries,
  type ScheduleBlock,
  type ScheduleException,
  type SchoolYear,
  type SessionOccurrence,
  type Task,
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
import type { ClassroomRepository } from '@/domain/repositories/ClassroomRepository';
import { assertLocalDateRange, localDateRangesOverlap } from '@/shared/dates/localDate';

const learnerKindOrder: Record<LearnerContext['kind'], number> = {
  class: 0,
  group: 1,
  individual: 2,
};

function compareText(first: string, second: string): number {
  return first.localeCompare(second, 'en', { sensitivity: 'base' }) || first.localeCompare(second);
}

function compareSchoolYears(first: SchoolYear, second: SchoolYear): number {
  return (
    second.startsOn.localeCompare(first.startsOn) ||
    second.endsOn.localeCompare(first.endsOn) ||
    compareText(first.label, second.label) ||
    first.id.localeCompare(second.id)
  );
}

function compareScheduleBlocks(first: ScheduleBlock, second: ScheduleBlock): number {
  return (
    first.startMinute - second.startMinute ||
    first.sortOrder - second.sortOrder ||
    compareText(first.title, second.title) ||
    first.id.localeCompare(second.id)
  );
}

function compareCalendarEvents(first: CalendarEvent, second: CalendarEvent): number {
  return (
    first.startDate.localeCompare(second.startDate) ||
    (first.startMinute ?? -1) - (second.startMinute ?? -1) ||
    compareText(first.title, second.title) ||
    first.id.localeCompare(second.id)
  );
}

function compareLearnerContexts(first: LearnerContext, second: LearnerContext): number {
  return (
    learnerKindOrder[first.kind] - learnerKindOrder[second.kind] ||
    compareText(first.name, second.name) ||
    first.id.localeCompare(second.id)
  );
}

function compareLessonPlans(first: LessonPlan, second: LessonPlan): number {
  return (
    second.updatedAt.localeCompare(first.updatedAt) ||
    compareText(first.title, second.title) ||
    first.id.localeCompare(second.id)
  );
}

function compareSessionOccurrences(first: SessionOccurrence, second: SessionOccurrence): number {
  return (
    first.date.localeCompare(second.date) ||
    first.startMinute - second.startMinute ||
    first.endMinute - second.endMinute ||
    first.id.localeCompare(second.id)
  );
}

export class DexieClassroomRepository implements ClassroomRepository {
  constructor(private readonly db: ClassroomDatabase = classroomDb) {}

  async listTasks(): Promise<Task[]> {
    return this.db.tasks.orderBy('order').toArray();
  }

  async putTask(task: Task): Promise<void> {
    await this.db.tasks.put(taskSchema.parse(task));
  }

  async deleteTask(id: string): Promise<void> {
    await this.db.tasks.delete(id);
  }

  async getActiveSchoolYear(): Promise<SchoolYear | null> {
    const schoolYears = await this.listSchoolYears();
    return (
      schoolYears.filter((schoolYear) => schoolYear.active).sort(compareSchoolYears)[0] ?? null
    );
  }

  async listSchoolYears(): Promise<SchoolYear[]> {
    const schoolYears = (await this.db.schoolYears.toArray()).map((value) =>
      schoolYearSchema.parse(value),
    );

    for (const schoolYear of schoolYears) {
      assertLocalDateRange(schoolYear.startsOn, schoolYear.endsOn);
    }

    return schoolYears.sort(compareSchoolYears);
  }

  async listScheduleBlocks(): Promise<ScheduleBlock[]> {
    const scheduleBlocks = (await this.db.scheduleBlocks.toArray()).map((value) =>
      scheduleBlockSchema.parse(value),
    );

    for (const block of scheduleBlocks) {
      if (block.effectiveFrom) {
        assertLocalDateRange(block.effectiveFrom, block.effectiveFrom);
      }
      if (block.effectiveTo) {
        assertLocalDateRange(block.effectiveTo, block.effectiveTo);
      }
      if (block.effectiveFrom && block.effectiveTo) {
        assertLocalDateRange(block.effectiveFrom, block.effectiveTo);
      }
    }

    return scheduleBlocks.filter((block) => !block.archivedAt).sort(compareScheduleBlocks);
  }

  async listScheduleBlocksForRange(range: LocalDateRange): Promise<ScheduleBlock[]> {
    assertLocalDateRange(range.startDate, range.endDate);

    const scheduleBlocks = (await this.db.scheduleBlocks.toArray()).map((value) =>
      scheduleBlockSchema.parse(value),
    );

    for (const block of scheduleBlocks) {
      if (block.effectiveFrom) {
        assertLocalDateRange(block.effectiveFrom, block.effectiveFrom);
      }
      if (block.effectiveTo) {
        assertLocalDateRange(block.effectiveTo, block.effectiveTo);
      }
      if (block.effectiveFrom && block.effectiveTo) {
        assertLocalDateRange(block.effectiveFrom, block.effectiveTo);
      }
    }

    return scheduleBlocks
      .filter(
        (block) =>
          !block.archivedAt &&
          (!block.effectiveFrom || block.effectiveFrom <= range.endDate) &&
          (!block.effectiveTo || block.effectiveTo >= range.startDate),
      )
      .sort(compareScheduleBlocks);
  }

  async listScheduleExceptionsForRange(range: LocalDateRange): Promise<ScheduleException[]> {
    assertLocalDateRange(range.startDate, range.endDate);
    const values = await this.db.scheduleExceptions
      .where('date')
      .between(range.startDate, range.endDate, true, true)
      .toArray();
    return values
      .map((value) => scheduleExceptionSchema.parse(value))
      .sort(
        (first, second) =>
          first.date.localeCompare(second.date) || first.id.localeCompare(second.id),
      );
  }

  async listCalendarEventsForRange(range: LocalDateRange): Promise<CalendarEvent[]> {
    assertLocalDateRange(range.startDate, range.endDate);

    const calendarEvents = (await this.db.calendarEvents.toArray()).map((value) =>
      calendarEventSchema.parse(value),
    );

    return calendarEvents
      .filter((event) =>
        localDateRangesOverlap(
          event.startDate,
          event.endDate ?? event.startDate,
          range.startDate,
          range.endDate,
        ),
      )
      .sort(compareCalendarEvents);
  }

  async listLearnerContexts(query: LearnerContextQuery = {}): Promise<LearnerContext[]> {
    const requestedStatus = query.status ?? 'active';
    const learnerContexts = (await this.db.learnerContexts.toArray()).map((value) =>
      learnerContextSchema.parse(value),
    );

    return learnerContexts
      .filter(
        (context) =>
          context.status === requestedStatus &&
          (!query.schoolYearId || context.schoolYearId === query.schoolYearId) &&
          (!query.kind || context.kind === query.kind),
      )
      .sort(compareLearnerContexts);
  }

  async listLessonSeries(query: LessonSeriesQuery = {}): Promise<LessonSeries[]> {
    const sourceRecords = query.contextId
      ? await this.db.lessonSeries.where('contextId').equals(query.contextId).toArray()
      : await this.db.lessonSeries.toArray();
    return sourceRecords
      .map((value) => lessonSeriesSchema.parse(value))
      .filter((series) => !query.contextId || series.contextId === query.contextId)
      .sort(
        (first, second) =>
          compareText(first.title, second.title) || first.id.localeCompare(second.id),
      );
  }

  async listLessonPlans(query: LessonPlanQuery = {}): Promise<LessonPlan[]> {
    const sourceRecords = query.contextId
      ? await this.db.lessonPlans.where('contextId').equals(query.contextId).toArray()
      : await this.db.lessonPlans.toArray();
    const lessonPlans = sourceRecords.map((value) => lessonPlanSchema.parse(value));

    return lessonPlans
      .filter(
        (plan) =>
          (!query.contextId || plan.contextId === query.contextId) &&
          (!query.workflowStates || query.workflowStates.includes(plan.workflowState)),
      )
      .sort(compareLessonPlans);
  }

  async listSessionOccurrences(query: SessionOccurrenceQuery = {}): Promise<SessionOccurrence[]> {
    if (query.startDate) assertLocalDateRange(query.startDate, query.startDate);
    if (query.endDate) assertLocalDateRange(query.endDate, query.endDate);
    if (query.startDate && query.endDate) {
      assertLocalDateRange(query.startDate, query.endDate);
    }

    const sourceRecords = query.contextId
      ? await this.db.sessionOccurrences.where('contextId').equals(query.contextId).toArray()
      : await this.db.sessionOccurrences.toArray();
    const sessions = sourceRecords.map((value) => sessionOccurrenceSchema.parse(value));

    for (const session of sessions) {
      assertLocalDateRange(session.date, session.date);
    }

    return sessions
      .filter(
        (session) =>
          (!query.contextId || session.contextId === query.contextId) &&
          (!query.deliveryStates || query.deliveryStates.includes(session.deliveryState)) &&
          (!query.startDate || session.date >= query.startDate) &&
          (!query.endDate || session.date <= query.endDate),
      )
      .sort(compareSessionOccurrences);
  }

  async countQuarantineRecords(): Promise<number> {
    return this.db.quarantineRecords.count();
  }

  async countCoreRecords(): Promise<CoreRecordCounts> {
    const [
      schoolYears,
      learnerContexts,
      learnerNotices,
      scheduleBlocks,
      calendarEvents,
      lessonPlans,
      sessions,
      tasks,
      reminders,
      migrationRuns,
      quarantine,
    ] = await Promise.all([
      this.db.schoolYears.count(),
      this.db.learnerContexts.count(),
      this.db.learnerNotices.count(),
      this.db.scheduleBlocks.count(),
      this.db.calendarEvents.count(),
      this.db.lessonPlans.count(),
      this.db.sessionOccurrences.count(),
      this.db.tasks.count(),
      this.db.reminders.count(),
      this.db.migrationRuns.count(),
      this.db.quarantineRecords.count(),
    ]);

    return {
      schoolYears,
      learnerContexts,
      learnerNotices,
      scheduleBlocks,
      calendarEvents,
      lessonPlans,
      sessions,
      tasks,
      reminders,
      migrationRuns,
      quarantine,
    };
  }

  async getWorkspaceDataSummary(): Promise<WorkspaceDataSummary> {
    const [activeSchoolYear, counts, schoolYears] = await Promise.all([
      this.getActiveSchoolYear(),
      this.countCoreRecords(),
      this.db.schoolYears.toArray(),
    ]);
    const activeSchoolYearCount = schoolYears
      .map((value) => schoolYearSchema.parse(value))
      .filter((schoolYear) => schoolYear.active).length;

    return { activeSchoolYear, activeSchoolYearCount, counts };
  }
}

export const classroomRepository = new DexieClassroomRepository();

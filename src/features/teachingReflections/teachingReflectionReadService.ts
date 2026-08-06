import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  teachingReflectionRecordSchema,
  type StudentRecord,
  type TeachingReflectionRecord,
  type TeachingReflectionStatus,
} from '@/domain/models/entities';

import {
  buildTeachingReflectionDetailReadModel,
  TEACHING_REFLECTION_TASK_LINK_TYPE,
  type TeachingReflectionDetailReadModel,
} from './teachingReflectionReadModel';

export interface TeachingReflectionListFilters {
  status?: 'all' | TeachingReflectionStatus;
}

function compareReflections(
  first: TeachingReflectionRecord,
  second: TeachingReflectionRecord,
): number {
  return (
    second.occurredOn.localeCompare(first.occurredOn) ||
    second.updatedAt.localeCompare(first.updatedAt) ||
    first.sourceSnapshots.lessonPlan.title.localeCompare(
      second.sourceSnapshots.lessonPlan.title,
      'en',
      { sensitivity: 'base' },
    ) ||
    first.id.localeCompare(second.id)
  );
}

export class TeachingReflectionReadService {
  constructor(private readonly db: ClassroomDatabase = classroomDb) {}

  async getReflection(id: string): Promise<TeachingReflectionDetailReadModel | undefined> {
    return this.db.transaction('r', this.readTables(), async () => {
      const raw = await this.db.teachingReflections.get(id);
      if (!raw) return undefined;
      return this.loadDetail(teachingReflectionRecordSchema.parse(raw));
    });
  }

  async getSessionReflection(
    sessionOccurrenceId: string,
  ): Promise<TeachingReflectionDetailReadModel | undefined> {
    return this.db.transaction('r', this.readTables(), async () => {
      const raw = await this.db.teachingReflections
        .where('sessionOccurrenceId')
        .equals(sessionOccurrenceId)
        .first();
      if (!raw) return undefined;
      return this.loadDetail(teachingReflectionRecordSchema.parse(raw));
    });
  }

  async listSchoolYearReflections(
    schoolYearId: string,
    filters: TeachingReflectionListFilters = {},
  ): Promise<TeachingReflectionRecord[]> {
    const records = (
      await this.db.teachingReflections.where('schoolYearId').equals(schoolYearId).toArray()
    ).map((value) => teachingReflectionRecordSchema.parse(value));
    return records
      .filter(
        (record) => !filters.status || filters.status === 'all' || record.status === filters.status,
      )
      .sort(compareReflections);
  }

  private async loadDetail(
    reflection: TeachingReflectionRecord,
  ): Promise<TeachingReflectionDetailReadModel> {
    const [schoolYear, context, lessonPlan, sessionOccurrence, assessmentEvidence, tasks] =
      await Promise.all([
        this.db.schoolYears.get(reflection.schoolYearId),
        this.db.learnerContexts.get(reflection.contextId),
        this.db.lessonPlans.get(reflection.lessonPlanId),
        this.db.sessionOccurrences.get(reflection.sessionOccurrenceId),
        this.db.assessmentEvidence
          .where('sessionOccurrenceId')
          .equals(reflection.sessionOccurrenceId)
          .toArray(),
        this.db.tasks
          .filter(
            (task) =>
              task.linkedEntityType === TEACHING_REFLECTION_TASK_LINK_TYPE &&
              task.linkedEntityId === reflection.id,
          )
          .toArray(),
      ]);
    const studentIds = [...new Set(assessmentEvidence.map((record) => record.studentId))];
    const studentRecords = studentIds.length
      ? (await this.db.studentRecords.bulkGet(studentIds)).filter(
          (record): record is StudentRecord => record !== undefined,
        )
      : [];

    return buildTeachingReflectionDetailReadModel({
      reflection,
      schoolYear,
      context,
      lessonPlan,
      sessionOccurrence,
      assessmentEvidence,
      studentRecords,
      tasks,
    });
  }

  private readTables() {
    return [
      this.db.teachingReflections,
      this.db.schoolYears,
      this.db.learnerContexts,
      this.db.lessonPlans,
      this.db.sessionOccurrences,
      this.db.assessmentEvidence,
      this.db.studentRecords,
      this.db.tasks,
    ] as const;
  }
}

export const teachingReflectionReadService = new TeachingReflectionReadService();

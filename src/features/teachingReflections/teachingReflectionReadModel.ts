import {
  assessmentEvidenceRecordSchema,
  learnerContextSchema,
  lessonPlanSchema,
  schoolYearSchema,
  sessionOccurrenceSchema,
  studentRecordSchema,
  taskSchema,
  teachingReflectionRecordSchema,
  type AssessmentEvidenceKind,
  type AssessmentEvidenceRecord,
  type LearnerContext,
  type LessonPlan,
  type SchoolYear,
  type SessionOccurrence,
  type StudentRecord,
  type Task,
  type TaskStatus,
  type TeachingReflectionRecord,
} from '@/domain/models/entities';
import { compareClosedTasks, compareOpenTasks } from '@/features/tasks/taskReadModel';

import { TEACHING_REFLECTION_TASK_LINK_TYPE } from './teachingReflectionTaskContract';

export { TEACHING_REFLECTION_TASK_LINK_TYPE } from './teachingReflectionTaskContract';

export type TeachingReflectionSourceState = 'available' | 'unavailable';
export type TeachingReflectionSessionSourceState =
  'completed' | 'reopened' | 'cancelled' | 'unavailable';
export type TeachingReflectionSessionLinkState =
  'linked' | 'missing-pointer' | 'conflicting-pointer' | 'unavailable';

export type TeachingReflectionSourceWarning =
  | 'school-year-source-unavailable'
  | 'context-source-unavailable'
  | 'lesson-plan-source-unavailable'
  | 'session-source-unavailable'
  | 'session-reopened'
  | 'session-cancelled'
  | 'session-pointer-missing'
  | 'session-pointer-conflict';

export interface TeachingReflectionReadModelInput {
  reflection: unknown;
  schoolYear?: unknown;
  context?: unknown;
  lessonPlan?: unknown;
  sessionOccurrence?: unknown;
  assessmentEvidence?: readonly unknown[];
  studentRecords?: readonly unknown[];
  tasks?: readonly unknown[];
}

export interface TeachingReflectionSourceReadModel {
  schoolYear: {
    state: TeachingReflectionSourceState;
    current?: SchoolYear;
  };
  context: {
    state: TeachingReflectionSourceState;
    snapshot: TeachingReflectionRecord['sourceSnapshots']['context'];
    current?: LearnerContext;
  };
  lessonPlan: {
    state: TeachingReflectionSourceState;
    snapshot: TeachingReflectionRecord['sourceSnapshots']['lessonPlan'];
    current?: LessonPlan;
  };
  sessionOccurrence: {
    state: TeachingReflectionSessionSourceState;
    linkState: TeachingReflectionSessionLinkState;
    snapshot: TeachingReflectionRecord['sourceSnapshots']['sessionOccurrence'];
    current?: SessionOccurrence;
  };
  warnings: TeachingReflectionSourceWarning[];
}

export interface TeachingReflectionEvidenceItemReadModel {
  record: AssessmentEvidenceRecord;
  student?: StudentRecord;
}

export interface TeachingReflectionEvidenceReadModel {
  records: AssessmentEvidenceRecord[];
  items: TeachingReflectionEvidenceItemReadModel[];
  activeCount: number;
  archivedCount: number;
  countsByKind: Record<AssessmentEvidenceKind, number>;
}

export interface TeachingReflectionNextStepsReadModel {
  tasks: Task[];
  countsByStatus: Record<TaskStatus, number>;
  openCount: number;
  closedCount: number;
}

export interface TeachingReflectionDetailReadModel {
  reflection: TeachingReflectionRecord;
  source: TeachingReflectionSourceReadModel;
  relatedEvidence: TeachingReflectionEvidenceReadModel;
  nextSteps: TeachingReflectionNextStepsReadModel;
}

function compareEvidence(
  first: AssessmentEvidenceRecord,
  second: AssessmentEvidenceRecord,
): number {
  return (
    second.occurredOn.localeCompare(first.occurredOn) ||
    second.updatedAt.localeCompare(first.updatedAt) ||
    first.title.localeCompare(second.title, 'en', { sensitivity: 'base' }) ||
    first.id.localeCompare(second.id)
  );
}

function compareTasks(first: Task, second: Task): number {
  const statusOrder: Record<TaskStatus, number> = {
    active: 0,
    waiting: 1,
    completed: 2,
    cancelled: 3,
  };
  const statusDifference = statusOrder[first.status] - statusOrder[second.status];
  if (statusDifference !== 0) return statusDifference;
  return first.status === 'active' || first.status === 'waiting'
    ? compareOpenTasks(first, second)
    : compareClosedTasks(first, second);
}

function buildSource(
  reflection: TeachingReflectionRecord,
  schoolYear: SchoolYear | undefined,
  context: LearnerContext | undefined,
  lessonPlan: LessonPlan | undefined,
  sessionOccurrence: SessionOccurrence | undefined,
): TeachingReflectionSourceReadModel {
  const warnings: TeachingReflectionSourceWarning[] = [];

  if (!schoolYear) warnings.push('school-year-source-unavailable');
  if (!context) warnings.push('context-source-unavailable');
  if (!lessonPlan) warnings.push('lesson-plan-source-unavailable');

  let sessionState: TeachingReflectionSessionSourceState = 'unavailable';
  let linkState: TeachingReflectionSessionLinkState = 'unavailable';
  if (!sessionOccurrence) {
    warnings.push('session-source-unavailable');
  } else {
    if (sessionOccurrence.deliveryState === 'completed') {
      sessionState = 'completed';
    } else if (sessionOccurrence.deliveryState === 'scheduled') {
      sessionState = 'reopened';
      warnings.push('session-reopened');
    } else {
      sessionState = 'cancelled';
      warnings.push('session-cancelled');
    }

    if (sessionOccurrence.reflectionId === reflection.id) {
      linkState = 'linked';
    } else if (!sessionOccurrence.reflectionId) {
      linkState = 'missing-pointer';
      warnings.push('session-pointer-missing');
    } else {
      linkState = 'conflicting-pointer';
      warnings.push('session-pointer-conflict');
    }
  }

  return {
    schoolYear: {
      state: schoolYear ? 'available' : 'unavailable',
      current: schoolYear,
    },
    context: {
      state: context ? 'available' : 'unavailable',
      snapshot: reflection.sourceSnapshots.context,
      current: context,
    },
    lessonPlan: {
      state: lessonPlan ? 'available' : 'unavailable',
      snapshot: reflection.sourceSnapshots.lessonPlan,
      current: lessonPlan,
    },
    sessionOccurrence: {
      state: sessionState,
      linkState,
      snapshot: reflection.sourceSnapshots.sessionOccurrence,
      current: sessionOccurrence,
    },
    warnings,
  };
}

function buildEvidence(
  reflection: TeachingReflectionRecord,
  values: readonly unknown[],
  studentValues: readonly unknown[],
): TeachingReflectionEvidenceReadModel {
  const records = values
    .map((value) => assessmentEvidenceRecordSchema.parse(value))
    .filter((record) => record.sessionOccurrenceId === reflection.sessionOccurrenceId)
    .sort(compareEvidence);
  const studentsById = new Map(
    studentValues
      .map((value) => studentRecordSchema.parse(value))
      .map((student) => [student.id, student] as const),
  );

  return {
    records,
    items: records.map((record) => ({
      record,
      student: studentsById.get(record.studentId),
    })),
    activeCount: records.filter((record) => record.status === 'active').length,
    archivedCount: records.filter((record) => record.status === 'archived').length,
    countsByKind: {
      score: records.filter((record) => record.kind === 'score').length,
      proficiency: records.filter((record) => record.kind === 'proficiency').length,
      observation: records.filter((record) => record.kind === 'observation').length,
    },
  };
}

function buildNextSteps(
  reflection: TeachingReflectionRecord,
  values: readonly unknown[],
): TeachingReflectionNextStepsReadModel {
  const tasks = values
    .map((value) => taskSchema.parse(value))
    .filter(
      (task) =>
        task.linkedEntityType === TEACHING_REFLECTION_TASK_LINK_TYPE &&
        task.linkedEntityId === reflection.id,
    )
    .sort(compareTasks);
  const countsByStatus: Record<TaskStatus, number> = {
    active: 0,
    waiting: 0,
    completed: 0,
    cancelled: 0,
  };
  tasks.forEach((task) => {
    countsByStatus[task.status] += 1;
  });

  return {
    tasks,
    countsByStatus,
    openCount: countsByStatus.active + countsByStatus.waiting,
    closedCount: countsByStatus.completed + countsByStatus.cancelled,
  };
}

export function buildTeachingReflectionDetailReadModel(
  input: TeachingReflectionReadModelInput,
): TeachingReflectionDetailReadModel {
  const reflection = teachingReflectionRecordSchema.parse(input.reflection);
  const schoolYear = input.schoolYear ? schoolYearSchema.parse(input.schoolYear) : undefined;
  const context = input.context ? learnerContextSchema.parse(input.context) : undefined;
  const lessonPlan = input.lessonPlan ? lessonPlanSchema.parse(input.lessonPlan) : undefined;
  const sessionOccurrence = input.sessionOccurrence
    ? sessionOccurrenceSchema.parse(input.sessionOccurrence)
    : undefined;

  return {
    reflection,
    source: buildSource(reflection, schoolYear, context, lessonPlan, sessionOccurrence),
    relatedEvidence: buildEvidence(
      reflection,
      input.assessmentEvidence ?? [],
      input.studentRecords ?? [],
    ),
    nextSteps: buildNextSteps(reflection, input.tasks ?? []),
  };
}

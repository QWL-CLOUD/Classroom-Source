import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  learnerContextSchema,
  rosterMembershipSchema,
  schoolYearSchema,
  studentRecordSchema,
  type LearnerContext,
  type RosterMembership,
  type StudentRecord,
} from '@/domain/models/entities';

export interface StudentContextReference {
  context: LearnerContext;
  schoolYearLabel: string;
  role?: string;
}

export interface StudentTeachingSummary {
  planCount: number;
  sessionCount: number;
  completedSessionCount: number;
  supportRecordCount: number;
  openTaskCount: number;
}

export interface StudentDirectoryRow {
  student: StudentRecord;
  classCount: number;
  groupCount: number;
  individualCount: number;
}

export interface StudentProfileSnapshot {
  student: StudentRecord;
  classMemberships: StudentContextReference[];
  groupMemberships: StudentContextReference[];
  individualContexts: StudentContextReference[];
  teachingSummary: StudentTeachingSummary;
}

export interface StudentDirectorySnapshot {
  rows: StudentDirectoryRow[];
  activeCount: number;
  archivedCount: number;
  selectedProfile?: StudentProfileSnapshot;
}

function compareStudents(first: StudentRecord, second: StudentRecord): number {
  return (
    (first.preferredName ?? first.name).localeCompare(second.preferredName ?? second.name) ||
    first.name.localeCompare(second.name) ||
    first.id.localeCompare(second.id)
  );
}

function compareReferences(
  first: StudentContextReference,
  second: StudentContextReference,
): number {
  return (
    first.schoolYearLabel.localeCompare(second.schoolYearLabel) ||
    first.context.name.localeCompare(second.context.name) ||
    first.context.id.localeCompare(second.context.id)
  );
}

export class StudentDirectoryReadService {
  constructor(private readonly db: ClassroomDatabase = classroomDb) {}

  async load(selectedStudentId?: string): Promise<StudentDirectorySnapshot> {
    const [
      studentValues,
      membershipValues,
      contextValues,
      schoolYearValues,
      lessonPlans,
      sessions,
      notices,
      tasks,
    ] = await Promise.all([
      this.db.studentRecords.toArray(),
      this.db.rosterMemberships.toArray(),
      this.db.learnerContexts.toArray(),
      this.db.schoolYears.toArray(),
      this.db.lessonPlans.toArray(),
      this.db.sessionOccurrences.toArray(),
      this.db.learnerNotices.toArray(),
      this.db.tasks.toArray(),
    ]);

    const students = studentValues
      .map((value) => studentRecordSchema.parse(value))
      .sort(compareStudents);
    const memberships = membershipValues.map((value) => rosterMembershipSchema.parse(value));
    const contexts = contextValues.map((value) => learnerContextSchema.parse(value));
    const schoolYears = schoolYearValues.map((value) => schoolYearSchema.parse(value));

    const contextById = new Map(contexts.map((context) => [context.id, context]));
    const schoolYearLabelById = new Map(
      schoolYears.map((schoolYear) => [schoolYear.id, schoolYear.label]),
    );

    const membershipsByStudentId = new Map<string, RosterMembership[]>();
    for (const membership of memberships) {
      const current = membershipsByStudentId.get(membership.studentId) ?? [];
      current.push(membership);
      membershipsByStudentId.set(membership.studentId, current);
    }

    const linkedIndividualsByStudentId = new Map<string, LearnerContext[]>();
    for (const context of contexts) {
      if (context.kind !== 'individual' || !context.linkedStudentId) continue;
      const current = linkedIndividualsByStudentId.get(context.linkedStudentId) ?? [];
      current.push(context);
      linkedIndividualsByStudentId.set(context.linkedStudentId, current);
    }

    const rows = students.map((student): StudentDirectoryRow => {
      let classCount = 0;
      let groupCount = 0;
      for (const membership of membershipsByStudentId.get(student.id) ?? []) {
        const context = contextById.get(membership.contextId);
        if (context?.kind === 'class') classCount += 1;
        if (context?.kind === 'group') groupCount += 1;
      }
      return {
        student,
        classCount,
        groupCount,
        individualCount: linkedIndividualsByStudentId.get(student.id)?.length ?? 0,
      };
    });

    const selectedStudent = selectedStudentId
      ? students.find((student) => student.id === selectedStudentId)
      : undefined;
    const selectedProfile = selectedStudent
      ? this.buildProfile(
          selectedStudent,
          membershipsByStudentId.get(selectedStudent.id) ?? [],
          linkedIndividualsByStudentId.get(selectedStudent.id) ?? [],
          contextById,
          schoolYearLabelById,
          lessonPlans,
          sessions,
          notices,
          tasks,
        )
      : undefined;

    return {
      rows,
      activeCount: students.filter((student) => student.status === 'active').length,
      archivedCount: students.filter((student) => student.status === 'archived').length,
      selectedProfile,
    };
  }

  private buildProfile(
    student: StudentRecord,
    memberships: readonly RosterMembership[],
    linkedIndividuals: readonly LearnerContext[],
    contextById: ReadonlyMap<string, LearnerContext>,
    schoolYearLabelById: ReadonlyMap<string, string>,
    lessonPlans: readonly { contextId: string }[],
    sessions: readonly { contextId: string; deliveryState: string }[],
    notices: readonly { contextId: string }[],
    tasks: readonly { contextId?: string; status: string }[],
  ): StudentProfileSnapshot {
    const toReference = (context: LearnerContext, role?: string): StudentContextReference => ({
      context,
      schoolYearLabel: schoolYearLabelById.get(context.schoolYearId) ?? 'Unknown school year',
      role,
    });

    const classMemberships: StudentContextReference[] = [];
    const groupMemberships: StudentContextReference[] = [];
    for (const membership of memberships) {
      const context = contextById.get(membership.contextId);
      if (!context) continue;
      if (context.kind === 'class') {
        classMemberships.push(toReference(context, membership.role));
      } else if (context.kind === 'group') {
        groupMemberships.push(toReference(context, membership.role));
      }
    }

    const individualContexts = linkedIndividuals.map((context) => toReference(context));
    classMemberships.sort(compareReferences);
    groupMemberships.sort(compareReferences);
    individualContexts.sort(compareReferences);

    const relatedContextIds = new Set(
      [...classMemberships, ...groupMemberships, ...individualContexts].map(
        (reference) => reference.context.id,
      ),
    );

    return {
      student,
      classMemberships,
      groupMemberships,
      individualContexts,
      teachingSummary: {
        planCount: lessonPlans.filter((plan) => relatedContextIds.has(plan.contextId)).length,
        sessionCount: sessions.filter((session) => relatedContextIds.has(session.contextId)).length,
        completedSessionCount: sessions.filter(
          (session) =>
            relatedContextIds.has(session.contextId) && session.deliveryState === 'completed',
        ).length,
        supportRecordCount: notices.filter((notice) => relatedContextIds.has(notice.contextId))
          .length,
        openTaskCount: tasks.filter(
          (task) =>
            task.contextId &&
            relatedContextIds.has(task.contextId) &&
            (task.status === 'active' || task.status === 'waiting'),
        ).length,
      },
    };
  }
}

export const studentDirectoryReadService = new StudentDirectoryReadService();

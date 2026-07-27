import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  learnerContextSchema,
  rosterMembershipSchema,
  studentRecordSchema,
  type LearnerContext,
  type RosterMembership,
  type StudentRecord,
} from '@/domain/models/entities';

export interface RosterMemberRow {
  membership: RosterMembership;
  student: StudentRecord;
}

export interface ContextRosterSnapshot {
  context: LearnerContext;
  members: RosterMemberRow[];
  linkedStudent?: StudentRecord;
}

function compareStudents(first: StudentRecord, second: StudentRecord): number {
  return (
    (first.preferredName ?? first.name).localeCompare(second.preferredName ?? second.name) ||
    first.name.localeCompare(second.name) ||
    first.id.localeCompare(second.id)
  );
}

export class RosterReadService {
  constructor(private readonly db: ClassroomDatabase = classroomDb) {}

  async listStudents(status: StudentRecord['status'] = 'active'): Promise<StudentRecord[]> {
    return (await this.db.studentRecords.where('status').equals(status).toArray())
      .map((value) => studentRecordSchema.parse(value))
      .sort(compareStudents);
  }

  async loadContextRoster(contextId: string): Promise<ContextRosterSnapshot> {
    const contextValue = await this.db.learnerContexts.get(contextId);
    if (!contextValue) throw new Error('The planning context no longer exists.');
    const context = learnerContextSchema.parse(contextValue);

    if (context.kind === 'individual') {
      const linkedStudent = context.linkedStudentId
        ? await this.db.studentRecords.get(context.linkedStudentId)
        : undefined;
      return {
        context,
        members: [],
        linkedStudent: linkedStudent ? studentRecordSchema.parse(linkedStudent) : undefined,
      };
    }

    const memberships = (
      await this.db.rosterMemberships.where('contextId').equals(context.id).toArray()
    ).map((value) => rosterMembershipSchema.parse(value));
    const students = await this.db.studentRecords.bulkGet(
      memberships.map((membership) => membership.studentId),
    );
    const studentById = new Map(
      students
        .filter((value): value is StudentRecord => Boolean(value))
        .map((value) => {
          const parsed = studentRecordSchema.parse(value);
          return [parsed.id, parsed] as const;
        }),
    );

    const members = memberships
      .map((membership) => {
        const student = studentById.get(membership.studentId);
        return student ? { membership, student } : null;
      })
      .filter((value): value is RosterMemberRow => Boolean(value))
      .sort((first, second) => compareStudents(first.student, second.student));

    return { context, members };
  }
}

export const rosterReadService = new RosterReadService();

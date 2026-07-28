import { z } from 'zod';

import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  changeLogSchema,
  learnerContextSchema,
  rosterMembershipSchema,
  studentRecordSchema,
  type ChangeLog,
  type LearnerContext,
  type RosterMembership,
  type StudentRecord,
} from '@/domain/models/entities';
import { clearSupportedRedoBranch } from '@/features/editing/editCommandRegistry';
import { notifyEditHistoryChanged } from '@/features/editing/editHistorySignal';

import { applyRosterOperations } from './applyRosterOperations';
import {
  createRosterCommand,
  deleteRosterMembershipOperation,
  deleteStudentRecordOperation,
  putLinkedIndividualContextOperation,
  putRosterMembershipOperation,
  putStudentRecordOperation,
  serializeRosterCommand,
  type RosterCommandPair,
  type RosterOperation,
} from './rosterCommands';

const optionalTrimmedString = (maximum: number) =>
  z.preprocess((value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().max(maximum).optional());

export const studentRecordValuesSchema = z.object({
  name: z.string().trim().min(1, 'Enter a student name.').max(200),
  preferredName: optionalTrimmedString(200),
  notes: optionalTrimmedString(5000),
});

export const rosterMembershipValuesSchema = z.object({
  contextId: z.string().min(1),
  studentId: z.string().min(1),
  role: optionalTrimmedString(200),
});

export type StudentRecordValues = z.input<typeof studentRecordValuesSchema>;
export type RosterMembershipValues = z.input<typeof rosterMembershipValuesSchema>;

const rosterImportItemSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('existing'),
    studentId: z.string().min(1),
    role: optionalTrimmedString(200),
  }),
  z.object({
    kind: z.literal('new'),
    student: studentRecordValuesSchema,
    role: optionalTrimmedString(200),
  }),
]);

export type RosterImportItem = z.input<typeof rosterImportItemSchema>;

export interface RosterImportResult {
  memberships: RosterMembership[];
  createdStudents: number;
  reusedStudents: number;
}

export interface RosterMutationDependencies {
  createId?: () => string;
  now?: () => string;
}

interface CommitResult<T> {
  value: T;
  log: ChangeLog;
}

export class RosterMutationService {
  private readonly createId: () => string;
  private readonly now: () => string;

  constructor(
    private readonly db: ClassroomDatabase = classroomDb,
    dependencies: RosterMutationDependencies = {},
  ) {
    this.createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  async createStudent(values: StudentRecordValues): Promise<StudentRecord> {
    const profile = studentRecordValuesSchema.parse(values);
    const createdAt = this.now();
    const student = studentRecordSchema.parse({
      id: this.createId(),
      ...profile,
      status: 'active',
      createdAt,
      updatedAt: createdAt,
    });

    const commands: RosterCommandPair = {
      forward: createRosterCommand([putStudentRecordOperation(student)]),
      inverse: createRosterCommand([deleteStudentRecordOperation(student.id)]),
    };
    const result = await this.db.transaction(
      'rw',
      this.db.studentRecords,
      this.db.changeLog,
      async (): Promise<CommitResult<StudentRecord>> => {
        const log = this.createChangeLog(
          'roster.student-create',
          `Create student “${student.name}”`,
          commands,
        );
        await clearSupportedRedoBranch(this.db);
        await applyRosterOperations(this.db, commands.forward.operations);
        await this.db.changeLog.put(log);
        return { value: student, log };
      },
    );
    this.notifyNewChange(result.log);
    return result.value;
  }

  async createStudentAndLinkIndividual(
    contextId: string,
    values: StudentRecordValues,
  ): Promise<{ student: StudentRecord; context: LearnerContext }> {
    const profile = studentRecordValuesSchema.parse(values);

    const result = await this.db.transaction(
      'rw',
      [this.db.learnerContexts, this.db.studentRecords, this.db.changeLog],
      async (): Promise<
        CommitResult<{
          student: StudentRecord;
          context: LearnerContext;
        }>
      > => {
        const context = await this.requireContext(contextId);
        if (context.kind !== 'individual') {
          throw new Error('Only an Individual context can link to a student record.');
        }
        if (context.status !== 'active') {
          throw new Error('Restore the Individual context before linking a Student.');
        }
        if (context.linkedStudentId) {
          throw new Error('Unlink the current Student before creating another Student link.');
        }

        const createdAt = this.now();
        const student = studentRecordSchema.parse({
          id: this.createId(),
          ...profile,
          status: 'active',
          createdAt,
          updatedAt: createdAt,
        });
        const updatedContext = learnerContextSchema.parse({
          ...context,
          linkedStudentId: student.id,
        });

        const commands: RosterCommandPair = {
          forward: createRosterCommand([
            putStudentRecordOperation(student),
            putLinkedIndividualContextOperation(updatedContext),
          ]),
          inverse: createRosterCommand([
            putLinkedIndividualContextOperation(context),
            deleteStudentRecordOperation(student.id),
          ]),
        };
        const log = this.createChangeLog(
          'roster.student-create-and-link',
          `Create student “${student.name}” and link to ${context.name}`,
          commands,
        );

        await clearSupportedRedoBranch(this.db);
        await applyRosterOperations(this.db, commands.forward.operations);
        await this.db.changeLog.put(log);
        return {
          value: { student, context: updatedContext },
          log,
        };
      },
    );

    this.notifyNewChange(result.log);
    return result.value;
  }

  async createStudentAndAddToRoster(
    contextId: string,
    values: StudentRecordValues,
    role?: string,
  ): Promise<{ student: StudentRecord; membership: RosterMembership }> {
    const profile = studentRecordValuesSchema.parse(values);
    const parsedRole = optionalTrimmedString(200).parse(role);

    const result = await this.db.transaction(
      'rw',
      [
        this.db.learnerContexts,
        this.db.studentRecords,
        this.db.rosterMemberships,
        this.db.changeLog,
      ],
      async (): Promise<
        CommitResult<{
          student: StudentRecord;
          membership: RosterMembership;
        }>
      > => {
        const context = await this.requireContext(contextId);
        if (context.kind === 'individual') {
          throw new Error('Individual contexts do not have rosters.');
        }
        if (context.status !== 'active') {
          throw new Error('Restore the Class or Group before adding students.');
        }

        const createdAt = this.now();
        const student = studentRecordSchema.parse({
          id: this.createId(),
          ...profile,
          status: 'active',
          createdAt,
          updatedAt: createdAt,
        });
        const membership = rosterMembershipSchema.parse({
          id: this.createId(),
          contextId: context.id,
          studentId: student.id,
          role: parsedRole,
          createdAt,
        });

        const commands: RosterCommandPair = {
          forward: createRosterCommand([
            putStudentRecordOperation(student),
            putRosterMembershipOperation(membership),
          ]),
          inverse: createRosterCommand([
            deleteRosterMembershipOperation(membership.id),
            deleteStudentRecordOperation(student.id),
          ]),
        };
        const log = this.createChangeLog(
          'roster.student-create-and-add',
          `Create student “${student.name}” and add to ${context.name}`,
          commands,
        );

        await clearSupportedRedoBranch(this.db);
        await applyRosterOperations(this.db, commands.forward.operations);
        await this.db.changeLog.put(log);
        return {
          value: { student, membership },
          log,
        };
      },
    );

    this.notifyNewChange(result.log);
    return result.value;
  }

  async updateStudent(id: string, values: StudentRecordValues): Promise<StudentRecord> {
    const profile = studentRecordValuesSchema.parse(values);
    const result = await this.db.transaction(
      'rw',
      this.db.studentRecords,
      this.db.changeLog,
      async (): Promise<CommitResult<StudentRecord>> => {
        const existing = await this.requireStudent(id);
        const updated = studentRecordSchema.parse({
          ...existing,
          ...profile,
          id: existing.id,
          status: existing.status,
          archivedAt: existing.archivedAt,
          createdAt: existing.createdAt,
          updatedAt: this.now(),
        });
        const commands: RosterCommandPair = {
          forward: createRosterCommand([putStudentRecordOperation(updated)]),
          inverse: createRosterCommand([putStudentRecordOperation(existing)]),
        };
        const log = this.createChangeLog(
          'roster.student-update',
          `Edit student “${updated.name}”`,
          commands,
        );
        await clearSupportedRedoBranch(this.db);
        await applyRosterOperations(this.db, commands.forward.operations);
        await this.db.changeLog.put(log);
        return { value: updated, log };
      },
    );
    this.notifyNewChange(result.log);
    return result.value;
  }

  async archiveStudent(id: string): Promise<StudentRecord> {
    return this.setStudentStatus(id, 'archived');
  }

  async restoreStudent(id: string): Promise<StudentRecord> {
    return this.setStudentStatus(id, 'active');
  }

  async addToRoster(values: RosterMembershipValues): Promise<RosterMembership> {
    const input = rosterMembershipValuesSchema.parse(values);
    const result = await this.db.transaction(
      'rw',
      [
        this.db.learnerContexts,
        this.db.studentRecords,
        this.db.rosterMemberships,
        this.db.changeLog,
      ],
      async (): Promise<CommitResult<RosterMembership>> => {
        const context = await this.requireContext(input.contextId);
        if (context.kind === 'individual') {
          throw new Error('Individual contexts do not have rosters.');
        }
        if (context.status !== 'active') {
          throw new Error('Restore the Class or Group before adding students.');
        }

        const student = await this.requireStudent(input.studentId);
        if (student.status !== 'active') {
          throw new Error('Restore the student before adding them to a roster.');
        }

        const duplicate = await this.db.rosterMemberships
          .where('[contextId+studentId]')
          .equals([context.id, student.id])
          .first();
        if (duplicate) {
          throw new Error(`${student.name} is already in ${context.name}.`);
        }

        const membership = rosterMembershipSchema.parse({
          id: this.createId(),
          contextId: context.id,
          studentId: student.id,
          role: input.role,
          createdAt: this.now(),
        });
        const commands: RosterCommandPair = {
          forward: createRosterCommand([putRosterMembershipOperation(membership)]),
          inverse: createRosterCommand([deleteRosterMembershipOperation(membership.id)]),
        };
        const log = this.createChangeLog(
          'roster.membership-add',
          `Add ${student.name} to ${context.name}`,
          commands,
        );
        await clearSupportedRedoBranch(this.db);
        await applyRosterOperations(this.db, commands.forward.operations);
        await this.db.changeLog.put(log);
        return { value: membership, log };
      },
    );

    this.notifyNewChange(result.log);
    return result.value;
  }

  async importRoster(
    contextId: string,
    values: readonly RosterImportItem[],
  ): Promise<RosterImportResult> {
    const items = z.array(rosterImportItemSchema).min(1).max(500).parse(values);
    const result = await this.db.transaction(
      'rw',
      [
        this.db.learnerContexts,
        this.db.studentRecords,
        this.db.rosterMemberships,
        this.db.changeLog,
      ],
      async (): Promise<CommitResult<RosterImportResult>> => {
        const context = await this.requireContext(contextId);
        if (context.kind === 'individual') {
          throw new Error('Individual contexts do not have rosters.');
        }
        if (context.status !== 'active') {
          throw new Error('Restore the Class or Group before importing students.');
        }

        const existingMemberships = await this.db.rosterMemberships
          .where('contextId')
          .equals(context.id)
          .toArray();
        const memberStudentIds = new Set(
          existingMemberships.map((membership) => membership.studentId),
        );
        const requestedStudentIds = new Set<string>();
        const forwardOperations: RosterOperation[] = [];
        const inverseMembershipOperations: RosterOperation[] = [];
        const inverseStudentOperations: RosterOperation[] = [];
        const memberships: RosterMembership[] = [];
        let createdStudents = 0;
        let reusedStudents = 0;

        for (const item of items) {
          let student: StudentRecord;
          if (item.kind === 'existing') {
            student = await this.requireStudent(item.studentId);
            if (student.status !== 'active') {
              throw new Error(`Restore ${student.name} before importing them to a roster.`);
            }
            reusedStudents += 1;
          } else {
            const profile = studentRecordValuesSchema.parse(item.student);
            const createdAt = this.now();
            student = studentRecordSchema.parse({
              id: this.createId(),
              ...profile,
              status: 'active',
              createdAt,
              updatedAt: createdAt,
            });
            forwardOperations.push(putStudentRecordOperation(student));
            inverseStudentOperations.unshift(deleteStudentRecordOperation(student.id));
            createdStudents += 1;
          }

          if (memberStudentIds.has(student.id) || requestedStudentIds.has(student.id)) {
            throw new Error(`${student.name} is already included in this import.`);
          }
          requestedStudentIds.add(student.id);

          const membership = rosterMembershipSchema.parse({
            id: this.createId(),
            contextId: context.id,
            studentId: student.id,
            role: item.role,
            createdAt: this.now(),
          });
          memberships.push(membership);
          forwardOperations.push(putRosterMembershipOperation(membership));
          inverseMembershipOperations.unshift(deleteRosterMembershipOperation(membership.id));
        }

        const commands: RosterCommandPair = {
          forward: createRosterCommand(forwardOperations),
          inverse: createRosterCommand([
            ...inverseMembershipOperations,
            ...inverseStudentOperations,
          ]),
        };
        const label = `Import ${memberships.length} student${
          memberships.length === 1 ? '' : 's'
        } to ${context.name}`;
        const log = this.createChangeLog('roster.membership-import', label, commands);

        await clearSupportedRedoBranch(this.db);
        await applyRosterOperations(this.db, commands.forward.operations);
        await this.db.changeLog.put(log);
        return {
          value: { memberships, createdStudents, reusedStudents },
          log,
        };
      },
    );

    this.notifyNewChange(result.log);
    return result.value;
  }

  async removeFromRoster(membershipId: string): Promise<void> {
    const log = await this.db.transaction(
      'rw',
      [
        this.db.learnerContexts,
        this.db.studentRecords,
        this.db.rosterMemberships,
        this.db.changeLog,
      ],
      async () => {
        const existingValue = await this.db.rosterMemberships.get(membershipId);
        if (!existingValue) throw new Error('The roster membership no longer exists.');
        const existing = rosterMembershipSchema.parse(existingValue);
        const [context, student] = await Promise.all([
          this.requireContext(existing.contextId),
          this.requireStudent(existing.studentId),
        ]);
        const commands: RosterCommandPair = {
          forward: createRosterCommand([deleteRosterMembershipOperation(existing.id)]),
          inverse: createRosterCommand([putRosterMembershipOperation(existing)]),
        };
        const nextLog = this.createChangeLog(
          'roster.membership-remove',
          `Remove ${student.name} from ${context.name}`,
          commands,
        );
        await clearSupportedRedoBranch(this.db);
        await applyRosterOperations(this.db, commands.forward.operations);
        await this.db.changeLog.put(nextLog);
        return nextLog;
      },
    );

    this.notifyNewChange(log);
  }

  async linkIndividualContext(contextId: string, studentId: string): Promise<LearnerContext> {
    const result = await this.db.transaction(
      'rw',
      [this.db.learnerContexts, this.db.studentRecords, this.db.changeLog],
      async (): Promise<CommitResult<LearnerContext>> => {
        const context = await this.requireContext(contextId);
        if (context.kind !== 'individual') {
          throw new Error('Only an Individual context can link to a student record.');
        }
        if (context.status !== 'active') {
          throw new Error('Restore the Individual context before linking a Student.');
        }
        const student = await this.requireStudent(studentId);
        if (student.status !== 'active') {
          throw new Error('Restore the student before linking an Individual context.');
        }
        if (context.linkedStudentId === student.id) {
          throw new Error('This Individual context is already linked to that student.');
        }

        const updated = learnerContextSchema.parse({
          ...context,
          linkedStudentId: student.id,
        });
        const commands: RosterCommandPair = {
          forward: createRosterCommand([putLinkedIndividualContextOperation(updated)]),
          inverse: createRosterCommand([putLinkedIndividualContextOperation(context)]),
        };
        const log = this.createChangeLog(
          'roster.individual-link',
          `Link ${context.name} to student ${student.name}`,
          commands,
        );
        await clearSupportedRedoBranch(this.db);
        await applyRosterOperations(this.db, commands.forward.operations);
        await this.db.changeLog.put(log);
        return { value: updated, log };
      },
    );

    this.notifyNewChange(result.log);
    return result.value;
  }

  async unlinkIndividualContext(contextId: string): Promise<LearnerContext> {
    const result = await this.db.transaction(
      'rw',
      [this.db.learnerContexts, this.db.studentRecords, this.db.changeLog],
      async (): Promise<CommitResult<LearnerContext>> => {
        const context = await this.requireContext(contextId);
        if (context.kind !== 'individual') {
          throw new Error('Only an Individual context can have a student link.');
        }
        if (context.status !== 'active') {
          throw new Error('Restore the Individual context before unlinking a Student.');
        }
        if (!context.linkedStudentId) {
          throw new Error('This Individual context is not linked to a student.');
        }
        const student = await this.requireStudent(context.linkedStudentId);
        const updated = learnerContextSchema.parse({
          ...context,
          linkedStudentId: undefined,
        });
        const commands: RosterCommandPair = {
          forward: createRosterCommand([putLinkedIndividualContextOperation(updated)]),
          inverse: createRosterCommand([putLinkedIndividualContextOperation(context)]),
        };
        const log = this.createChangeLog(
          'roster.individual-unlink',
          `Unlink ${context.name} from student ${student.name}`,
          commands,
        );
        await clearSupportedRedoBranch(this.db);
        await applyRosterOperations(this.db, commands.forward.operations);
        await this.db.changeLog.put(log);
        return { value: updated, log };
      },
    );

    this.notifyNewChange(result.log);
    return result.value;
  }

  private async setStudentStatus(
    id: string,
    status: StudentRecord['status'],
  ): Promise<StudentRecord> {
    const result = await this.db.transaction(
      'rw',
      this.db.studentRecords,
      this.db.changeLog,
      async (): Promise<CommitResult<StudentRecord>> => {
        const existing = await this.requireStudent(id);
        if (existing.status === status) {
          throw new Error(
            status === 'active'
              ? 'This student is already active.'
              : 'This student is already archived.',
          );
        }
        const now = this.now();
        const updated = studentRecordSchema.parse({
          ...existing,
          status,
          archivedAt: status === 'archived' ? now : undefined,
          updatedAt: now,
        });
        const verb = status === 'active' ? 'Restore' : 'Archive';
        const commands: RosterCommandPair = {
          forward: createRosterCommand([putStudentRecordOperation(updated)]),
          inverse: createRosterCommand([putStudentRecordOperation(existing)]),
        };
        const log = this.createChangeLog(
          status === 'active' ? 'roster.student-restore' : 'roster.student-archive',
          `${verb} student “${updated.name}”`,
          commands,
        );
        await clearSupportedRedoBranch(this.db);
        await applyRosterOperations(this.db, commands.forward.operations);
        await this.db.changeLog.put(log);
        return { value: updated, log };
      },
    );

    this.notifyNewChange(result.log);
    return result.value;
  }

  private createChangeLog(
    commandType: string,
    label: string,
    commands: RosterCommandPair,
  ): ChangeLog {
    return changeLogSchema.parse({
      id: this.createId(),
      label,
      commandType,
      forwardJson: serializeRosterCommand(commands.forward),
      inverseJson: serializeRosterCommand(commands.inverse),
      createdAt: this.now(),
    });
  }

  private async requireStudent(id: string): Promise<StudentRecord> {
    const value = await this.db.studentRecords.get(id);
    if (!value) throw new Error('The student record no longer exists.');
    return studentRecordSchema.parse(value);
  }

  private async requireContext(id: string): Promise<LearnerContext> {
    const value = await this.db.learnerContexts.get(id);
    if (!value) throw new Error('The planning context no longer exists.');
    return learnerContextSchema.parse(value);
  }

  private notifyNewChange(log: ChangeLog): void {
    notifyEditHistoryChanged({
      canUndo: true,
      canRedo: false,
      undoLabel: log.label,
    });
  }
}

export const rosterMutationService = new RosterMutationService();

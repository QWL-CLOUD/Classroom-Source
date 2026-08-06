import { z } from 'zod';

import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  changeLogSchema,
  learnerContextSchema,
  lessonPlanSchema,
  schoolYearSchema,
  sessionOccurrenceSchema,
  teachingReflectionRecordSchema,
  type ChangeLog,
  type SessionOccurrence,
  type TeachingReflectionRecord,
} from '@/domain/models/entities';
import { clearSupportedRedoBranch } from '@/features/editing/editCommandRegistry';
import { notifyEditHistoryChanged } from '@/features/editing/editHistorySignal';

import { applyTeachingReflectionOperations } from './applyTeachingReflectionOperations';
import {
  createTeachingReflectionCommand,
  deleteTeachingReflectionOperation,
  putReflectionSessionOperation,
  putTeachingReflectionOperation,
  serializeTeachingReflectionCommand,
  type TeachingReflectionCommandPair,
} from './teachingReflectionCommands';

const optionalNarrativeSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().max(10_000).optional());

export const teachingReflectionValuesSchema = z
  .object({
    whatWorked: optionalNarrativeSchema,
    whatToAdjust: optionalNarrativeSchema,
    additionalNotes: optionalNarrativeSchema,
  })
  .superRefine((value, context) => {
    if (!value.whatWorked && !value.whatToAdjust && !value.additionalNotes) {
      context.addIssue({
        code: 'custom',
        message: 'Enter at least one reflection note.',
        path: ['whatWorked'],
      });
    }
  });

export type TeachingReflectionValues = z.input<typeof teachingReflectionValuesSchema>;
type ParsedTeachingReflectionValues = z.output<typeof teachingReflectionValuesSchema>;

export interface TeachingReflectionMutationDependencies {
  createId?: () => string;
  now?: () => string;
}

interface CommitResult<T> {
  value: T;
  log: ChangeLog;
}

export class TeachingReflectionMutationService {
  private readonly createId: () => string;
  private readonly now: () => string;

  constructor(
    private readonly db: ClassroomDatabase = classroomDb,
    dependencies: TeachingReflectionMutationDependencies = {},
  ) {
    this.createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  async create(
    sessionOccurrenceId: string,
    values: TeachingReflectionValues,
  ): Promise<TeachingReflectionRecord> {
    const parsed = teachingReflectionValuesSchema.parse(values);
    const result = await this.db.transaction(
      'rw',
      this.createTables(),
      async (): Promise<CommitResult<TeachingReflectionRecord>> => {
        const session = await this.requireCompletedSession(sessionOccurrenceId);
        await this.requireNoExistingReflection(session);
        const [planRaw, contextRaw] = await Promise.all([
          this.db.lessonPlans.get(session.lessonPlanId),
          this.db.learnerContexts.get(session.contextId),
        ]);
        if (!planRaw) throw new Error('The Session Lesson Plan no longer exists.');
        if (!contextRaw) throw new Error('The Session context no longer exists.');

        const plan = lessonPlanSchema.parse(planRaw);
        const context = learnerContextSchema.parse(contextRaw);
        if (plan.contextId !== session.contextId) {
          throw new Error('The Session and Lesson Plan belong to different contexts.');
        }
        const schoolYearRaw = await this.db.schoolYears.get(context.schoolYearId);
        if (!schoolYearRaw) throw new Error('The Session school year no longer exists.');
        const schoolYear = schoolYearSchema.parse(schoolYearRaw);
        if (session.date < schoolYear.startsOn || session.date > schoolYear.endsOn) {
          throw new Error('The Session date falls outside its school year.');
        }

        const now = this.now();
        const created = teachingReflectionRecordSchema.parse({
          id: this.createId(),
          sessionOccurrenceId: session.id,
          schoolYearId: schoolYear.id,
          contextId: context.id,
          lessonPlanId: plan.id,
          occurredOn: session.date,
          whatWorked: parsed.whatWorked,
          whatToAdjust: parsed.whatToAdjust,
          additionalNotes: parsed.additionalNotes,
          sourceSnapshots: {
            context: { kind: context.kind, name: context.name },
            lessonPlan: { title: plan.title },
            sessionOccurrence: {
              date: session.date,
              startMinute: session.startMinute,
              endMinute: session.endMinute,
            },
          },
          status: 'active',
          createdAt: now,
          updatedAt: now,
        });
        const updatedSession = sessionOccurrenceSchema.parse({
          ...session,
          reflectionId: created.id,
        });
        const commands: TeachingReflectionCommandPair = {
          forward: createTeachingReflectionCommand([
            putTeachingReflectionOperation(created),
            putReflectionSessionOperation(updatedSession),
          ]),
          inverse: createTeachingReflectionCommand([
            deleteTeachingReflectionOperation(created.id),
            putReflectionSessionOperation(session),
          ]),
        };
        const log = this.createChangeLog(
          'teaching-reflection.create',
          `Add reflection for “${plan.title}”`,
          commands,
        );

        await clearSupportedRedoBranch(this.db);
        await applyTeachingReflectionOperations(this.db, commands.forward.operations);
        await this.db.changeLog.put(log);
        return { value: created, log };
      },
    );

    this.notifyNewChange(result.log);
    return result.value;
  }

  async update(id: string, values: TeachingReflectionValues): Promise<TeachingReflectionRecord> {
    const parsed = teachingReflectionValuesSchema.parse(values);
    const result = await this.db.transaction(
      'rw',
      this.db.teachingReflections,
      this.db.changeLog,
      async (): Promise<CommitResult<TeachingReflectionRecord>> => {
        const existing = await this.requireReflection(id);
        if (existing.status === 'archived') {
          throw new Error('Restore this Teaching Reflection before editing it.');
        }
        const updated = this.buildUpdatedRecord(existing, parsed);
        const commands: TeachingReflectionCommandPair = {
          forward: createTeachingReflectionCommand([putTeachingReflectionOperation(updated)]),
          inverse: createTeachingReflectionCommand([putTeachingReflectionOperation(existing)]),
        };
        const log = this.createChangeLog(
          'teaching-reflection.update',
          `Edit reflection for “${existing.sourceSnapshots.lessonPlan.title}”`,
          commands,
        );

        await clearSupportedRedoBranch(this.db);
        await applyTeachingReflectionOperations(this.db, commands.forward.operations);
        await this.db.changeLog.put(log);
        return { value: updated, log };
      },
    );

    this.notifyNewChange(result.log);
    return result.value;
  }

  async archive(id: string): Promise<TeachingReflectionRecord> {
    return this.setStatus(id, 'archived');
  }

  async restore(id: string): Promise<TeachingReflectionRecord> {
    return this.setStatus(id, 'active');
  }

  private async setStatus(
    id: string,
    status: TeachingReflectionRecord['status'],
  ): Promise<TeachingReflectionRecord> {
    const result = await this.db.transaction(
      'rw',
      this.db.teachingReflections,
      this.db.changeLog,
      async (): Promise<CommitResult<TeachingReflectionRecord>> => {
        const existing = await this.requireReflection(id);
        if (existing.status === status) {
          throw new Error(
            status === 'active'
              ? 'This Teaching Reflection is already active.'
              : 'This Teaching Reflection is already archived.',
          );
        }
        const now = this.now();
        const updated = teachingReflectionRecordSchema.parse({
          ...existing,
          status,
          updatedAt: now,
          archivedAt: status === 'archived' ? now : undefined,
        });
        const commands: TeachingReflectionCommandPair = {
          forward: createTeachingReflectionCommand([putTeachingReflectionOperation(updated)]),
          inverse: createTeachingReflectionCommand([putTeachingReflectionOperation(existing)]),
        };
        const action = status === 'archived' ? 'archive' : 'restore';
        const verb = status === 'archived' ? 'Archive' : 'Restore';
        const log = this.createChangeLog(
          `teaching-reflection.${action}`,
          `${verb} reflection for “${existing.sourceSnapshots.lessonPlan.title}”`,
          commands,
        );

        await clearSupportedRedoBranch(this.db);
        await applyTeachingReflectionOperations(this.db, commands.forward.operations);
        await this.db.changeLog.put(log);
        return { value: updated, log };
      },
    );

    this.notifyNewChange(result.log);
    return result.value;
  }

  private createTables() {
    return [
      this.db.teachingReflections,
      this.db.schoolYears,
      this.db.learnerContexts,
      this.db.lessonPlans,
      this.db.sessionOccurrences,
      this.db.changeLog,
    ];
  }

  private async requireCompletedSession(id: string): Promise<SessionOccurrence> {
    const raw = await this.db.sessionOccurrences.get(id);
    if (!raw) throw new Error('The selected Session no longer exists.');
    const session = sessionOccurrenceSchema.parse(raw);
    if (session.deliveryState !== 'completed') {
      throw new Error('A Teaching Reflection can only be added to a completed Session.');
    }
    return session;
  }

  private async requireNoExistingReflection(session: SessionOccurrence): Promise<void> {
    if (session.reflectionId) {
      throw new Error('This Session already has a Teaching Reflection link.');
    }
    const existing = await this.db.teachingReflections
      .where('sessionOccurrenceId')
      .equals(session.id)
      .first();
    if (existing) throw new Error('This Session already has a Teaching Reflection.');
  }

  private buildUpdatedRecord(
    existing: TeachingReflectionRecord,
    values: ParsedTeachingReflectionValues,
  ): TeachingReflectionRecord {
    return teachingReflectionRecordSchema.parse({
      ...existing,
      whatWorked: values.whatWorked,
      whatToAdjust: values.whatToAdjust,
      additionalNotes: values.additionalNotes,
      updatedAt: this.now(),
    });
  }

  private async requireReflection(id: string): Promise<TeachingReflectionRecord> {
    const raw = await this.db.teachingReflections.get(id);
    if (!raw) throw new Error('Teaching Reflection no longer exists.');
    return teachingReflectionRecordSchema.parse(raw);
  }

  private createChangeLog(
    commandType: string,
    label: string,
    commands: TeachingReflectionCommandPair,
  ): ChangeLog {
    return changeLogSchema.parse({
      id: this.createId(),
      label,
      commandType,
      forwardJson: serializeTeachingReflectionCommand(commands.forward),
      inverseJson: serializeTeachingReflectionCommand(commands.inverse),
      createdAt: this.now(),
    });
  }

  private notifyNewChange(log: ChangeLog): void {
    notifyEditHistoryChanged({
      canUndo: true,
      canRedo: false,
      undoLabel: log.label,
    });
  }
}

export const teachingReflectionMutationService = new TeachingReflectionMutationService();

import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  changeLogSchema,
  lessonPlanSchema,
  scheduleBlockSchema,
  scheduleExceptionSchema,
  sessionOccurrenceSchema,
  type ChangeLog,
  type LessonPlan,
  type ScheduleException,
  type SessionOccurrence,
} from '@/domain/models/entities';
import { clearSupportedRedoBranch } from '@/features/editing/editCommandRegistry';
import { notifyEditHistoryChanged } from '@/features/editing/editHistorySignal';
import { resolveScheduleOccurrence } from '@/features/scheduleExceptions/scheduleOccurrenceResolver';

import {
  createPlanningCommand,
  deleteLessonPlanOperation,
  deleteSessionOperation,
  putLessonPlanOperation,
  putSessionOperation,
  serializePlanningCommand,
  type PlanningCommandPair,
  type PlanningOperation,
} from './planningCommands';
import {
  parseLessonPlanEditorValues,
  parseSessionEditorValues,
  type LessonPlanEditorValues,
  type SessionEditorValues,
} from './planningEditorModel';

export interface PlanningMutationDependencies {
  createId?: () => string;
  now?: () => string;
}

interface CommitResult<T> {
  value: T;
  log: ChangeLog;
}

export class PlanningMutationService {
  private readonly createId: () => string;
  private readonly now: () => string;

  constructor(
    private readonly db: ClassroomDatabase = classroomDb,
    dependencies: PlanningMutationDependencies = {},
  ) {
    this.createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  async createPlan(contextId: string, values: LessonPlanEditorValues): Promise<LessonPlan> {
    const fields = parseLessonPlanEditorValues(values);
    const timestamp = this.now();
    const record = lessonPlanSchema.parse({
      id: this.createId(),
      contextId,
      ...fields,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const result = await this.db.transaction(
      'rw',
      this.db.learnerContexts,
      this.db.lessonPlans,
      this.db.sessionOccurrences,
      this.db.changeLog,
      async (): Promise<CommitResult<LessonPlan>> => {
        const context = await this.db.learnerContexts.get(contextId);
        if (!context) throw new Error('Learner context no longer exists.');
        if (await this.db.lessonPlans.get(record.id)) {
          throw new Error('Lesson plan ID already exists.');
        }

        const commands: PlanningCommandPair = {
          forward: createPlanningCommand([putLessonPlanOperation(record)]),
          inverse: createPlanningCommand([deleteLessonPlanOperation(record.id)]),
        };
        const log = this.createChangeLog(
          'planning.plan.create',
          `Create plan “${record.title}”`,
          commands,
        );

        await clearSupportedRedoBranch(this.db);
        await this.db.lessonPlans.add(record);
        await this.db.changeLog.put(log);
        return { value: record, log };
      },
    );
    this.notifyNewChange(result.log);
    return result.value;
  }

  async updatePlan(id: string, values: LessonPlanEditorValues): Promise<LessonPlan> {
    const fields = parseLessonPlanEditorValues(values);
    const result = await this.db.transaction(
      'rw',
      this.db.lessonPlans,
      this.db.sessionOccurrences,
      this.db.changeLog,
      async (): Promise<CommitResult<LessonPlan>> => {
        const existing = await this.requirePlan(id);
        const updated = lessonPlanSchema.parse({
          ...existing,
          ...fields,
          id,
          updatedAt: this.now(),
        });
        const commands: PlanningCommandPair = {
          forward: createPlanningCommand([putLessonPlanOperation(updated)]),
          inverse: createPlanningCommand([putLessonPlanOperation(existing)]),
        };
        const log = this.createChangeLog(
          'planning.plan.update',
          `Edit plan “${updated.title}”`,
          commands,
        );

        await clearSupportedRedoBranch(this.db);
        await this.db.lessonPlans.put(updated);
        await this.db.changeLog.put(log);
        return { value: updated, log };
      },
    );

    this.notifyNewChange(result.log);
    return result.value;
  }

  async deletePlan(id: string): Promise<void> {
    const log = await this.db.transaction(
      'rw',
      this.db.lessonPlans,
      this.db.sessionOccurrences,
      this.db.changeLog,
      async () => {
        const existing = await this.requirePlan(id);
        const sessions = await this.db.sessionOccurrences
          .where('lessonPlanId')
          .equals(id)
          .toArray();
        if (sessions.length > 0) {
          throw new Error('Remove the scheduled session before deleting this plan.');
        }
        const commands: PlanningCommandPair = {
          forward: createPlanningCommand([deleteLessonPlanOperation(id)]),
          inverse: createPlanningCommand([putLessonPlanOperation(existing)]),
        };
        const nextLog = this.createChangeLog(
          'planning.plan.delete',
          `Delete plan “${existing.title}”`,
          commands,
        );

        await clearSupportedRedoBranch(this.db);
        await this.db.lessonPlans.delete(id);
        await this.db.changeLog.put(nextLog);
        return nextLog;
      },
    );

    this.notifyNewChange(log);
  }

  async schedulePlan(planId: string, values: SessionEditorValues): Promise<SessionOccurrence> {
    const fields = parseSessionEditorValues(values);
    const result = await this.db.transaction(
      'rw',
      this.db.lessonPlans,
      this.db.sessionOccurrences,
      this.db.scheduleBlocks,
      this.db.scheduleExceptions,
      this.db.changeLog,
      async (): Promise<CommitResult<SessionOccurrence>> => {
        const plan = await this.requirePlan(planId);
        const existingSessions = (
          await this.db.sessionOccurrences.where('lessonPlanId').equals(planId).toArray()
        ).map((value) => sessionOccurrenceSchema.parse(value));
        if (
          existingSessions.some(
            (session) =>
              session.deliveryState === 'scheduled' || session.deliveryState === 'completed',
          )
        ) {
          throw new Error('This plan already has an active scheduled session.');
        }

        const resolvedFields = await this.resolveSessionFields(fields);
        const session = sessionOccurrenceSchema.parse({
          id: this.createId(),
          lessonPlanId: plan.id,
          contextId: plan.contextId,
          ...resolvedFields,
          deliveryState: 'scheduled',
        });
        const updatedPlan = lessonPlanSchema.parse({
          ...plan,
          updatedAt: this.now(),
        });
        const commands: PlanningCommandPair = {
          forward: createPlanningCommand([
            putLessonPlanOperation(updatedPlan),
            putSessionOperation(session),
          ]),
          inverse: createPlanningCommand([
            deleteSessionOperation(session.id),
            putLessonPlanOperation(plan),
          ]),
        };
        const log = this.createChangeLog(
          'planning.session.schedule',
          `Schedule “${plan.title}”`,
          commands,
        );

        await clearSupportedRedoBranch(this.db);
        await this.applyOperations(commands.forward.operations);
        await this.db.changeLog.put(log);
        return { value: session, log };
      },
    );

    this.notifyNewChange(result.log);
    return result.value;
  }

  async updateSession(id: string, values: SessionEditorValues): Promise<SessionOccurrence> {
    const fields = parseSessionEditorValues(values);
    const result = await this.db.transaction(
      'rw',
      this.db.lessonPlans,
      this.db.sessionOccurrences,
      this.db.scheduleBlocks,
      this.db.scheduleExceptions,
      this.db.changeLog,
      async (): Promise<CommitResult<SessionOccurrence>> => {
        const existing = await this.requireSession(id);
        const plan = await this.requirePlan(existing.lessonPlanId);
        const resolvedFields = await this.resolveSessionFields(fields);
        const updated = sessionOccurrenceSchema.parse({
          ...existing,
          ...resolvedFields,
          id,
        });
        const updatedPlan = lessonPlanSchema.parse({
          ...plan,
          updatedAt: this.now(),
        });
        const commands: PlanningCommandPair = {
          forward: createPlanningCommand([
            putLessonPlanOperation(updatedPlan),
            putSessionOperation(updated),
          ]),
          inverse: createPlanningCommand([
            putSessionOperation(existing),
            putLessonPlanOperation(plan),
          ]),
        };
        const log = this.createChangeLog(
          'planning.session.update',
          `Edit session “${plan.title}”`,
          commands,
        );

        await clearSupportedRedoBranch(this.db);
        await this.applyOperations(commands.forward.operations);
        await this.db.changeLog.put(log);
        return { value: updated, log };
      },
    );

    this.notifyNewChange(result.log);
    return result.value;
  }

  async completeSession(id: string): Promise<SessionOccurrence> {
    return this.setDeliveryState(id, 'completed');
  }

  async reopenSession(id: string): Promise<SessionOccurrence> {
    return this.setDeliveryState(id, 'scheduled');
  }

  async unscheduleSession(id: string): Promise<void> {
    const log = await this.db.transaction(
      'rw',
      this.db.lessonPlans,
      this.db.sessionOccurrences,
      this.db.changeLog,
      async () => {
        const existing = await this.requireSession(id);
        const plan = await this.requirePlan(existing.lessonPlanId);
        const updatedPlan = lessonPlanSchema.parse({
          ...plan,
          updatedAt: this.now(),
        });
        const commands: PlanningCommandPair = {
          forward: createPlanningCommand([
            deleteSessionOperation(existing.id),
            putLessonPlanOperation(updatedPlan),
          ]),
          inverse: createPlanningCommand([
            putSessionOperation(existing),
            putLessonPlanOperation(plan),
          ]),
        };
        const nextLog = this.createChangeLog(
          'planning.session.unschedule',
          `Unschedule “${plan.title}”`,
          commands,
        );

        await clearSupportedRedoBranch(this.db);
        await this.applyOperations(commands.forward.operations);
        await this.db.changeLog.put(nextLog);
        return nextLog;
      },
    );

    this.notifyNewChange(log);
  }

  private async setDeliveryState(
    id: string,
    deliveryState: 'scheduled' | 'completed',
  ): Promise<SessionOccurrence> {
    const result = await this.db.transaction(
      'rw',
      this.db.lessonPlans,
      this.db.sessionOccurrences,
      this.db.changeLog,
      async (): Promise<CommitResult<SessionOccurrence>> => {
        const existing = await this.requireSession(id);
        const plan = await this.requirePlan(existing.lessonPlanId);
        const updated = sessionOccurrenceSchema.parse({
          ...existing,
          deliveryState,
          completedAt: deliveryState === 'completed' ? this.now() : undefined,
        });
        const commands: PlanningCommandPair = {
          forward: createPlanningCommand([putSessionOperation(updated)]),
          inverse: createPlanningCommand([putSessionOperation(existing)]),
        };
        const verb = deliveryState === 'completed' ? 'Complete' : 'Reopen';
        const log = this.createChangeLog(
          `planning.session.${deliveryState}`,
          `${verb} “${plan.title}”`,
          commands,
        );

        await clearSupportedRedoBranch(this.db);
        await this.db.sessionOccurrences.put(updated);
        await this.db.changeLog.put(log);
        return { value: updated, log };
      },
    );

    this.notifyNewChange(result.log);
    return result.value;
  }

  private async resolveSessionFields(
    fields: ReturnType<typeof parseSessionEditorValues>,
  ): Promise<ReturnType<typeof parseSessionEditorValues>> {
    if (!fields.scheduleBlockId) return fields;

    const blockValue = await this.db.scheduleBlocks.get(fields.scheduleBlockId);
    if (!blockValue) throw new Error('The selected schedule block no longer exists.');
    const block = scheduleBlockSchema.parse(blockValue);
    const exceptionValues = await this.db.scheduleExceptions
      .where('date')
      .equals(fields.date)
      .toArray();
    const exceptions: ScheduleException[] = exceptionValues.map((value) =>
      scheduleExceptionSchema.parse(value),
    );
    const occurrence = resolveScheduleOccurrence(block, fields.date, exceptions);
    if (!occurrence) {
      throw new Error('The selected schedule block does not occur on this date.');
    }

    return {
      ...fields,
      startMinute: occurrence.block.startMinute,
      endMinute: occurrence.block.endMinute,
    };
  }

  private async requirePlan(id: string): Promise<LessonPlan> {
    const value = await this.db.lessonPlans.get(id);
    if (!value) throw new Error('Lesson plan no longer exists.');
    return lessonPlanSchema.parse(value);
  }

  private async requireSession(id: string): Promise<SessionOccurrence> {
    const value = await this.db.sessionOccurrences.get(id);
    if (!value) throw new Error('Session no longer exists.');
    return sessionOccurrenceSchema.parse(value);
  }

  private async applyOperations(operations: readonly PlanningOperation[]): Promise<void> {
    for (const operation of operations) {
      if (operation.table === 'lessonPlans') {
        if (operation.action === 'put') await this.db.lessonPlans.put(operation.record);
        else await this.db.lessonPlans.delete(operation.id);
      } else if (operation.action === 'put') {
        await this.db.sessionOccurrences.put(operation.record);
      } else {
        await this.db.sessionOccurrences.delete(operation.id);
      }
    }
  }

  private createChangeLog(
    commandType: string,
    label: string,
    commands: PlanningCommandPair,
  ): ChangeLog {
    return changeLogSchema.parse({
      id: this.createId(),
      label,
      commandType,
      forwardJson: serializePlanningCommand(commands.forward),
      inverseJson: serializePlanningCommand(commands.inverse),
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

export const planningMutationService = new PlanningMutationService();

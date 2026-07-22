import { z } from 'zod';

import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  changeLogSchema,
  learnerContextSchema,
  type ChangeLog,
  type LearnerContext,
} from '@/domain/models/entities';
import { clearSupportedRedoBranch } from '@/features/editing/editCommandRegistry';
import { notifyEditHistoryChanged } from '@/features/editing/editHistorySignal';

import {
  createLearnerContextCommand,
  deleteLearnerContextOperation,
  putLearnerContextOperation,
  serializeLearnerContextCommand,
  type LearnerContextCommandPair,
  type LearnerContextOperation,
} from './learnerContextCommands';

const optionalTrimmedString = (maximum: number) =>
  z.preprocess((value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().max(maximum).optional());

export const learnerContextProfileValuesSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name.').max(200),
  preferredName: optionalTrimmedString(200),
  notes: optionalTrimmedString(5000),
});

export const learnerContextCreateValuesSchema = learnerContextProfileValuesSchema.extend({
  kind: z.enum(['class', 'group', 'individual']),
  schoolYearId: z.string().min(1, 'Choose a school year.'),
});

export type LearnerContextProfileValues = z.input<typeof learnerContextProfileValuesSchema>;
export type LearnerContextCreateValues = z.input<typeof learnerContextCreateValuesSchema>;

export interface LearnerContextDeleteImpact {
  contextId: string;
  contextName: string;
  memberships: number;
  scheduleBlocks: number;
  calendarEvents: number;
  lessonSeries: number;
  lessonPlans: number;
  sessions: number;
  tasks: number;
  learnerNotices: number;
  totalLinkedRecords: number;
  canDelete: boolean;
}

export interface LearnerContextMutationDependencies {
  createId?: () => string;
  now?: () => string;
}

interface CommitResult<T> {
  value: T;
  log: ChangeLog;
}

export function learnerContextDeleteImpactItems(
  impact: LearnerContextDeleteImpact,
): Array<{ label: string; count: number }> {
  return [
    { label: 'Memberships', count: impact.memberships },
    { label: 'Schedule blocks', count: impact.scheduleBlocks },
    { label: 'Calendar events', count: impact.calendarEvents },
    { label: 'Lesson series', count: impact.lessonSeries },
    { label: 'Plans', count: impact.lessonPlans },
    { label: 'Sessions', count: impact.sessions },
    { label: 'Tasks', count: impact.tasks },
    { label: 'Learner notices', count: impact.learnerNotices },
  ].filter((item) => item.count > 0);
}

export function learnerContextDeleteBlockingMessage(impact: LearnerContextDeleteImpact): string {
  const items = learnerContextDeleteImpactItems(impact);
  if (items.length === 0) return '';
  const summary = items.map((item) => `${item.count} ${item.label.toLowerCase()}`).join(', ');
  return `“${impact.contextName}” cannot be deleted because it is linked to ${summary}. Archive it to preserve those records.`;
}

export class LearnerContextMutationService {
  private readonly createId: () => string;
  private readonly now: () => string;

  constructor(
    private readonly db: ClassroomDatabase = classroomDb,
    dependencies: LearnerContextMutationDependencies = {},
  ) {
    this.createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  async create(values: LearnerContextCreateValues): Promise<LearnerContext> {
    const input = learnerContextCreateValuesSchema.parse(values);
    const result = await this.db.transaction(
      'rw',
      this.db.schoolYears,
      this.db.learnerContexts,
      this.db.changeLog,
      async (): Promise<CommitResult<LearnerContext>> => {
        const schoolYear = await this.db.schoolYears.get(input.schoolYearId);
        if (!schoolYear) throw new Error('The selected school year no longer exists.');
        if (schoolYear.lifecycleState === 'archived') {
          throw new Error('Restore this school year before adding learner contexts.');
        }

        const normalizedName = input.name.toLocaleLowerCase('en');
        const duplicate = await this.db.learnerContexts
          .where('schoolYearId')
          .equals(input.schoolYearId)
          .filter(
            (context) =>
              context.kind === input.kind &&
              context.name.trim().toLocaleLowerCase('en') === normalizedName,
          )
          .first();
        if (duplicate) {
          throw new Error(
            `${this.kindLabel(input.kind)} “${input.name}” already exists in ${schoolYear.label}.`,
          );
        }

        const created = learnerContextSchema.parse({
          id: this.createId(),
          kind: input.kind,
          name: input.name,
          preferredName: input.kind === 'individual' ? input.preferredName : undefined,
          schoolYearId: input.schoolYearId,
          status: 'active',
          notes: input.notes,
        });
        const commands: LearnerContextCommandPair = {
          forward: createLearnerContextCommand([putLearnerContextOperation(created)]),
          inverse: createLearnerContextCommand([deleteLearnerContextOperation(created.id)]),
        };
        const log = this.createChangeLog(
          'learner-context.create',
          `Add ${this.kindLabel(created.kind)} “${created.name}”`,
          commands,
        );

        await clearSupportedRedoBranch(this.db);
        await this.applyOperations(commands.forward.operations);
        await this.db.changeLog.put(log);
        return { value: created, log };
      },
    );

    this.notifyNewChange(result.log);
    return result.value;
  }

  async update(id: string, values: LearnerContextProfileValues): Promise<LearnerContext> {
    const profile = learnerContextProfileValuesSchema.parse(values);
    const result = await this.db.transaction(
      'rw',
      this.db.learnerContexts,
      this.db.changeLog,
      async (): Promise<CommitResult<LearnerContext>> => {
        const existing = await this.requireContext(id);
        const updated = learnerContextSchema.parse({
          ...existing,
          ...profile,
          id: existing.id,
          kind: existing.kind,
          schoolYearId: existing.schoolYearId,
          status: existing.status,
        });
        const commands: LearnerContextCommandPair = {
          forward: createLearnerContextCommand([putLearnerContextOperation(updated)]),
          inverse: createLearnerContextCommand([putLearnerContextOperation(existing)]),
        };
        const log = this.createChangeLog(
          'learner-context.update',
          `Edit ${this.kindLabel(updated.kind)} “${updated.name}”`,
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

  async archive(id: string): Promise<LearnerContext> {
    return this.setStatus(id, 'archived');
  }

  async restore(id: string): Promise<LearnerContext> {
    return this.setStatus(id, 'active');
  }

  async previewDelete(id: string): Promise<LearnerContextDeleteImpact> {
    return this.db.transaction(
      'r',
      [
        this.db.learnerContexts,
        this.db.contextMemberships,
        this.db.scheduleBlocks,
        this.db.calendarEvents,
        this.db.lessonSeries,
        this.db.lessonPlans,
        this.db.sessionOccurrences,
        this.db.tasks,
        this.db.learnerNotices,
      ],
      async () => {
        const context = await this.requireContext(id);
        return this.readDeleteImpact(context);
      },
    );
  }

  async delete(id: string): Promise<void> {
    const log = await this.db.transaction(
      'rw',
      [
        this.db.learnerContexts,
        this.db.contextMemberships,
        this.db.scheduleBlocks,
        this.db.calendarEvents,
        this.db.lessonSeries,
        this.db.lessonPlans,
        this.db.sessionOccurrences,
        this.db.tasks,
        this.db.learnerNotices,
        this.db.changeLog,
      ],
      async () => {
        const existing = await this.requireContext(id);
        const impact = await this.readDeleteImpact(existing);
        if (!impact.canDelete) throw new Error(learnerContextDeleteBlockingMessage(impact));

        const commands: LearnerContextCommandPair = {
          forward: createLearnerContextCommand([deleteLearnerContextOperation(existing.id)]),
          inverse: createLearnerContextCommand([putLearnerContextOperation(existing)]),
        };
        const nextLog = this.createChangeLog(
          'learner-context.delete',
          `Delete empty ${this.kindLabel(existing.kind)} “${existing.name}”`,
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

  private async setStatus(id: string, status: LearnerContext['status']): Promise<LearnerContext> {
    const result = await this.db.transaction(
      'rw',
      this.db.learnerContexts,
      this.db.changeLog,
      async (): Promise<CommitResult<LearnerContext>> => {
        const existing = await this.requireContext(id);
        if (existing.status === status) {
          throw new Error(
            status === 'active'
              ? 'This learner context is already active.'
              : 'This learner context is already archived.',
          );
        }
        const updated = learnerContextSchema.parse({ ...existing, status });
        const verb = status === 'active' ? 'Restore' : 'Archive';
        const commands: LearnerContextCommandPair = {
          forward: createLearnerContextCommand([putLearnerContextOperation(updated)]),
          inverse: createLearnerContextCommand([putLearnerContextOperation(existing)]),
        };
        const log = this.createChangeLog(
          `learner-context.${status === 'active' ? 'restore' : 'archive'}`,
          `${verb} ${this.kindLabel(existing.kind)} “${existing.name}”`,
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

  private async readDeleteImpact(context: LearnerContext): Promise<LearnerContextDeleteImpact> {
    const [
      containerMemberships,
      memberMemberships,
      scheduleBlocks,
      calendarEvents,
      lessonSeries,
      lessonPlans,
      sessions,
      tasks,
      learnerNotices,
    ] = await Promise.all([
      this.db.contextMemberships.where('containerContextId').equals(context.id).toArray(),
      this.db.contextMemberships.where('memberContextId').equals(context.id).toArray(),
      this.db.scheduleBlocks.where('contextId').equals(context.id).count(),
      this.db.calendarEvents.where('contextId').equals(context.id).count(),
      this.db.lessonSeries.where('contextId').equals(context.id).count(),
      this.db.lessonPlans.where('contextId').equals(context.id).count(),
      this.db.sessionOccurrences.where('contextId').equals(context.id).count(),
      this.db.tasks.where('contextId').equals(context.id).count(),
      this.db.learnerNotices.where('contextId').equals(context.id).count(),
    ]);
    const memberships = new Set(
      [...containerMemberships, ...memberMemberships].map((membership) => membership.id),
    ).size;
    const totalLinkedRecords =
      memberships +
      scheduleBlocks +
      calendarEvents +
      lessonSeries +
      lessonPlans +
      sessions +
      tasks +
      learnerNotices;

    return {
      contextId: context.id,
      contextName: context.name,
      memberships,
      scheduleBlocks,
      calendarEvents,
      lessonSeries,
      lessonPlans,
      sessions,
      tasks,
      learnerNotices,
      totalLinkedRecords,
      canDelete: totalLinkedRecords === 0,
    };
  }

  private async requireContext(id: string): Promise<LearnerContext> {
    const value = await this.db.learnerContexts.get(id);
    if (!value) throw new Error('Learner context no longer exists.');
    return learnerContextSchema.parse(value);
  }

  private async applyOperations(operations: readonly LearnerContextOperation[]): Promise<void> {
    for (const operation of operations) {
      if (operation.table === 'learnerContexts') {
        if (operation.action === 'put') await this.db.learnerContexts.put(operation.record);
        else await this.db.learnerContexts.delete(operation.id);
      } else if (operation.action === 'put') {
        await this.db.contextMemberships.put(operation.record);
      } else {
        await this.db.contextMemberships.delete(operation.id);
      }
    }
  }

  private createChangeLog(
    commandType: string,
    label: string,
    commands: LearnerContextCommandPair,
  ): ChangeLog {
    return changeLogSchema.parse({
      id: this.createId(),
      label,
      commandType,
      forwardJson: serializeLearnerContextCommand(commands.forward),
      inverseJson: serializeLearnerContextCommand(commands.inverse),
      createdAt: this.now(),
    });
  }

  private kindLabel(kind: LearnerContext['kind']): string {
    return kind === 'class' ? 'Class' : kind === 'group' ? 'Group' : 'Individual';
  }

  private notifyNewChange(log: ChangeLog): void {
    notifyEditHistoryChanged({
      canUndo: true,
      canRedo: false,
      undoLabel: log.label,
    });
  }
}

export const learnerContextMutationService = new LearnerContextMutationService();

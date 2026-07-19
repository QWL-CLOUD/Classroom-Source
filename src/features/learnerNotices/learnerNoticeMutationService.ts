import { z } from 'zod';

import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  changeLogSchema,
  learnerNoticeSchema,
  taskSchema,
  type ChangeLog,
  type LearnerContext,
  type LearnerNotice,
  type LearnerNoticeStatus,
  type Task,
} from '@/domain/models/entities';
import { clearSupportedRedoBranch } from '@/features/editing/editCommandRegistry';
import { notifyEditHistoryChanged } from '@/features/editing/editHistorySignal';

import {
  createLearnerNoticeCommand,
  deleteFollowUpTaskOperation,
  deleteLearnerNoticeOperation,
  putFollowUpTaskOperation,
  putLearnerNoticeOperation,
  serializeLearnerNoticeCommand,
  type LearnerNoticeCommandPair,
  type LearnerNoticeOperation,
} from './learnerNoticeCommands';

const optionalTrimmedString = (maximum: number) =>
  z.preprocess((value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().max(maximum).optional());

const optionalLocalDate = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD.')
    .optional(),
);

export const learnerNoticeEditorValuesSchema = z
  .object({
    kind: z.enum(['ongoing-support', 'date-specific-notice', 'learner-service']),
    title: z.string().trim().min(1, 'Enter a notice title.').max(240),
    details: optionalTrimmedString(5000),
    noticeDate: optionalLocalDate,
  })
  .superRefine((value, context) => {
    if (value.kind === 'date-specific-notice' && !value.noticeDate) {
      context.addIssue({
        code: 'custom',
        message: 'Choose a date for a date-specific notice.',
        path: ['noticeDate'],
      });
    }
  });

export const createLearnerNoticeValuesSchema = learnerNoticeEditorValuesSchema.and(
  z.object({
    contextId: z.string().trim().min(1),
    createFollowUpTask: z.boolean().optional().default(false),
    followUpScheduledDate: optionalLocalDate,
  }),
);

export type LearnerNoticeEditorValues = z.input<typeof learnerNoticeEditorValuesSchema>;
export type CreateLearnerNoticeValues = z.input<typeof createLearnerNoticeValuesSchema>;

export interface LearnerNoticeDeleteImpact {
  noticeId: string;
  noticeTitle: string;
  reminders: number;
  followUpTasks: number;
  totalLinkedRecords: number;
  canDelete: boolean;
}

export interface LearnerNoticeCreateResult {
  notice: LearnerNotice;
  followUpTask?: Task;
}

export interface LearnerNoticeMutationDependencies {
  createId?: () => string;
  now?: () => string;
  order?: () => number;
}

interface CommitResult<T> {
  value: T;
  log: ChangeLog;
}

export function learnerNoticeDeleteBlockingMessage(impact: LearnerNoticeDeleteImpact): string {
  const links: string[] = [];
  if (impact.reminders)
    links.push(`${impact.reminders} reminder${impact.reminders === 1 ? '' : 's'}`);
  if (impact.followUpTasks) {
    links.push(`${impact.followUpTasks} follow-up task${impact.followUpTasks === 1 ? '' : 's'}`);
  }
  if (links.length === 0) return '';
  return `“${impact.noticeTitle}” cannot be deleted because it is linked to ${links.join(' and ')}. Archive it or remove those links first.`;
}

export class LearnerNoticeMutationService {
  private readonly createId: () => string;
  private readonly now: () => string;
  private readonly order: () => number;

  constructor(
    private readonly db: ClassroomDatabase = classroomDb,
    dependencies: LearnerNoticeMutationDependencies = {},
  ) {
    this.createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
    this.now = dependencies.now ?? (() => new Date().toISOString());
    this.order = dependencies.order ?? (() => Date.now());
  }

  async create(values: CreateLearnerNoticeValues): Promise<LearnerNoticeCreateResult> {
    const parsed = createLearnerNoticeValuesSchema.parse(values);
    const result = await this.db.transaction(
      'rw',
      this.db.learnerNotices,
      this.db.learnerContexts,
      this.db.tasks,
      this.db.changeLog,
      async (): Promise<CommitResult<LearnerNoticeCreateResult>> => {
        const context = await this.requireSelectableContext(parsed.contextId);
        const now = this.now();
        const notice = learnerNoticeSchema.parse({
          id: this.createId(),
          contextId: context.id,
          kind: parsed.kind,
          title: parsed.title,
          details: parsed.details,
          noticeDate: parsed.noticeDate,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        });
        const followUpTask = parsed.createFollowUpTask
          ? taskSchema.parse({
              id: this.createId(),
              title: `Follow up: ${notice.title}`,
              notes: notice.details,
              status: 'active',
              scheduledDate: parsed.followUpScheduledDate ?? notice.noticeDate,
              contextId: notice.contextId,
              linkedEntityType: 'learner-notice',
              linkedEntityId: notice.id,
              order: this.order(),
              createdAt: now,
              updatedAt: now,
            })
          : undefined;
        const forward = [putLearnerNoticeOperation(notice)];
        const inverse: LearnerNoticeOperation[] = [deleteLearnerNoticeOperation(notice.id)];
        if (followUpTask) {
          forward.push(putFollowUpTaskOperation(followUpTask));
          inverse.unshift(deleteFollowUpTaskOperation(followUpTask.id));
        }
        const commands: LearnerNoticeCommandPair = {
          forward: createLearnerNoticeCommand(forward),
          inverse: createLearnerNoticeCommand(inverse),
        };
        const log = this.createChangeLog(
          'learner-notice.create',
          `Create learner notice “${notice.title}”${followUpTask ? ' with follow-up task' : ''}`,
          commands,
          now,
        );
        await clearSupportedRedoBranch(this.db);
        await this.applyOperations(commands.forward.operations);
        await this.db.changeLog.put(log);
        return { value: { notice, followUpTask }, log };
      },
    );

    this.notifyNewChange(result.log);
    return result.value;
  }

  async update(id: string, values: LearnerNoticeEditorValues): Promise<LearnerNotice> {
    const parsed = learnerNoticeEditorValuesSchema.parse(values);
    return this.replace(id, 'learner-notice.update', 'Edit learner notice', (existing, now) => ({
      ...existing,
      ...parsed,
      updatedAt: now,
    }));
  }

  async resolve(id: string): Promise<LearnerNotice> {
    return this.setStatus(id, 'resolved');
  }

  async reopen(id: string): Promise<LearnerNotice> {
    return this.setStatus(id, 'active');
  }

  async archive(id: string): Promise<LearnerNotice> {
    return this.setStatus(id, 'archived');
  }

  async previewDelete(id: string): Promise<LearnerNoticeDeleteImpact> {
    return this.db.transaction(
      'r',
      this.db.learnerNotices,
      this.db.reminders,
      this.db.tasks,
      async () => this.readDeleteImpact(await this.requireNotice(id)),
    );
  }

  async delete(id: string): Promise<void> {
    const log = await this.db.transaction(
      'rw',
      this.db.learnerNotices,
      this.db.reminders,
      this.db.tasks,
      this.db.changeLog,
      async () => {
        const existing = await this.requireNotice(id);
        const impact = await this.readDeleteImpact(existing);
        if (!impact.canDelete) throw new Error(learnerNoticeDeleteBlockingMessage(impact));
        const now = this.now();
        const commands: LearnerNoticeCommandPair = {
          forward: createLearnerNoticeCommand([deleteLearnerNoticeOperation(existing.id)]),
          inverse: createLearnerNoticeCommand([putLearnerNoticeOperation(existing)]),
        };
        const nextLog = this.createChangeLog(
          'learner-notice.delete',
          `Delete learner notice “${existing.title}”`,
          commands,
          now,
        );
        await clearSupportedRedoBranch(this.db);
        await this.applyOperations(commands.forward.operations);
        await this.db.changeLog.put(nextLog);
        return nextLog;
      },
    );

    this.notifyNewChange(log);
  }

  private async replace(
    id: string,
    commandType: string,
    label: string,
    update: (existing: LearnerNotice, now: string) => LearnerNotice,
  ): Promise<LearnerNotice> {
    const result = await this.db.transaction(
      'rw',
      this.db.learnerNotices,
      this.db.changeLog,
      async (): Promise<CommitResult<LearnerNotice>> => {
        const existing = await this.requireNotice(id);
        const now = this.now();
        const updated = learnerNoticeSchema.parse(update(existing, now));
        const commands: LearnerNoticeCommandPair = {
          forward: createLearnerNoticeCommand([putLearnerNoticeOperation(updated)]),
          inverse: createLearnerNoticeCommand([putLearnerNoticeOperation(existing)]),
        };
        const log = this.createChangeLog(commandType, `${label} “${updated.title}”`, commands, now);
        await clearSupportedRedoBranch(this.db);
        await this.applyOperations(commands.forward.operations);
        await this.db.changeLog.put(log);
        return { value: updated, log };
      },
    );

    this.notifyNewChange(result.log);
    return result.value;
  }

  private async setStatus(id: string, status: LearnerNoticeStatus): Promise<LearnerNotice> {
    const existing = await this.requireNotice(id);
    if (existing.status === status) throw new Error(`This learner notice is already ${status}.`);
    if (status === 'resolved' && existing.status !== 'active') {
      throw new Error('Only active learner notices can be resolved.');
    }
    if (status === 'active' && existing.status === 'active') {
      throw new Error('This learner notice is already active.');
    }
    const action = status === 'active' ? 'Reopen' : status === 'resolved' ? 'Resolve' : 'Archive';
    return this.replace(
      id,
      `learner-notice.${status === 'active' ? 'reopen' : status}`,
      `${action} learner notice`,
      (current, now) => ({
        ...current,
        status,
        updatedAt: now,
        resolvedAt:
          status === 'resolved' ? now : status === 'active' ? undefined : current.resolvedAt,
        archivedAt:
          status === 'archived' ? now : status === 'active' ? undefined : current.archivedAt,
      }),
    );
  }

  private async readDeleteImpact(notice: LearnerNotice): Promise<LearnerNoticeDeleteImpact> {
    const [reminders, followUpTasks] = await Promise.all([
      this.db.reminders
        .where('[sourceType+sourceId]')
        .equals(['learner-notice', notice.id])
        .count(),
      this.db.tasks
        .filter(
          (task) => task.linkedEntityType === 'learner-notice' && task.linkedEntityId === notice.id,
        )
        .count(),
    ]);
    const totalLinkedRecords = reminders + followUpTasks;
    return {
      noticeId: notice.id,
      noticeTitle: notice.title,
      reminders,
      followUpTasks,
      totalLinkedRecords,
      canDelete: totalLinkedRecords === 0,
    };
  }

  private async requireSelectableContext(id: string): Promise<LearnerContext> {
    const context = await this.db.learnerContexts.get(id);
    if (!context) throw new Error('The selected learner context no longer exists.');
    if (context.status !== 'active') {
      throw new Error('Archived learner contexts cannot receive new support or notice records.');
    }
    return context;
  }

  private async requireNotice(id: string): Promise<LearnerNotice> {
    const notice = await this.db.learnerNotices.get(id);
    if (!notice) throw new Error('Learner notice not found.');
    return learnerNoticeSchema.parse(notice);
  }

  private async applyOperations(operations: readonly LearnerNoticeOperation[]): Promise<void> {
    for (const operation of operations) {
      if (operation.table === 'learnerNotices') {
        if (operation.action === 'put') await this.db.learnerNotices.put(operation.record);
        else await this.db.learnerNotices.delete(operation.id);
      } else if (operation.action === 'put') {
        await this.db.tasks.put(operation.record);
      } else {
        await this.db.tasks.delete(operation.id);
      }
    }
  }

  private createChangeLog(
    commandType: string,
    label: string,
    commands: LearnerNoticeCommandPair,
    createdAt: string,
  ): ChangeLog {
    return changeLogSchema.parse({
      id: this.createId(),
      label,
      commandType,
      forwardJson: serializeLearnerNoticeCommand(commands.forward),
      inverseJson: serializeLearnerNoticeCommand(commands.inverse),
      createdAt,
    });
  }

  private notifyNewChange(log: ChangeLog): void {
    notifyEditHistoryChanged({ canUndo: true, canRedo: false, undoLabel: log.label });
  }
}

export const learnerNoticeMutationService = new LearnerNoticeMutationService();

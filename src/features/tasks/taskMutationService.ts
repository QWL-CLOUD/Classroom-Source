import { z } from 'zod';

import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  changeLogSchema,
  taskSchema,
  type ChangeLog,
  type LearnerContext,
  type Task,
  type TaskStatus,
} from '@/domain/models/entities';
import {
  buildCategoryAssignmentChangePlan,
  listCategoryAssignmentsForDeletion,
  type CategorySelectionMap,
} from '@/features/categories/categoryAssignmentSelection';
import {
  deleteCategoryAssignmentOperation,
  putCategoryAssignmentOperation,
} from '@/features/categories/categoryCommands';
import { clearSupportedRedoBranch } from '@/features/editing/editCommandRegistry';
import { notifyEditHistoryChanged } from '@/features/editing/editHistorySignal';

import {
  createTaskCommand,
  deleteTaskOperation,
  putTaskOperation,
  serializeTaskCommand,
  type TaskCommandPair,
  type TaskOperation,
} from './taskCommands';

const optionalTrimmedString = (maximum: number) =>
  z.preprocess((value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().max(maximum).optional());

const optionalMinute = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}, z.number().int().min(0).max(1439).optional());

export const taskEditorValuesSchema = z
  .object({
    title: z.string().trim().min(1, 'Enter a task title.').max(240),
    notes: optionalTrimmedString(5000),
    scheduledDate: z.string().optional(),
    scheduledMinute: optionalMinute,
    dueDate: z.string().optional(),
    dueMinute: optionalMinute,
    contextId: optionalTrimmedString(200),
  })
  .transform((values) => ({
    ...values,
    scheduledDate: values.scheduledDate || undefined,
    dueDate: values.dueDate || undefined,
  }))
  .superRefine((values, context) => {
    const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (values.scheduledDate && !localDatePattern.test(values.scheduledDate)) {
      context.addIssue({
        code: 'custom',
        message: 'Scheduled date must use YYYY-MM-DD.',
        path: ['scheduledDate'],
      });
    }
    if (values.dueDate && !localDatePattern.test(values.dueDate)) {
      context.addIssue({
        code: 'custom',
        message: 'Due date must use YYYY-MM-DD.',
        path: ['dueDate'],
      });
    }
    if (values.scheduledMinute !== undefined && values.scheduledDate === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Choose a scheduled date before adding a time.',
        path: ['scheduledDate'],
      });
    }
    if (values.dueMinute !== undefined && values.dueDate === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Choose a due date before adding a time.',
        path: ['dueDate'],
      });
    }
  });

export type TaskEditorValues = z.input<typeof taskEditorValuesSchema>;

export interface TaskMutationDependencies {
  createId?: () => string;
  now?: () => string;
  order?: () => number;
}

interface CommitResult<T> {
  value: T;
  log: ChangeLog;
}

function taskStatusLabel(status: TaskStatus): string {
  switch (status) {
    case 'active':
      return 'active';
    case 'waiting':
      return 'waiting';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
  }
}

export class TaskMutationService {
  private readonly createId: () => string;
  private readonly now: () => string;
  private readonly order: () => number;

  constructor(
    private readonly db: ClassroomDatabase = classroomDb,
    dependencies: TaskMutationDependencies = {},
  ) {
    this.createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
    this.now = dependencies.now ?? (() => new Date().toISOString());
    this.order = dependencies.order ?? (() => Date.now());
  }

  async create(values: TaskEditorValues, categorySelections?: CategorySelectionMap): Promise<Task> {
    const parsed = taskEditorValuesSchema.parse(values);
    const result = await this.db.transaction(
      'rw',
      this.db.tasks,
      this.db.learnerContexts,
      this.db.categoryValues,
      this.db.categoryAssignments,
      this.db.changeLog,
      async (): Promise<CommitResult<Task>> => {
        await this.requireSelectableContext(parsed.contextId);
        const now = this.now();
        const task = taskSchema.parse({
          id: this.createId(),
          ...parsed,
          status: 'active',
          order: this.order(),
          createdAt: now,
          updatedAt: now,
        });
        const categoryPlan = await buildCategoryAssignmentChangePlan(this.db, 'task', task.id, {
          selections: categorySelections,
          useDefaultsForMissingFamilies: true,
          createId: this.createId,
          now,
        });
        const commands: TaskCommandPair = {
          forward: createTaskCommand([putTaskOperation(task), ...categoryPlan.forward]),
          inverse: createTaskCommand([...categoryPlan.inverse, deleteTaskOperation(task.id)]),
        };
        const log = this.createChangeLog(
          'task.create',
          `Create task “${task.title}”`,
          commands,
          now,
        );
        await clearSupportedRedoBranch(this.db);
        await this.applyOperations(commands.forward.operations);
        await this.db.changeLog.put(log);
        return { value: task, log };
      },
    );

    this.notifyNewChange(result.log);
    return result.value;
  }

  async update(
    id: string,
    values: TaskEditorValues,
    categorySelections?: CategorySelectionMap,
  ): Promise<Task> {
    const parsed = taskEditorValuesSchema.parse(values);
    const result = await this.db.transaction(
      'rw',
      this.db.tasks,
      this.db.learnerContexts,
      this.db.categoryValues,
      this.db.categoryAssignments,
      this.db.changeLog,
      async (): Promise<CommitResult<Task>> => {
        const existing = await this.requireTask(id);
        await this.requireSelectableContext(parsed.contextId, existing.contextId);
        const now = this.now();
        const updated = taskSchema.parse({
          ...existing,
          ...parsed,
          id: existing.id,
          status: existing.status,
          createdAt: existing.createdAt,
          updatedAt: now,
        });
        const categoryPlan = await buildCategoryAssignmentChangePlan(this.db, 'task', updated.id, {
          selections: categorySelections,
          useDefaultsForMissingFamilies: false,
          createId: this.createId,
          now,
        });
        const commands: TaskCommandPair = {
          forward: createTaskCommand([putTaskOperation(updated), ...categoryPlan.forward]),
          inverse: createTaskCommand([...categoryPlan.inverse, putTaskOperation(existing)]),
        };
        const log = this.createChangeLog(
          'task.update',
          `Edit task “${updated.title}”`,
          commands,
          now,
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

  async complete(id: string): Promise<Task> {
    const task = await this.requireTask(id);
    if (task.status !== 'active' && task.status !== 'waiting') {
      throw new Error('Only active or waiting tasks can be completed.');
    }
    return this.setStatus(id, 'completed');
  }

  async reopen(id: string): Promise<Task> {
    const task = await this.requireTask(id);
    if (task.status !== 'completed') throw new Error('Only completed tasks can be reopened.');
    return this.setStatus(id, 'active');
  }

  async wait(id: string): Promise<Task> {
    const task = await this.requireTask(id);
    if (task.status !== 'active') throw new Error('Only active tasks can move to Waiting.');
    return this.setStatus(id, 'waiting');
  }

  async cancel(id: string): Promise<Task> {
    const task = await this.requireTask(id);
    if (task.status !== 'active' && task.status !== 'waiting') {
      throw new Error('Only active or waiting tasks can be cancelled.');
    }
    return this.setStatus(id, 'cancelled');
  }

  async restore(id: string): Promise<Task> {
    const task = await this.requireTask(id);
    if (task.status !== 'waiting' && task.status !== 'cancelled') {
      throw new Error('Only waiting or cancelled tasks can be restored.');
    }
    return this.setStatus(id, 'active');
  }

  async delete(id: string): Promise<void> {
    const log = await this.db.transaction(
      'rw',
      this.db.tasks,
      this.db.categoryAssignments,
      this.db.changeLog,
      async () => {
        const existing = await this.requireTask(id);
        const now = this.now();
        const categoryAssignments = await listCategoryAssignmentsForDeletion(
          this.db,
          'task',
          existing.id,
        );
        const commands: TaskCommandPair = {
          forward: createTaskCommand([
            ...categoryAssignments.map((item) => deleteCategoryAssignmentOperation(item.id)),
            deleteTaskOperation(existing.id),
          ]),
          inverse: createTaskCommand([
            putTaskOperation(existing),
            ...categoryAssignments.map(putCategoryAssignmentOperation),
          ]),
        };
        const nextLog = this.createChangeLog(
          'task.delete',
          `Delete task “${existing.title}”`,
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

  private async setStatus(id: string, status: TaskStatus): Promise<Task> {
    const result = await this.db.transaction(
      'rw',
      this.db.tasks,
      this.db.changeLog,
      async (): Promise<CommitResult<Task>> => {
        const existing = await this.requireTask(id);
        if (existing.status === status) {
          throw new Error(`This task is already ${taskStatusLabel(status)}.`);
        }
        const now = this.now();
        const updated = taskSchema.parse({
          ...existing,
          status,
          updatedAt: now,
          waitingAt: status === 'waiting' ? now : undefined,
          completedAt: status === 'completed' ? now : undefined,
          cancelledAt: status === 'cancelled' ? now : undefined,
        });
        const commands: TaskCommandPair = {
          forward: createTaskCommand([putTaskOperation(updated)]),
          inverse: createTaskCommand([putTaskOperation(existing)]),
        };
        const log = this.createChangeLog(
          `task.${status}`,
          `${this.statusActionLabel(existing.status, status)} “${updated.title}”`,
          commands,
          now,
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

  private statusActionLabel(previous: TaskStatus, next: TaskStatus): string {
    if (next === 'completed') return 'Complete task';
    if (next === 'waiting') return 'Move task to Waiting';
    if (next === 'cancelled') return 'Cancel task';
    if (previous === 'completed') return 'Reopen task';
    return 'Restore task';
  }

  private async applyOperations(operations: readonly TaskOperation[]): Promise<void> {
    for (const operation of operations) {
      if (operation.table === 'tasks') {
        if (operation.action === 'put') await this.db.tasks.put(operation.record);
        else await this.db.tasks.delete(operation.id);
      } else if (operation.action === 'put') {
        await this.db.categoryAssignments.put(operation.record);
      } else {
        await this.db.categoryAssignments.delete(operation.id);
      }
    }
  }

  private async requireTask(id: string): Promise<Task> {
    const task = await this.db.tasks.get(id);
    if (!task) throw new Error('Task not found.');
    return taskSchema.parse(task);
  }

  private async requireSelectableContext(
    contextId: string | undefined,
    existingContextId?: string,
  ): Promise<LearnerContext | undefined> {
    if (!contextId) return undefined;
    const context = await this.db.learnerContexts.get(contextId);
    if (!context) throw new Error('The selected learner context no longer exists.');
    if (context.status === 'archived' && context.id !== existingContextId) {
      throw new Error('Archived learner contexts cannot be selected for a task.');
    }
    return context;
  }

  private createChangeLog(
    commandType: string,
    label: string,
    commands: TaskCommandPair,
    createdAt: string,
  ): ChangeLog {
    return changeLogSchema.parse({
      id: this.createId(),
      label,
      commandType,
      forwardJson: serializeTaskCommand(commands.forward),
      inverseJson: serializeTaskCommand(commands.inverse),
      createdAt,
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

export const taskMutationService = new TaskMutationService();

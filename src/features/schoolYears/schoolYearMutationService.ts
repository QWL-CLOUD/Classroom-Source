import { ZodError } from 'zod';

import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  changeLogSchema,
  schoolYearSchema,
  type ChangeLog,
  type SchoolYear,
} from '@/domain/models/entities';
import { clearSupportedRedoBranch } from '@/features/editing/editCommandRegistry';
import { notifyEditHistoryChanged } from '@/features/editing/editHistorySignal';
import {
  createSchoolYearCommand,
  deleteSchoolYearOperation,
  putSchoolYearOperation,
  serializeSchoolYearCommand,
  type SchoolYearCommandPair,
  type SchoolYearOperation,
} from '@/features/schoolYears/schoolYearCommands';
import {
  schoolYearEditorValuesSchema,
  type SchoolYearEditorValues,
} from '@/features/schoolYears/schoolYearEditorModel';

export interface SchoolYearMutationDependencies {
  createId?: () => string;
  now?: () => string;
}

interface CommitResult<T> {
  value: T;
  log: ChangeLog;
}

export interface SchoolYearDeleteImpact {
  schoolYearId: string;
  schoolYearLabel: string;
  learnerContextCount: number;
  canDelete: boolean;
}

export function schoolYearDeleteBlockingMessage(impact: SchoolYearDeleteImpact): string {
  if (impact.canDelete) return '';
  return `“${impact.schoolYearLabel}” cannot be deleted because ${impact.learnerContextCount} learner context${impact.learnerContextCount === 1 ? '' : 's'} still belong to it. Archive the school year to preserve those records.`;
}

export function schoolYearMutationError(cause: unknown): string {
  if (cause instanceof ZodError) {
    return cause.issues[0]?.message ?? 'Check the school year details.';
  }
  return cause instanceof Error ? cause.message : 'The school year could not be updated.';
}

export class SchoolYearMutationService {
  private readonly createId: () => string;
  private readonly now: () => string;

  constructor(
    private readonly db: ClassroomDatabase = classroomDb,
    dependencies: SchoolYearMutationDependencies = {},
  ) {
    this.createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  async create(
    values: SchoolYearEditorValues,
    options: { makeActive?: boolean } = {},
  ): Promise<SchoolYear> {
    const parsed = schoolYearEditorValuesSchema.parse(values);
    const result = await this.db.transaction(
      'rw',
      this.db.schoolYears,
      this.db.changeLog,
      async (): Promise<CommitResult<SchoolYear>> => {
        const existingYears = await this.listValidatedYears();
        this.requireUniqueLabel(parsed.label, existingYears);
        const now = this.now();
        const created = schoolYearSchema.parse({
          id: this.createId(),
          ...parsed,
          active: Boolean(options.makeActive),
          lifecycleState: 'active',
        });
        const changedExisting = options.makeActive
          ? existingYears.filter((schoolYear) => schoolYear.active)
          : [];
        const forwardOperations: SchoolYearOperation[] = [
          ...changedExisting.map((schoolYear) =>
            putSchoolYearOperation({ ...schoolYear, active: false }),
          ),
          putSchoolYearOperation(created),
        ];
        const inverseOperations: SchoolYearOperation[] = [
          deleteSchoolYearOperation(created.id),
          ...changedExisting.map(putSchoolYearOperation),
        ];
        const commands: SchoolYearCommandPair = {
          forward: createSchoolYearCommand(forwardOperations),
          inverse: createSchoolYearCommand(inverseOperations),
        };
        const log = this.createChangeLog(
          'school-year.create',
          `Create school year “${created.label}”${created.active ? ' and set active' : ''}`,
          commands,
          now,
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

  async update(id: string, values: SchoolYearEditorValues): Promise<SchoolYear> {
    const parsed = schoolYearEditorValuesSchema.parse(values);
    const result = await this.db.transaction(
      'rw',
      this.db.schoolYears,
      this.db.changeLog,
      async (): Promise<CommitResult<SchoolYear>> => {
        const existing = await this.requireSchoolYear(id);
        const allYears = await this.listValidatedYears();
        this.requireUniqueLabel(parsed.label, allYears, existing.id);
        const updated = schoolYearSchema.parse({
          ...existing,
          ...parsed,
          id: existing.id,
          active: existing.active,
          lifecycleState: existing.lifecycleState ?? 'active',
          archivedAt: existing.archivedAt,
        });
        const commands: SchoolYearCommandPair = {
          forward: createSchoolYearCommand([putSchoolYearOperation(updated)]),
          inverse: createSchoolYearCommand([putSchoolYearOperation(existing)]),
        };
        const log = this.createChangeLog(
          'school-year.update',
          `Edit school year “${updated.label}”`,
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

  async setActive(id: string): Promise<SchoolYear> {
    const result = await this.db.transaction(
      'rw',
      this.db.schoolYears,
      this.db.changeLog,
      async (): Promise<CommitResult<SchoolYear>> => {
        const allYears = await this.listValidatedYears();
        const target = allYears.find((schoolYear) => schoolYear.id === id);
        if (!target) throw new Error('School year no longer exists.');
        if (target.lifecycleState === 'archived') {
          throw new Error('Restore this school year before setting it as active.');
        }
        const activeYears = allYears.filter((schoolYear) => schoolYear.active);
        if (target.active && activeYears.length === 1) {
          throw new Error('This is already the active school year.');
        }
        const affected = allYears.filter((schoolYear) => schoolYear.active || schoolYear.id === id);
        const updatedRecords = affected.map((schoolYear) =>
          schoolYearSchema.parse({ ...schoolYear, active: schoolYear.id === id }),
        );
        const updatedTarget = updatedRecords.find((schoolYear) => schoolYear.id === id)!;
        const commands: SchoolYearCommandPair = {
          forward: createSchoolYearCommand(updatedRecords.map(putSchoolYearOperation)),
          inverse: createSchoolYearCommand(affected.map(putSchoolYearOperation)),
        };
        const log = this.createChangeLog(
          'school-year.set-active',
          `Set “${target.label}” as active school year`,
          commands,
        );
        await clearSupportedRedoBranch(this.db);
        await this.applyOperations(commands.forward.operations);
        await this.db.changeLog.put(log);
        return { value: updatedTarget, log };
      },
    );

    this.notifyNewChange(result.log);
    return result.value;
  }

  async archive(id: string): Promise<SchoolYear> {
    return this.setLifecycleState(id, 'archived');
  }

  async restore(id: string): Promise<SchoolYear> {
    return this.setLifecycleState(id, 'active');
  }

  async previewDelete(id: string): Promise<SchoolYearDeleteImpact> {
    return this.db.transaction('r', this.db.schoolYears, this.db.learnerContexts, async () => {
      const schoolYear = await this.requireSchoolYear(id);
      const learnerContextCount = await this.db.learnerContexts
        .where('schoolYearId')
        .equals(id)
        .count();
      return {
        schoolYearId: id,
        schoolYearLabel: schoolYear.label,
        learnerContextCount,
        canDelete: learnerContextCount === 0 && !schoolYear.active,
      };
    });
  }

  async delete(id: string): Promise<void> {
    const log = await this.db.transaction(
      'rw',
      this.db.schoolYears,
      this.db.learnerContexts,
      this.db.changeLog,
      async () => {
        const schoolYear = await this.requireSchoolYear(id);
        if (schoolYear.active) throw new Error('The active school year cannot be deleted.');
        const learnerContextCount = await this.db.learnerContexts
          .where('schoolYearId')
          .equals(id)
          .count();
        const impact: SchoolYearDeleteImpact = {
          schoolYearId: id,
          schoolYearLabel: schoolYear.label,
          learnerContextCount,
          canDelete: learnerContextCount === 0,
        };
        if (!impact.canDelete) throw new Error(schoolYearDeleteBlockingMessage(impact));
        const commands: SchoolYearCommandPair = {
          forward: createSchoolYearCommand([deleteSchoolYearOperation(id)]),
          inverse: createSchoolYearCommand([putSchoolYearOperation(schoolYear)]),
        };
        const nextLog = this.createChangeLog(
          'school-year.delete',
          `Delete empty school year “${schoolYear.label}”`,
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

  private async setLifecycleState(
    id: string,
    lifecycleState: NonNullable<SchoolYear['lifecycleState']>,
  ): Promise<SchoolYear> {
    const result = await this.db.transaction(
      'rw',
      this.db.schoolYears,
      this.db.changeLog,
      async (): Promise<CommitResult<SchoolYear>> => {
        const existing = await this.requireSchoolYear(id);
        if (existing.lifecycleState === lifecycleState) {
          throw new Error(
            lifecycleState === 'active'
              ? 'This school year is already available.'
              : 'This school year is already archived.',
          );
        }
        if (lifecycleState === 'archived' && existing.active) {
          throw new Error('Set another school year as active before archiving this one.');
        }
        const updated = schoolYearSchema.parse({
          ...existing,
          active: lifecycleState === 'archived' ? false : existing.active,
          lifecycleState,
          archivedAt: lifecycleState === 'archived' ? this.now() : undefined,
        });
        const verb = lifecycleState === 'archived' ? 'Archive' : 'Restore';
        const commands: SchoolYearCommandPair = {
          forward: createSchoolYearCommand([putSchoolYearOperation(updated)]),
          inverse: createSchoolYearCommand([putSchoolYearOperation(existing)]),
        };
        const log = this.createChangeLog(
          `school-year.${lifecycleState === 'archived' ? 'archive' : 'restore'}`,
          `${verb} school year “${existing.label}”`,
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

  private async listValidatedYears(): Promise<SchoolYear[]> {
    return (await this.db.schoolYears.toArray()).map((value) => schoolYearSchema.parse(value));
  }

  private async requireSchoolYear(id: string): Promise<SchoolYear> {
    const value = await this.db.schoolYears.get(id);
    if (!value) throw new Error('School year no longer exists.');
    return schoolYearSchema.parse(value);
  }

  private requireUniqueLabel(
    label: string,
    schoolYears: readonly SchoolYear[],
    excludedId?: string,
  ): void {
    const normalized = label.trim().toLocaleLowerCase('en');
    const duplicate = schoolYears.find(
      (schoolYear) =>
        schoolYear.id !== excludedId &&
        schoolYear.label.trim().toLocaleLowerCase('en') === normalized,
    );
    if (duplicate) throw new Error(`A school year named “${label.trim()}” already exists.`);
  }

  private async applyOperations(operations: readonly SchoolYearOperation[]): Promise<void> {
    for (const operation of operations) {
      if (operation.action === 'put') await this.db.schoolYears.put(operation.record);
      else await this.db.schoolYears.delete(operation.id);
    }
  }

  private createChangeLog(
    commandType: string,
    label: string,
    commands: SchoolYearCommandPair,
    createdAt = this.now(),
  ): ChangeLog {
    return changeLogSchema.parse({
      id: this.createId(),
      label,
      commandType,
      forwardJson: serializeSchoolYearCommand(commands.forward),
      inverseJson: serializeSchoolYearCommand(commands.inverse),
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

export const schoolYearMutationService = new SchoolYearMutationService();

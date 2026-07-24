import { z } from 'zod';

import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  categoryAssignmentSchema,
  categoryColorKeySchema,
  categoryFamilyIdSchema,
  categoryIconKeySchema,
  categoryValueSchema,
  changeLogSchema,
  type CategoryAssignableEntityType,
  type CategoryAssignment,
  type CategoryFamilyId,
  type CategoryValue,
  type ChangeLog,
} from '@/domain/models/entities';
import { clearSupportedRedoBranch } from '@/features/editing/editCommandRegistry';
import { notifyEditHistoryChanged } from '@/features/editing/editHistorySignal';

import {
  createCategoryCommand,
  deleteCategoryAssignmentOperation,
  deleteCategoryValueOperation,
  putCategoryAssignmentOperation,
  putCategoryValueOperation,
  serializeCategoryCommand,
  type CategoryCommandPair,
  type CategoryOperation,
} from './categoryCommands';
import { categoryFamilySupportsEntity, getCategoryFamily } from './categoryFamilies';
import { normalizeCategoryAliases, normalizeCategoryName } from './categoryNormalization';

export const categoryValueEditorValuesSchema = z.object({
  name: z.string().trim().min(1, 'Enter a category name.').max(120),
  colorKey: categoryColorKeySchema.optional(),
  iconKey: categoryIconKeySchema.optional(),
});

export const categoryPresentationValuesSchema = z.object({
  colorKey: categoryColorKeySchema.optional(),
  iconKey: categoryIconKeySchema.optional(),
});

export type CategoryValueEditorValues = z.input<typeof categoryValueEditorValuesSchema>;
export type CategoryPresentationValues = z.input<typeof categoryPresentationValuesSchema>;
export type CategoryMoveDirection = 'earlier' | 'later';

export interface CategoryMutationDependencies {
  createId?: () => string;
  now?: () => string;
}

interface CommitResult<T> {
  value: T;
  log: ChangeLog;
}

export class CategoryValueInUseError extends Error {
  constructor(
    readonly categoryValueId: string,
    readonly usageCount: number,
    readonly attemptedOperation: 'archive' | 'delete',
  ) {
    super(
      `This category value is used ${usageCount} ${usageCount === 1 ? 'time' : 'times'}. ` +
        `Use Replace and Archive or Merge before attempting to ${attemptedOperation} it.`,
    );
    this.name = 'CategoryValueInUseError';
  }
}

export class CategoryMergeHistoryDependencyError extends Error {
  constructor(
    readonly categoryValueId: string,
    readonly mergedSourceCount: number,
    readonly attemptedOperation: 'archive' | 'delete' | 'replace-and-archive',
  ) {
    super(
      `This category value is the merge target for ${mergedSourceCount} historical ${
        mergedSourceCount === 1 ? 'value' : 'values'
      }. Merge it into the replacement so former names remain resolvable.`,
    );
    this.name = 'CategoryMergeHistoryDependencyError';
  }
}

export class CategoryMutationService {
  private readonly createId: () => string;
  private readonly now: () => string;

  constructor(
    private readonly db: ClassroomDatabase = classroomDb,
    dependencies: CategoryMutationDependencies = {},
  ) {
    this.createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  async create(
    familyId: CategoryFamilyId,
    values: CategoryValueEditorValues,
  ): Promise<CategoryValue> {
    const parsedFamilyId = categoryFamilyIdSchema.parse(familyId);
    const parsed = categoryValueEditorValuesSchema.parse(values);
    const result = await this.db.transaction(
      'rw',
      this.db.categoryValues,
      this.db.changeLog,
      async (): Promise<CommitResult<CategoryValue>> => {
        const familyValues = await this.listValidatedValues(parsedFamilyId);
        this.assertNameAvailable(familyValues, parsed.name);
        const now = this.now();
        const record = categoryValueSchema.parse({
          id: this.createId(),
          familyId: parsedFamilyId,
          name: parsed.name,
          normalizedName: normalizeCategoryName(parsed.name),
          aliases: [],
          normalizedAliases: [],
          sortOrder: this.nextActiveSortOrder(familyValues),
          isDefault: false,
          colorKey: parsed.colorKey,
          iconKey: parsed.iconKey,
          lifecycleState: 'active',
          createdAt: now,
          updatedAt: now,
        });
        const commands: CategoryCommandPair = {
          forward: createCategoryCommand([putCategoryValueOperation(record)]),
          inverse: createCategoryCommand([deleteCategoryValueOperation(record.id)]),
        };
        const log = this.createChangeLog(
          'category.create',
          `Create ${getCategoryFamily(parsedFamilyId).label} value “${record.name}”`,
          commands,
          now,
        );
        await this.commit(commands.forward.operations, log);
        return { value: record, log };
      },
    );
    this.notifyNewChange(result.log);
    return result.value;
  }

  async update(id: string, values: CategoryValueEditorValues): Promise<CategoryValue> {
    const parsed = categoryValueEditorValuesSchema.parse(values);
    const result = await this.db.transaction(
      'rw',
      this.db.categoryValues,
      this.db.changeLog,
      async (): Promise<CommitResult<CategoryValue>> => {
        const existing = await this.requireValue(id);
        this.requireNotMerged(existing);
        const normalizedName = normalizeCategoryName(parsed.name);
        const nameChanged = normalizedName !== existing.normalizedName;
        if (nameChanged) {
          const familyValues = await this.listValidatedValues(existing.familyId);
          this.assertNameAvailable(familyValues, parsed.name, new Set([existing.id]));
        }
        const retainedAliases = nameChanged
          ? existing.aliases.filter((alias) => normalizeCategoryName(alias) !== normalizedName)
          : existing.aliases;
        const aliases = nameChanged
          ? normalizeCategoryAliases([...retainedAliases, existing.name])
          : { aliases: existing.aliases, normalizedAliases: existing.normalizedAliases };
        if (
          parsed.name === existing.name &&
          parsed.colorKey === existing.colorKey &&
          parsed.iconKey === existing.iconKey
        ) {
          throw new Error('The category value is unchanged.');
        }
        const updated = categoryValueSchema.parse({
          ...existing,
          name: parsed.name,
          normalizedName,
          aliases: aliases.aliases,
          normalizedAliases: aliases.normalizedAliases,
          colorKey: parsed.colorKey,
          iconKey: parsed.iconKey,
          updatedAt: this.now(),
        });
        return this.commitSingleValueChange(
          existing,
          updated,
          'category.update',
          `Update “${existing.name}”`,
        );
      },
    );
    this.notifyNewChange(result.log);
    return result.value;
  }

  async rename(id: string, name: string): Promise<CategoryValue> {
    const parsedName = z.string().trim().min(1).max(120).parse(name);
    const result = await this.db.transaction(
      'rw',
      this.db.categoryValues,
      this.db.changeLog,
      async (): Promise<CommitResult<CategoryValue>> => {
        const existing = await this.requireValue(id);
        this.requireNotMerged(existing);
        const familyValues = await this.listValidatedValues(existing.familyId);
        this.assertNameAvailable(familyValues, parsedName, new Set([existing.id]));
        const normalizedName = normalizeCategoryName(parsedName);
        if (normalizedName === existing.normalizedName) {
          throw new Error('This category value already has that name.');
        }
        const retainedAliases = existing.aliases.filter(
          (alias) => normalizeCategoryName(alias) !== normalizedName,
        );
        const aliases = normalizeCategoryAliases([...retainedAliases, existing.name]);
        const updated = categoryValueSchema.parse({
          ...existing,
          name: parsedName,
          normalizedName,
          aliases: aliases.aliases,
          normalizedAliases: aliases.normalizedAliases,
          updatedAt: this.now(),
        });
        return this.commitSingleValueChange(
          existing,
          updated,
          'category.rename',
          `Rename “${existing.name}” to “${updated.name}”`,
        );
      },
    );
    this.notifyNewChange(result.log);
    return result.value;
  }

  async updatePresentation(id: string, values: CategoryPresentationValues): Promise<CategoryValue> {
    const parsed = categoryPresentationValuesSchema.parse(values);
    const result = await this.db.transaction(
      'rw',
      this.db.categoryValues,
      this.db.changeLog,
      async (): Promise<CommitResult<CategoryValue>> => {
        const existing = await this.requireValue(id);
        this.requireNotMerged(existing);
        const updated = categoryValueSchema.parse({
          ...existing,
          ...parsed,
          updatedAt: this.now(),
        });
        if (updated.colorKey === existing.colorKey && updated.iconKey === existing.iconKey) {
          throw new Error('The category presentation is unchanged.');
        }
        return this.commitSingleValueChange(
          existing,
          updated,
          'category.presentation',
          `Update presentation for “${existing.name}”`,
        );
      },
    );
    this.notifyNewChange(result.log);
    return result.value;
  }

  async move(id: string, direction: CategoryMoveDirection): Promise<CategoryValue[]> {
    const result = await this.db.transaction(
      'rw',
      this.db.categoryValues,
      this.db.changeLog,
      async (): Promise<CommitResult<CategoryValue[]>> => {
        const existing = await this.requireValue(id);
        this.requireActive(existing);
        const activeValues = (await this.listValidatedValues(existing.familyId)).filter(
          (value) => value.lifecycleState === 'active',
        );
        const currentIndex = activeValues.findIndex((value) => value.id === id);
        const targetIndex = direction === 'earlier' ? currentIndex - 1 : currentIndex + 1;
        if (currentIndex < 0 || targetIndex < 0 || targetIndex >= activeValues.length) {
          throw new Error(
            direction === 'earlier'
              ? 'This category value is already first.'
              : 'This category value is already last.',
          );
        }
        const reordered = [...activeValues];
        const [moved] = reordered.splice(currentIndex, 1);
        if (!moved) throw new Error('Category order could not be resolved.');
        reordered.splice(targetIndex, 0, moved);
        const now = this.now();
        const updatedValues = reordered.map((value, index) =>
          categoryValueSchema.parse({ ...value, sortOrder: index, updatedAt: now }),
        );
        const changed = updatedValues.filter((value, index) => {
          const before = activeValues[index];
          return !before || before.id !== value.id || before.sortOrder !== value.sortOrder;
        });
        const beforeById = new Map(activeValues.map((value) => [value.id, value]));
        const commands: CategoryCommandPair = {
          forward: createCategoryCommand(changed.map(putCategoryValueOperation)),
          inverse: createCategoryCommand(
            changed.map((value) => putCategoryValueOperation(beforeById.get(value.id)!)),
          ),
        };
        const log = this.createChangeLog(
          'category.reorder',
          `${direction === 'earlier' ? 'Move earlier' : 'Move later'} “${existing.name}”`,
          commands,
          now,
        );
        await this.commit(commands.forward.operations, log);
        return { value: updatedValues, log };
      },
    );
    this.notifyNewChange(result.log);
    return result.value;
  }

  async setDefault(id: string): Promise<CategoryValue> {
    const result = await this.db.transaction(
      'rw',
      this.db.categoryValues,
      this.db.changeLog,
      async (): Promise<CommitResult<CategoryValue>> => {
        const target = await this.requireValue(id);
        this.requireActive(target);
        const familyValues = await this.listValidatedValues(target.familyId);
        const affected = familyValues.filter((value) => value.isDefault || value.id === target.id);
        if (target.isDefault && affected.length === 1) {
          throw new Error('This is already the family default.');
        }
        const now = this.now();
        const updated = affected.map((value) =>
          categoryValueSchema.parse({
            ...value,
            isDefault: value.id === target.id,
            updatedAt: now,
          }),
        );
        const updatedTarget = updated.find((value) => value.id === target.id)!;
        const commands: CategoryCommandPair = {
          forward: createCategoryCommand(updated.map(putCategoryValueOperation)),
          inverse: createCategoryCommand(affected.map(putCategoryValueOperation)),
        };
        const log = this.createChangeLog(
          'category.set-default',
          `Set “${target.name}” as the ${getCategoryFamily(target.familyId).label} default`,
          commands,
          now,
        );
        await this.commit(commands.forward.operations, log);
        return { value: updatedTarget, log };
      },
    );
    this.notifyNewChange(result.log);
    return result.value;
  }

  async archive(id: string): Promise<CategoryValue> {
    const result = await this.db.transaction(
      'rw',
      this.db.categoryValues,
      this.db.categoryAssignments,
      this.db.changeLog,
      async (): Promise<CommitResult<CategoryValue>> => {
        const existing = await this.requireValue(id);
        this.requireActive(existing);
        await this.requireUnused(existing.id, 'archive');
        const now = this.now();
        const updated = categoryValueSchema.parse({
          ...existing,
          lifecycleState: 'archived',
          isDefault: false,
          archivedAt: now,
          updatedAt: now,
        });
        return this.commitSingleValueChange(
          existing,
          updated,
          'category.archive',
          `Archive “${existing.name}”`,
        );
      },
    );
    this.notifyNewChange(result.log);
    return result.value;
  }

  async restore(id: string): Promise<CategoryValue> {
    const result = await this.db.transaction(
      'rw',
      this.db.categoryValues,
      this.db.changeLog,
      async (): Promise<CommitResult<CategoryValue>> => {
        const existing = await this.requireValue(id);
        if (existing.lifecycleState !== 'archived') {
          throw new Error('Only an archived category value can be restored.');
        }
        const familyValues = await this.listValidatedValues(existing.familyId);
        const updated = categoryValueSchema.parse({
          ...existing,
          lifecycleState: 'active',
          sortOrder: this.nextActiveSortOrder(familyValues),
          archivedAt: undefined,
          updatedAt: this.now(),
        });
        return this.commitSingleValueChange(
          existing,
          updated,
          'category.restore',
          `Restore “${existing.name}”`,
        );
      },
    );
    this.notifyNewChange(result.log);
    return result.value;
  }

  async deleteUnused(id: string): Promise<void> {
    const log = await this.db.transaction(
      'rw',
      this.db.categoryValues,
      this.db.categoryAssignments,
      this.db.changeLog,
      async (): Promise<ChangeLog> => {
        const existing = await this.requireValue(id);
        this.requireNotMerged(existing);
        await this.requireUnused(existing.id, 'delete');
        const commands: CategoryCommandPair = {
          forward: createCategoryCommand([deleteCategoryValueOperation(existing.id)]),
          inverse: createCategoryCommand([putCategoryValueOperation(existing)]),
        };
        const nextLog = this.createChangeLog(
          'category.delete-unused',
          `Delete unused category value “${existing.name}”`,
          commands,
        );
        await this.commit(commands.forward.operations, nextLog);
        return nextLog;
      },
    );
    this.notifyNewChange(log);
  }

  async assign(
    categoryValueId: string,
    entityType: CategoryAssignableEntityType,
    entityId: string,
  ): Promise<CategoryAssignment> {
    const result = await this.db.transaction(
      'rw',
      [
        this.db.categoryValues,
        this.db.categoryAssignments,
        this.db.lessonPlans,
        this.db.lessonTemplates,
        this.db.tasks,
        this.db.learnerNotices,
        this.db.changeLog,
      ],
      async (): Promise<CommitResult<CategoryAssignment>> => {
        const value = await this.requireValue(categoryValueId);
        this.requireActive(value);
        this.requireSupportedAssignment(value.familyId, entityType);
        await this.requireEntity(entityType, entityId);
        const existing = await this.db.categoryAssignments
          .where('[familyId+entityType+entityId]')
          .equals([value.familyId, entityType, entityId])
          .toArray();
        const validatedExisting = existing.map((assignment) =>
          categoryAssignmentSchema.parse(assignment),
        );
        if (validatedExisting.some((assignment) => assignment.categoryValueId === value.id)) {
          throw new Error('This category value is already assigned to the record.');
        }
        const assignment = categoryAssignmentSchema.parse({
          id: this.createId(),
          familyId: value.familyId,
          categoryValueId: value.id,
          entityType,
          entityId,
          createdAt: this.now(),
        });
        const replacements =
          getCategoryFamily(value.familyId).selectionMode === 'single' ? validatedExisting : [];
        const commands: CategoryCommandPair = {
          forward: createCategoryCommand([
            ...replacements.map((item) => deleteCategoryAssignmentOperation(item.id)),
            putCategoryAssignmentOperation(assignment),
          ]),
          inverse: createCategoryCommand([
            deleteCategoryAssignmentOperation(assignment.id),
            ...replacements.map(putCategoryAssignmentOperation),
          ]),
        };
        const log = this.createChangeLog('category.assign', `Assign “${value.name}”`, commands);
        await this.commit(commands.forward.operations, log);
        return { value: assignment, log };
      },
    );
    this.notifyNewChange(result.log);
    return result.value;
  }

  async unassign(assignmentId: string): Promise<void> {
    const log = await this.db.transaction(
      'rw',
      this.db.categoryAssignments,
      this.db.changeLog,
      async (): Promise<ChangeLog> => {
        const existing = await this.requireAssignment(assignmentId);
        const commands: CategoryCommandPair = {
          forward: createCategoryCommand([deleteCategoryAssignmentOperation(existing.id)]),
          inverse: createCategoryCommand([putCategoryAssignmentOperation(existing)]),
        };
        const nextLog = this.createChangeLog(
          'category.unassign',
          'Remove category assignment',
          commands,
        );
        await this.commit(commands.forward.operations, nextLog);
        return nextLog;
      },
    );
    this.notifyNewChange(log);
  }

  async replaceAndArchive(sourceId: string, replacementId: string): Promise<CategoryValue> {
    return this.combineValues(sourceId, replacementId, 'replace-and-archive');
  }

  async merge(sourceId: string, targetId: string): Promise<CategoryValue> {
    return this.combineValues(sourceId, targetId, 'merge');
  }

  private async combineValues(
    sourceId: string,
    targetId: string,
    mode: 'replace-and-archive' | 'merge',
  ): Promise<CategoryValue> {
    const result = await this.db.transaction(
      'rw',
      this.db.categoryValues,
      this.db.categoryAssignments,
      this.db.changeLog,
      async (): Promise<CommitResult<CategoryValue>> => {
        if (sourceId === targetId) throw new Error('Choose a different replacement value.');
        const source = await this.requireValue(sourceId);
        const target = await this.requireValue(targetId);
        this.requireActive(source);
        this.requireActive(target);
        if (source.familyId !== target.familyId) {
          throw new Error('Category values can only be combined within the same family.');
        }
        if (mode === 'replace-and-archive') {
          const mergedSourceCount = await this.countMergedSources(source.id);
          if (mergedSourceCount > 0) {
            throw new CategoryMergeHistoryDependencyError(
              source.id,
              mergedSourceCount,
              'replace-and-archive',
            );
          }
        }
        const familyValues = await this.listValidatedValues(source.familyId);
        const sourceAssignments = (
          await this.db.categoryAssignments.where('categoryValueId').equals(source.id).toArray()
        ).map((assignment) => categoryAssignmentSchema.parse(assignment));
        const targetAssignments = (
          await this.db.categoryAssignments.where('categoryValueId').equals(target.id).toArray()
        ).map((assignment) => categoryAssignmentSchema.parse(assignment));
        const targetAssignmentKeys = new Set(
          targetAssignments.map((assignment) =>
            this.assignmentEntityKey(assignment.entityType, assignment.entityId),
          ),
        );
        const now = this.now();
        const assignmentForward: CategoryOperation[] = [];
        const assignmentInverse: CategoryOperation[] = [];
        for (const assignment of sourceAssignments) {
          const key = this.assignmentEntityKey(assignment.entityType, assignment.entityId);
          assignmentInverse.push(putCategoryAssignmentOperation(assignment));
          if (targetAssignmentKeys.has(key)) {
            assignmentForward.push(deleteCategoryAssignmentOperation(assignment.id));
          } else {
            const moved = categoryAssignmentSchema.parse({
              ...assignment,
              categoryValueId: target.id,
            });
            assignmentForward.push(putCategoryAssignmentOperation(moved));
            targetAssignmentKeys.add(key);
          }
        }

        let updatedTarget = target;
        if (mode === 'merge') {
          const aliases = normalizeCategoryAliases([
            ...target.aliases,
            source.name,
            ...source.aliases,
          ]);
          const filteredAliases = aliases.aliases.filter(
            (alias) => normalizeCategoryName(alias) !== target.normalizedName,
          );
          const normalizedAliases = filteredAliases.map(normalizeCategoryName);
          this.assertTokensAvailable(
            familyValues,
            [target.name, ...filteredAliases],
            new Set([source.id, target.id]),
          );
          updatedTarget = categoryValueSchema.parse({
            ...target,
            aliases: filteredAliases,
            normalizedAliases,
            isDefault: target.isDefault || source.isDefault,
            updatedAt: now,
          });
        } else if (source.isDefault && !target.isDefault) {
          updatedTarget = categoryValueSchema.parse({
            ...target,
            isDefault: true,
            updatedAt: now,
          });
        }

        const updatedSource = categoryValueSchema.parse({
          ...source,
          lifecycleState: mode === 'merge' ? 'merged' : 'archived',
          isDefault: false,
          archivedAt: mode === 'replace-and-archive' ? now : undefined,
          mergedAt: mode === 'merge' ? now : undefined,
          mergedIntoId: mode === 'merge' ? target.id : undefined,
          updatedAt: now,
        });
        const targetChanged = JSON.stringify(updatedTarget) !== JSON.stringify(target);
        const commands: CategoryCommandPair = {
          forward: createCategoryCommand([
            ...assignmentForward,
            putCategoryValueOperation(updatedSource),
            ...(targetChanged ? [putCategoryValueOperation(updatedTarget)] : []),
          ]),
          inverse: createCategoryCommand([
            putCategoryValueOperation(source),
            ...(targetChanged ? [putCategoryValueOperation(target)] : []),
            ...assignmentInverse,
          ]),
        };
        const verb = mode === 'merge' ? 'Merge' : 'Replace and archive';
        const log = this.createChangeLog(
          mode === 'merge' ? 'category.merge' : 'category.replace-and-archive',
          `${verb} “${source.name}” with “${target.name}”`,
          commands,
          now,
        );
        await this.commit(commands.forward.operations, log);
        return { value: updatedTarget, log };
      },
    );
    this.notifyNewChange(result.log);
    return result.value;
  }

  private async commitSingleValueChange(
    existing: CategoryValue,
    updated: CategoryValue,
    commandType: string,
    label: string,
  ): Promise<CommitResult<CategoryValue>> {
    const commands: CategoryCommandPair = {
      forward: createCategoryCommand([putCategoryValueOperation(updated)]),
      inverse: createCategoryCommand([putCategoryValueOperation(existing)]),
    };
    const log = this.createChangeLog(commandType, label, commands, updated.updatedAt);
    await this.commit(commands.forward.operations, log);
    return { value: updated, log };
  }

  private async commit(operations: readonly CategoryOperation[], log: ChangeLog): Promise<void> {
    await clearSupportedRedoBranch(this.db);
    await this.applyOperations(operations);
    await this.db.changeLog.put(log);
  }

  private async applyOperations(operations: readonly CategoryOperation[]): Promise<void> {
    for (const operation of operations) {
      if (operation.table === 'categoryValues') {
        if (operation.action === 'put') await this.db.categoryValues.put(operation.record);
        else await this.db.categoryValues.delete(operation.id);
      } else if (operation.action === 'put') {
        await this.db.categoryAssignments.put(operation.record);
      } else {
        await this.db.categoryAssignments.delete(operation.id);
      }
    }
  }

  private async requireValue(id: string): Promise<CategoryValue> {
    const value = await this.db.categoryValues.get(id);
    if (!value) throw new Error('Category value no longer exists.');
    return categoryValueSchema.parse(value);
  }

  private async requireAssignment(id: string): Promise<CategoryAssignment> {
    const assignment = await this.db.categoryAssignments.get(id);
    if (!assignment) throw new Error('Category assignment no longer exists.');
    return categoryAssignmentSchema.parse(assignment);
  }

  private async listValidatedValues(familyId: CategoryFamilyId): Promise<CategoryValue[]> {
    return (await this.db.categoryValues.where('familyId').equals(familyId).toArray())
      .map((value) => categoryValueSchema.parse(value))
      .sort(
        (first, second) =>
          first.sortOrder - second.sortOrder ||
          first.name.localeCompare(second.name, 'en', { sensitivity: 'base' }) ||
          first.id.localeCompare(second.id),
      );
  }

  private requireActive(value: CategoryValue): void {
    if (value.lifecycleState !== 'active') {
      throw new Error('Only an active category value can be used for this action.');
    }
  }

  private requireNotMerged(value: CategoryValue): void {
    if (value.lifecycleState === 'merged') {
      throw new Error('Merged category values are retained as history and cannot be edited.');
    }
  }

  private async requireUnused(
    categoryValueId: string,
    operation: 'archive' | 'delete',
  ): Promise<void> {
    const usageCount = await this.db.categoryAssignments
      .where('categoryValueId')
      .equals(categoryValueId)
      .count();
    if (usageCount > 0) {
      throw new CategoryValueInUseError(categoryValueId, usageCount, operation);
    }
    const mergedSourceCount = await this.countMergedSources(categoryValueId);
    if (mergedSourceCount > 0) {
      throw new CategoryMergeHistoryDependencyError(categoryValueId, mergedSourceCount, operation);
    }
  }

  private async countMergedSources(categoryValueId: string): Promise<number> {
    return this.db.categoryValues.where('mergedIntoId').equals(categoryValueId).count();
  }

  private requireSupportedAssignment(
    familyId: CategoryFamilyId,
    entityType: CategoryAssignableEntityType,
  ): void {
    const family = getCategoryFamily(familyId);
    if (!categoryFamilySupportsEntity(familyId, entityType)) {
      throw new Error(`${family.label} cannot be assigned to ${entityType} records.`);
    }
    if (family.assignmentAvailability !== 'current') {
      throw new Error(`${family.label} assignments are reserved for a later roadmap phase.`);
    }
  }

  private async requireEntity(
    entityType: CategoryAssignableEntityType,
    entityId: string,
  ): Promise<void> {
    let exists = false;
    if (entityType === 'lesson-plan') exists = Boolean(await this.db.lessonPlans.get(entityId));
    else if (entityType === 'lesson-template') {
      exists = Boolean(await this.db.lessonTemplates.get(entityId));
    } else if (entityType === 'task') exists = Boolean(await this.db.tasks.get(entityId));
    else if (entityType === 'learner-notice') {
      exists = Boolean(await this.db.learnerNotices.get(entityId));
    } else {
      throw new Error(`Assignments to ${entityType} records are not available in Phase 3E-1A.`);
    }
    if (!exists) throw new Error('The category target record no longer exists.');
  }

  private assertNameAvailable(
    familyValues: readonly CategoryValue[],
    requestedName: string,
    excludedIds: ReadonlySet<string> = new Set(),
  ): void {
    this.assertTokensAvailable(familyValues, [requestedName], excludedIds);
  }

  private assertTokensAvailable(
    familyValues: readonly CategoryValue[],
    requestedTokens: readonly string[],
    excludedIds: ReadonlySet<string>,
  ): void {
    const reserved = new Set<string>();
    for (const value of familyValues) {
      if (excludedIds.has(value.id)) continue;
      reserved.add(value.normalizedName);
      value.normalizedAliases.forEach((alias) => reserved.add(alias));
    }
    for (const token of requestedTokens) {
      const normalized = normalizeCategoryName(token);
      if (reserved.has(normalized)) {
        throw new Error(`A category name or alias matching “${token.trim()}” already exists.`);
      }
    }
  }

  private nextActiveSortOrder(values: readonly CategoryValue[]): number {
    const activeOrders = values
      .filter((value) => value.lifecycleState === 'active')
      .map((value) => value.sortOrder);
    return activeOrders.length > 0 ? Math.max(...activeOrders) + 1 : 0;
  }

  private assignmentEntityKey(entityType: CategoryAssignableEntityType, entityId: string): string {
    return `${entityType}\u0000${entityId}`;
  }

  private createChangeLog(
    commandType: string,
    label: string,
    commands: CategoryCommandPair,
    createdAt = this.now(),
  ): ChangeLog {
    return changeLogSchema.parse({
      id: this.createId(),
      label,
      commandType,
      forwardJson: serializeCategoryCommand(commands.forward),
      inverseJson: serializeCategoryCommand(commands.inverse),
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

export const categoryMutationService = new CategoryMutationService();

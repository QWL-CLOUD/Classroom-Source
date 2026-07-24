import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  changeLogSchema,
  standardSchema,
  type ChangeLog,
  type Standard,
  type StandardStatus,
} from '@/domain/models/entities';
import { clearSupportedRedoBranch } from '@/features/editing/editCommandRegistry';
import { notifyEditHistoryChanged } from '@/features/editing/editHistorySignal';

import {
  createStandardCommand,
  deleteStandardOperation,
  putStandardOperation,
  serializeStandardCommand,
  type StandardCommandPair,
  type StandardOperation,
} from './standardCommands';
import { parseStandardEditorValues, type StandardEditorValues } from './standardModel';

export interface StandardMutationDependencies {
  createId?: () => string;
  now?: () => string;
}

interface CommitResult<T> {
  value: T;
  log: ChangeLog;
}

export class StandardMutationService {
  private readonly createId: () => string;
  private readonly now: () => string;

  constructor(
    private readonly db: ClassroomDatabase = classroomDb,
    dependencies: StandardMutationDependencies = {},
  ) {
    this.createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  async create(values: StandardEditorValues): Promise<Standard> {
    const fields = parseStandardEditorValues(values);
    const result = await this.db.transaction(
      'rw',
      [this.db.standards, this.db.changeLog],
      async (): Promise<CommitResult<Standard>> => {
        const now = this.now();
        const standard = standardSchema.parse({
          id: this.createId(),
          ...fields,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        });
        if (await this.db.standards.get(standard.id)) {
          throw new Error('Standard ID already exists.');
        }
        await this.validateIdentity(standard);
        await this.validateParent(standard);
        const commands: StandardCommandPair = {
          forward: createStandardCommand([putStandardOperation(standard)]),
          inverse: createStandardCommand([deleteStandardOperation(standard.id)]),
        };
        const log = this.createChangeLog(
          'standard.create',
          `Create Standard “${standard.code}”`,
          commands,
          now,
        );
        await this.commit(commands.forward.operations, log);
        return { value: standard, log };
      },
    );
    this.notifyNewChange(result.log);
    return result.value;
  }

  async update(id: string, values: StandardEditorValues): Promise<Standard> {
    const fields = parseStandardEditorValues(values);
    return this.replace(id, 'standard.update', 'Edit Standard', async (existing, now) => {
      const updated = standardSchema.parse({
        ...existing,
        ...fields,
        id,
        updatedAt: now,
      });
      await this.validateIdentity(updated);
      await this.validateParent(updated, existing.parentStandardId);
      await this.validateChildFrameworks(existing, updated);
      return updated;
    });
  }

  async archive(id: string): Promise<Standard> {
    return this.setStatus(id, 'archived');
  }

  async restore(id: string): Promise<Standard> {
    return this.setStatus(id, 'active');
  }

  private async setStatus(id: string, status: StandardStatus): Promise<Standard> {
    return this.replace(
      id,
      status === 'active' ? 'standard.restore' : 'standard.archive',
      status === 'active' ? 'Restore Standard' : 'Archive Standard',
      async (existing, now) => {
        if (existing.status === status) {
          throw new Error(`This Standard is already ${status}.`);
        }
        return standardSchema.parse({
          ...existing,
          status,
          archivedAt: status === 'archived' ? now : undefined,
          updatedAt: now,
        });
      },
    );
  }

  private async replace(
    id: string,
    commandType: string,
    label: string,
    update: (existing: Standard, now: string) => Promise<Standard>,
  ): Promise<Standard> {
    const result = await this.db.transaction(
      'rw',
      [this.db.standards, this.db.changeLog],
      async (): Promise<CommitResult<Standard>> => {
        const existing = await this.requireStandard(id);
        const now = this.now();
        const updated = await update(existing, now);
        const commands: StandardCommandPair = {
          forward: createStandardCommand([putStandardOperation(updated)]),
          inverse: createStandardCommand([putStandardOperation(existing)]),
        };
        const log = this.createChangeLog(commandType, `${label} “${updated.code}”`, commands, now);
        await this.commit(commands.forward.operations, log);
        return { value: updated, log };
      },
    );
    this.notifyNewChange(result.log);
    return result.value;
  }

  private async validateIdentity(standard: Standard): Promise<void> {
    const existing = await this.db.standards
      .where('[frameworkKey+normalizedCode]')
      .equals([standard.frameworkKey, standard.normalizedCode])
      .first();
    if (existing && existing.id !== standard.id) {
      throw new Error('This framework already contains a Standard with the same code.');
    }
  }

  private async validateChildFrameworks(existing: Standard, updated: Standard): Promise<void> {
    if (existing.frameworkKey === updated.frameworkKey) return;
    const child = await this.db.standards.where('parentStandardId').equals(existing.id).first();
    if (child) {
      throw new Error(
        'Reassign child Standards before changing this parent Standard framework identity.',
      );
    }
  }

  private async validateParent(
    standard: Standard,
    existingParentStandardId?: string,
  ): Promise<void> {
    if (!standard.parentStandardId) return;
    if (standard.parentStandardId === standard.id) {
      throw new Error('A Standard cannot be its own parent.');
    }
    const parent = await this.requireStandard(standard.parentStandardId);
    if (parent.status === 'archived' && parent.id !== existingParentStandardId) {
      throw new Error('Archived Standards cannot be selected as a new parent.');
    }
    if (parent.frameworkKey !== standard.frameworkKey) {
      throw new Error('Parent and child Standards must belong to the same framework version.');
    }
    let cursor: Standard | undefined = parent;
    const visited = new Set<string>([standard.id]);
    while (cursor) {
      if (visited.has(cursor.id)) {
        throw new Error('This parent choice would create a Standard hierarchy cycle.');
      }
      visited.add(cursor.id);
      cursor = cursor.parentStandardId
        ? await this.db.standards.get(cursor.parentStandardId)
        : undefined;
    }
  }

  private async requireStandard(id: string): Promise<Standard> {
    const value = await this.db.standards.get(id);
    if (!value) throw new Error('Standard not found.');
    return standardSchema.parse(value);
  }

  private async commit(operations: readonly StandardOperation[], log: ChangeLog): Promise<void> {
    await clearSupportedRedoBranch(this.db);
    for (const operation of operations) {
      if (operation.table === 'standards') {
        if (operation.action === 'put') await this.db.standards.put(operation.record);
        else await this.db.standards.delete(operation.id);
      } else if (operation.action === 'put') {
        await this.db.standardAlignments.put(operation.record);
      } else {
        await this.db.standardAlignments.delete(operation.id);
      }
    }
    await this.db.changeLog.put(log);
  }

  private createChangeLog(
    commandType: string,
    label: string,
    commands: StandardCommandPair,
    now: string,
  ): ChangeLog {
    return changeLogSchema.parse({
      id: this.createId(),
      label,
      commandType,
      forwardJson: serializeStandardCommand(commands.forward),
      inverseJson: serializeStandardCommand(commands.inverse),
      createdAt: now,
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

export const standardMutationService = new StandardMutationService();

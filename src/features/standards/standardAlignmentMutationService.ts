import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  changeLogSchema,
  lessonPlanSchema,
  lessonTemplateSchema,
  standardAlignmentSchema,
  standardSchema,
  type ChangeLog,
  type StandardAlignment,
} from '@/domain/models/entities';
import { clearSupportedRedoBranch } from '@/features/editing/editCommandRegistry';
import { notifyEditHistoryChanged } from '@/features/editing/editHistorySignal';

import {
  createStandardCommand,
  deleteStandardAlignmentOperation,
  putStandardAlignmentOperation,
  serializeStandardCommand,
  type StandardCommandPair,
  type StandardOperation,
} from './standardCommands';
import {
  listDesiredStandardAlignmentScopes,
  type StandardAlignmentDraft,
  type StandardAlignmentTarget,
} from './standardAlignmentModel';

export interface StandardAlignmentMutationDependencies {
  createId?: () => string;
  now?: () => string;
}

interface StandardAlignmentCommitResult {
  values: StandardAlignment[];
  log: ChangeLog | null;
}

export class StandardAlignmentMutationService {
  private readonly createId: () => string;
  private readonly now: () => string;

  constructor(
    private readonly db: ClassroomDatabase = classroomDb,
    dependencies: StandardAlignmentMutationDependencies = {},
  ) {
    this.createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  async replaceTargetAlignments(
    target: StandardAlignmentTarget,
    draft: StandardAlignmentDraft,
  ): Promise<StandardAlignment[]> {
    const result = await this.db.transaction(
      'rw',
      [
        this.db.standards,
        this.db.standardAlignments,
        this.db.lessonPlans,
        this.db.lessonTemplates,
        this.db.changeLog,
      ],
      async (): Promise<StandardAlignmentCommitResult> => {
        await this.validateTarget(target);
        const existing = (
          await this.db.standardAlignments
            .where('[targetType+targetId]')
            .equals([target.targetType, target.targetId])
            .toArray()
        ).map((value) => standardAlignmentSchema.parse(value));
        const desiredScopes = listDesiredStandardAlignmentScopes(target, draft);
        const existingByKey = new Map(
          existing.map((alignment) => [`${alignment.standardId}|${alignment.scopeKey}`, alignment]),
        );
        const desiredKeys = new Set(
          desiredScopes.map((value) => `${value.standardId}|${value.scopeKey}`),
        );
        const removed = existing.filter(
          (alignment) => !desiredKeys.has(`${alignment.standardId}|${alignment.scopeKey}`),
        );
        const added: StandardAlignment[] = [];
        const now = this.now();

        for (const desired of desiredScopes) {
          const key = `${desired.standardId}|${desired.scopeKey}`;
          if (existingByKey.has(key)) continue;
          const standardValue = await this.db.standards.get(desired.standardId);
          if (!standardValue) throw new Error('A selected Standard no longer exists.');
          const standard = standardSchema.parse(standardValue);
          if (standard.status !== 'active') {
            throw new Error('Archived Standards cannot be added to a new alignment.');
          }
          added.push(
            standardAlignmentSchema.parse({
              id: this.createId(),
              standardId: desired.standardId,
              targetType: target.targetType,
              targetId: target.targetId,
              lessonFlowStepId: desired.lessonFlowStepId,
              scopeKey: desired.scopeKey,
              createdAt: now,
            }),
          );
        }

        if (removed.length === 0 && added.length === 0) return { values: existing, log: null };

        const commands: StandardCommandPair = {
          forward: createStandardCommand([
            ...removed.map((value) => deleteStandardAlignmentOperation(value.id)),
            ...added.map(putStandardAlignmentOperation),
          ]),
          inverse: createStandardCommand([
            ...added.map((value) => deleteStandardAlignmentOperation(value.id)),
            ...removed.map(putStandardAlignmentOperation),
          ]),
        };
        const label =
          target.targetType === 'lesson-plan'
            ? 'Update Plan Standards alignment'
            : 'Update Lesson Template Standards alignment';
        const log = changeLogSchema.parse({
          id: this.createId(),
          label,
          commandType: 'standard.alignment.replace',
          forwardJson: serializeStandardCommand(commands.forward),
          inverseJson: serializeStandardCommand(commands.inverse),
          createdAt: now,
        });
        await clearSupportedRedoBranch(this.db);
        await this.applyOperations(commands.forward.operations);
        await this.db.changeLog.put(log);
        const values = existing
          .filter((value) => !removed.some((removedValue) => removedValue.id === value.id))
          .concat(added);
        return { values, log };
      },
    );

    if (result.log) {
      notifyEditHistoryChanged({
        canUndo: true,
        canRedo: false,
        undoLabel: result.log.label,
      });
    }
    return result.values;
  }

  private async validateTarget(target: StandardAlignmentTarget): Promise<void> {
    const validStepIds = new Set(target.lessonFlow.map((step) => step.id));
    if (target.targetType === 'lesson-plan') {
      const value = await this.db.lessonPlans.get(target.targetId);
      if (!value) throw new Error('Lesson plan not found.');
      const plan = lessonPlanSchema.parse(value);
      const persistedStepIds = new Set((plan.lessonFlow ?? []).map((step) => step.id));
      for (const stepId of validStepIds) {
        if (!persistedStepIds.has(stepId)) {
          throw new Error('Save the Plan changes before aligning a new Lesson Flow step.');
        }
      }
      return;
    }
    const value = await this.db.lessonTemplates.get(target.targetId);
    if (!value) throw new Error('Lesson template not found.');
    const template = lessonTemplateSchema.parse(value);
    const persistedStepIds = new Set(template.lessonFlow.map((step) => step.id));
    for (const stepId of validStepIds) {
      if (!persistedStepIds.has(stepId)) {
        throw new Error('Save the Template changes before aligning a new Lesson Flow step.');
      }
    }
  }

  private async applyOperations(operations: readonly StandardOperation[]): Promise<void> {
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
  }
}

export const standardAlignmentMutationService = new StandardAlignmentMutationService();

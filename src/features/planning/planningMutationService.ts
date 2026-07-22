import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  changeLogSchema,
  learnerContextSchema,
  lessonPlanSchema,
  lessonSeriesSchema,
  scheduleBlockSchema,
  scheduleExceptionSchema,
  sessionOccurrenceSchema,
  type ChangeLog,
  type LessonPlan,
  type LessonSeries,
  type ScheduleException,
  type SessionOccurrence,
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
import { resolveScheduleOccurrence } from '@/features/scheduleExceptions/scheduleOccurrenceResolver';

import {
  createPlanningCommand,
  deleteLessonPlanOperation,
  deleteLessonSeriesOperation,
  deleteSessionOperation,
  putLessonPlanOperation,
  putLessonSeriesOperation,
  putSessionOperation,
  serializePlanningCommand,
  type PlanningCommandPair,
  type PlanningOperation,
} from './planningCommands';
import {
  parseLessonPlanEditorValues,
  parseSessionEditorValues,
  scheduleOccurrencePlanningTargetSchema,
  type LessonPlanEditorValues,
  type LessonSeriesAssignment,
  type ScheduleOccurrencePlanningTarget,
  type SessionEditorValues,
} from './planningEditorModel';
import {
  buildSeriesBumpPreview,
  seriesBumpRequestSchema,
  type SeriesBumpPreview,
} from './seriesBumpPlanner';

export interface PlanningMutationDependencies {
  createId?: () => string;
  now?: () => string;
}

interface CommitResult<T> {
  value: T;
  log: ChangeLog;
}

export type LessonSeriesMoveDirection = 'earlier' | 'later';

export interface DeleteLessonPlanOptions {
  includeSessions?: boolean;
}

export interface CreatePlanForScheduleOccurrenceResult {
  plan: LessonPlan;
  session: SessionOccurrence;
  created: boolean;
}

function compareSeriesPlans(first: LessonPlan, second: LessonPlan): number {
  return (
    (first.sequence ?? Number.MAX_SAFE_INTEGER) - (second.sequence ?? Number.MAX_SAFE_INTEGER) ||
    first.createdAt.localeCompare(second.createdAt) ||
    first.id.localeCompare(second.id)
  );
}

function uniquePlans(plans: readonly LessonPlan[]): LessonPlan[] {
  return [...new Map(plans.map((plan) => [plan.id, plan] as const)).values()];
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

  async createPlan(
    contextId: string,
    values: LessonPlanEditorValues,
    categorySelections?: CategorySelectionMap,
  ): Promise<LessonPlan> {
    const parsed = parseLessonPlanEditorValues(values);
    const result = await this.db.transaction(
      'rw',
      [
        this.db.learnerContexts,
        this.db.lessonSeries,
        this.db.lessonPlans,
        this.db.sessionOccurrences,
        this.db.categoryValues,
        this.db.categoryAssignments,
        this.db.changeLog,
      ],
      async (): Promise<CommitResult<LessonPlan>> => {
        const contextValue = await this.db.learnerContexts.get(contextId);
        if (!contextValue) throw new Error('Learner context no longer exists.');
        const context = learnerContextSchema.parse(contextValue);
        if (context.status !== 'active') {
          throw new Error('Restore this learner context before creating a new plan.');
        }

        const timestamp = this.now();
        const planId = this.createId();
        if (await this.db.lessonPlans.get(planId)) {
          throw new Error('Lesson plan ID already exists.');
        }
        const assignment = await this.resolveSeriesAssignment(
          contextId,
          parsed.series,
          parsed.fields.subject,
        );
        const existingSeriesPlans = assignment.seriesId
          ? await this.listSeriesPlans(assignment.seriesId, contextId)
          : [];
        const normalizedSeriesPlans = existingSeriesPlans.map((plan, index) =>
          lessonPlanSchema.parse({
            ...plan,
            sequence: index,
            updatedAt: plan.sequence === index ? plan.updatedAt : timestamp,
          }),
        );
        const record = lessonPlanSchema.parse({
          id: planId,
          contextId,
          ...parsed.fields,
          seriesId: assignment.seriesId,
          sequence: assignment.seriesId ? normalizedSeriesPlans.length : undefined,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        const categoryPlan = await buildCategoryAssignmentChangePlan(
          this.db,
          'lesson-plan',
          record.id,
          {
            selections: categorySelections,
            useDefaultsForMissingFamilies: true,
            createId: this.createId,
            now: timestamp,
          },
        );
        const forwardOperations: PlanningOperation[] = [
          ...(assignment.createdSeries ? [putLessonSeriesOperation(assignment.createdSeries)] : []),
          ...normalizedSeriesPlans.map(putLessonPlanOperation),
          putLessonPlanOperation(record),
          ...categoryPlan.forward,
        ];
        const inverseOperations: PlanningOperation[] = [
          ...categoryPlan.inverse,
          deleteLessonPlanOperation(record.id),
          ...existingSeriesPlans.map(putLessonPlanOperation),
          ...(assignment.createdSeries
            ? [deleteLessonSeriesOperation(assignment.createdSeries.id)]
            : []),
        ];
        const commands: PlanningCommandPair = {
          forward: createPlanningCommand(forwardOperations),
          inverse: createPlanningCommand(inverseOperations),
        };
        const log = this.createChangeLog(
          'planning.plan.create',
          `Create plan “${record.title}”`,
          commands,
        );

        await clearSupportedRedoBranch(this.db);
        await this.applyOperations(commands.forward.operations);
        await this.db.changeLog.put(log);
        return { value: record, log };
      },
    );
    this.notifyNewChange(result.log);
    return result.value;
  }

  async createPlanForScheduleOccurrence(
    contextId: string,
    values: LessonPlanEditorValues,
    input: ScheduleOccurrencePlanningTarget,
    categorySelections?: CategorySelectionMap,
  ): Promise<CreatePlanForScheduleOccurrenceResult> {
    const parsed = parseLessonPlanEditorValues(values);
    const target = scheduleOccurrencePlanningTargetSchema.parse(input);
    const result = await this.db.transaction(
      'rw',
      [
        this.db.learnerContexts,
        this.db.lessonSeries,
        this.db.lessonPlans,
        this.db.sessionOccurrences,
        this.db.scheduleBlocks,
        this.db.scheduleExceptions,
        this.db.categoryValues,
        this.db.categoryAssignments,
        this.db.changeLog,
      ],
      async (): Promise<
        | CommitResult<CreatePlanForScheduleOccurrenceResult>
        | { value: CreatePlanForScheduleOccurrenceResult; log: null }
      > => {
        const contextValue = await this.db.learnerContexts.get(contextId);
        if (!contextValue) throw new Error('Learner context no longer exists.');
        const context = learnerContextSchema.parse(contextValue);
        if (context.status !== 'active') {
          throw new Error('Restore this learner context before planning a schedule occurrence.');
        }

        const blockValue = await this.db.scheduleBlocks.get(target.scheduleBlockId);
        if (!blockValue) throw new Error('The selected schedule block no longer exists.');
        const scheduleBlock = scheduleBlockSchema.parse(blockValue);
        if (
          scheduleBlock.archivedAt ||
          scheduleBlock.kind !== 'teachable' ||
          !scheduleBlock.planningEnabled
        ) {
          throw new Error('This schedule block is not eligible for lesson planning.');
        }

        const exceptions = (
          await this.db.scheduleExceptions.where('date').equals(target.date).toArray()
        ).map((value) => scheduleExceptionSchema.parse(value));
        const occurrence = resolveScheduleOccurrence(scheduleBlock, target.date, exceptions);
        if (!occurrence) {
          throw new Error('The selected schedule block does not occur on this date.');
        }

        const matchingSessions = (
          await this.db.sessionOccurrences.where('contextId').equals(contextId).toArray()
        )
          .map((value) => sessionOccurrenceSchema.parse(value))
          .filter(
            (session) =>
              session.scheduleBlockId === target.scheduleBlockId &&
              session.date === target.date &&
              session.deliveryState !== 'cancelled',
          )
          .sort((first, second) => first.id.localeCompare(second.id));
        if (matchingSessions.length > 1) {
          throw new Error(
            'Multiple sessions already use this schedule occurrence and learner context.',
          );
        }
        const existingSession = matchingSessions[0];
        if (existingSession) {
          const existingPlan = await this.requirePlan(existingSession.lessonPlanId);
          return {
            value: { plan: existingPlan, session: existingSession, created: false },
            log: null,
          };
        }

        const timestamp = this.now();
        const planId = this.createId();
        if (await this.db.lessonPlans.get(planId)) {
          throw new Error('Lesson plan ID already exists.');
        }
        const sessionId = this.createId();
        if (await this.db.sessionOccurrences.get(sessionId)) {
          throw new Error('Session ID already exists.');
        }
        const assignment = await this.resolveSeriesAssignment(
          contextId,
          parsed.series,
          parsed.fields.subject,
        );
        const existingSeriesPlans = assignment.seriesId
          ? await this.listSeriesPlans(assignment.seriesId, contextId)
          : [];
        const normalizedSeriesPlans = existingSeriesPlans.map((plan, index) =>
          lessonPlanSchema.parse({
            ...plan,
            sequence: index,
            updatedAt: plan.sequence === index ? plan.updatedAt : timestamp,
          }),
        );
        const plan = lessonPlanSchema.parse({
          id: planId,
          contextId,
          ...parsed.fields,
          preferredScheduleBlockId: scheduleBlock.id,
          seriesId: assignment.seriesId,
          sequence: assignment.seriesId ? normalizedSeriesPlans.length : undefined,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        const session = sessionOccurrenceSchema.parse({
          id: sessionId,
          lessonPlanId: plan.id,
          contextId,
          scheduleBlockId: scheduleBlock.id,
          date: target.date,
          startMinute: occurrence.block.startMinute,
          endMinute: occurrence.block.endMinute,
          deliveryState: 'scheduled',
        });
        const categoryPlan = await buildCategoryAssignmentChangePlan(
          this.db,
          'lesson-plan',
          plan.id,
          {
            selections: categorySelections,
            useDefaultsForMissingFamilies: true,
            createId: this.createId,
            now: timestamp,
          },
        );
        const commands: PlanningCommandPair = {
          forward: createPlanningCommand([
            ...(assignment.createdSeries
              ? [putLessonSeriesOperation(assignment.createdSeries)]
              : []),
            ...normalizedSeriesPlans.map(putLessonPlanOperation),
            putLessonPlanOperation(plan),
            putSessionOperation(session),
            ...categoryPlan.forward,
          ]),
          inverse: createPlanningCommand([
            ...categoryPlan.inverse,
            deleteSessionOperation(session.id),
            deleteLessonPlanOperation(plan.id),
            ...existingSeriesPlans.map(putLessonPlanOperation),
            ...(assignment.createdSeries
              ? [deleteLessonSeriesOperation(assignment.createdSeries.id)]
              : []),
          ]),
        };
        const log = this.createChangeLog(
          'planning.schedule-occurrence.create',
          `Plan “${plan.title}” in “${occurrence.block.title}”`,
          commands,
        );

        await clearSupportedRedoBranch(this.db);
        await this.applyOperations(commands.forward.operations);
        await this.db.changeLog.put(log);
        return { value: { plan, session, created: true }, log };
      },
    );

    if (result.log) this.notifyNewChange(result.log);
    return result.value;
  }

  async updatePlan(
    id: string,
    values: LessonPlanEditorValues,
    categorySelections?: CategorySelectionMap,
  ): Promise<LessonPlan> {
    const parsed = parseLessonPlanEditorValues(values);
    const result = await this.db.transaction(
      'rw',
      [
        this.db.lessonSeries,
        this.db.lessonPlans,
        this.db.sessionOccurrences,
        this.db.categoryValues,
        this.db.categoryAssignments,
        this.db.changeLog,
      ],
      async (): Promise<CommitResult<LessonPlan>> => {
        const existing = await this.requirePlan(id);
        const timestamp = this.now();
        const assignment = await this.resolveSeriesAssignment(
          existing.contextId,
          parsed.series,
          parsed.fields.subject,
          existing.seriesId,
        );
        const targetSeriesId = assignment.seriesId;
        const beforePeers: LessonPlan[] = [];
        const afterPeers: LessonPlan[] = [];
        let sequence: number | undefined;

        if (existing.seriesId === targetSeriesId) {
          sequence = targetSeriesId ? existing.sequence : undefined;
          if (targetSeriesId && sequence === undefined) {
            const members = await this.listSeriesPlans(targetSeriesId, existing.contextId);
            sequence = Math.max(
              0,
              members.findIndex((plan) => plan.id === existing.id),
            );
          }
        } else {
          if (existing.seriesId) {
            const oldPeers = await this.listSeriesPlans(
              existing.seriesId,
              existing.contextId,
              existing.id,
            );
            beforePeers.push(...oldPeers);
            afterPeers.push(
              ...oldPeers.map((plan, index) =>
                lessonPlanSchema.parse({
                  ...plan,
                  sequence: index,
                  updatedAt: plan.sequence === index ? plan.updatedAt : timestamp,
                }),
              ),
            );
          }
          if (targetSeriesId) {
            const targetPeers = await this.listSeriesPlans(
              targetSeriesId,
              existing.contextId,
              existing.id,
            );
            beforePeers.push(...targetPeers);
            afterPeers.push(
              ...targetPeers.map((plan, index) =>
                lessonPlanSchema.parse({
                  ...plan,
                  sequence: index,
                  updatedAt: plan.sequence === index ? plan.updatedAt : timestamp,
                }),
              ),
            );
            sequence = targetPeers.length;
          }
        }

        const updated = lessonPlanSchema.parse({
          ...existing,
          ...parsed.fields,
          id,
          seriesId: targetSeriesId,
          sequence,
          updatedAt: timestamp,
        });
        const forwardPlans = uniquePlans([...afterPeers, updated]);
        const inversePlans = uniquePlans([...beforePeers, existing]);
        const categoryPlan = await buildCategoryAssignmentChangePlan(
          this.db,
          'lesson-plan',
          updated.id,
          {
            selections: categorySelections,
            useDefaultsForMissingFamilies: false,
            createId: this.createId,
            now: timestamp,
          },
        );
        const commands: PlanningCommandPair = {
          forward: createPlanningCommand([
            ...(assignment.createdSeries
              ? [putLessonSeriesOperation(assignment.createdSeries)]
              : []),
            ...forwardPlans.map(putLessonPlanOperation),
            ...categoryPlan.forward,
          ]),
          inverse: createPlanningCommand([
            ...categoryPlan.inverse,
            ...inversePlans.map(putLessonPlanOperation),
            ...(assignment.createdSeries
              ? [deleteLessonSeriesOperation(assignment.createdSeries.id)]
              : []),
          ]),
        };
        const log = this.createChangeLog(
          'planning.plan.update',
          `Edit plan “${updated.title}”`,
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

  async deletePlan(id: string, options: DeleteLessonPlanOptions = {}): Promise<void> {
    const log = await this.db.transaction(
      'rw',
      this.db.lessonPlans,
      this.db.sessionOccurrences,
      this.db.categoryAssignments,
      this.db.changeLog,
      async () => {
        const existing = await this.requirePlan(id);
        const sessions = (
          await this.db.sessionOccurrences.where('lessonPlanId').equals(id).toArray()
        ).map((value) => sessionOccurrenceSchema.parse(value));
        if (sessions.length > 0 && !options.includeSessions) {
          throw new Error('Remove the scheduled session before deleting this plan.');
        }
        const timestamp = this.now();
        const peers = existing.seriesId
          ? await this.listSeriesPlans(existing.seriesId, existing.contextId, existing.id)
          : [];
        const normalizedPeers = peers.map((plan, index) =>
          lessonPlanSchema.parse({
            ...plan,
            sequence: index,
            updatedAt: plan.sequence === index ? plan.updatedAt : timestamp,
          }),
        );
        const categoryAssignments = await listCategoryAssignmentsForDeletion(
          this.db,
          'lesson-plan',
          existing.id,
        );
        const commands: PlanningCommandPair = {
          forward: createPlanningCommand([
            ...categoryAssignments.map((item) => deleteCategoryAssignmentOperation(item.id)),
            ...sessions.map((session) => deleteSessionOperation(session.id)),
            deleteLessonPlanOperation(id),
            ...normalizedPeers.map(putLessonPlanOperation),
          ]),
          inverse: createPlanningCommand([
            putLessonPlanOperation(existing),
            ...categoryAssignments.map(putCategoryAssignmentOperation),
            ...sessions.map(putSessionOperation),
            ...peers.map(putLessonPlanOperation),
          ]),
        };
        const nextLog = this.createChangeLog(
          'planning.plan.delete',
          sessions.length > 0
            ? `Delete plan “${existing.title}” and ${sessions.length} session${sessions.length === 1 ? '' : 's'}`
            : `Delete plan “${existing.title}”`,
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

  async movePlanWithinSeries(
    id: string,
    direction: LessonSeriesMoveDirection,
  ): Promise<LessonPlan> {
    const result = await this.db.transaction(
      'rw',
      this.db.lessonSeries,
      this.db.lessonPlans,
      this.db.sessionOccurrences,
      this.db.changeLog,
      async (): Promise<CommitResult<LessonPlan> | { value: LessonPlan; log: null }> => {
        const existing = await this.requirePlan(id);
        if (!existing.seriesId) throw new Error('This plan is not assigned to a lesson series.');
        const series = await this.requireSeries(existing.seriesId);
        if (series.contextId !== existing.contextId) {
          throw new Error('The lesson series does not belong to this learner context.');
        }
        const originals = await this.listSeriesPlans(series.id, existing.contextId);
        const currentIndex = originals.findIndex((plan) => plan.id === id);
        const targetIndex = direction === 'earlier' ? currentIndex - 1 : currentIndex + 1;
        if (currentIndex < 0 || targetIndex < 0 || targetIndex >= originals.length) {
          return { value: existing, log: null };
        }

        const ordered = [...originals];
        [ordered[currentIndex], ordered[targetIndex]] = [
          ordered[targetIndex]!,
          ordered[currentIndex]!,
        ];
        const target = originals[targetIndex]!;
        const existingSessions = await this.listActivePlanSessions(existing.id);
        const targetSessions = await this.listActivePlanSessions(target.id);

        if (
          existingSessions.some((session) => session.deliveryState === 'completed') ||
          targetSessions.some((session) => session.deliveryState === 'completed')
        ) {
          throw new Error('Completed lessons cannot be reordered. Reopen the session first.');
        }

        const existingSession = existingSessions.find(
          (session) => session.deliveryState === 'scheduled',
        );
        const targetSession = targetSessions.find(
          (session) => session.deliveryState === 'scheduled',
        );

        if (Boolean(existingSession) !== Boolean(targetSession)) {
          throw new Error(
            'Both adjacent lessons must either be scheduled or unscheduled before reordering.',
          );
        }

        const timestamp = this.now();
        const updatedPlans = ordered.map((plan, index) =>
          lessonPlanSchema.parse({
            ...plan,
            sequence: index,
            updatedAt: plan.sequence === index ? plan.updatedAt : timestamp,
          }),
        );
        const updatedSessions =
          existingSession && targetSession
            ? [
                sessionOccurrenceSchema.parse({
                  ...existingSession,
                  scheduleBlockId: targetSession.scheduleBlockId,
                  date: targetSession.date,
                  startMinute: targetSession.startMinute,
                  endMinute: targetSession.endMinute,
                }),
                sessionOccurrenceSchema.parse({
                  ...targetSession,
                  scheduleBlockId: existingSession.scheduleBlockId,
                  date: existingSession.date,
                  startMinute: existingSession.startMinute,
                  endMinute: existingSession.endMinute,
                }),
              ]
            : [];
        const moved = updatedPlans.find((plan) => plan.id === id)!;
        const commands: PlanningCommandPair = {
          forward: createPlanningCommand([
            ...updatedPlans.map(putLessonPlanOperation),
            ...updatedSessions.map(putSessionOperation),
          ]),
          inverse: createPlanningCommand([
            ...originals.map(putLessonPlanOperation),
            ...(existingSession && targetSession
              ? [putSessionOperation(existingSession), putSessionOperation(targetSession)]
              : []),
          ]),
        };
        const log = this.createChangeLog(
          'planning.series.reorder',
          `Move “${existing.title}” ${direction}`,
          commands,
        );

        await clearSupportedRedoBranch(this.db);
        await this.applyOperations(commands.forward.operations);
        await this.db.changeLog.put(log);
        return { value: moved, log };
      },
    );

    if (result.log) this.notifyNewChange(result.log);
    return result.value;
  }

  async renameLessonSeries(id: string, title: string): Promise<LessonSeries> {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) throw new Error('Lesson series title is required.');

    const result = await this.db.transaction(
      'rw',
      this.db.lessonSeries,
      this.db.changeLog,
      async (): Promise<CommitResult<LessonSeries> | { value: LessonSeries; log: null }> => {
        const existing = await this.requireSeries(id);
        if (existing.title === normalizedTitle) return { value: existing, log: null };
        const updated = lessonSeriesSchema.parse({
          ...existing,
          title: normalizedTitle,
          updatedAt: this.now(),
        });
        const commands: PlanningCommandPair = {
          forward: createPlanningCommand([putLessonSeriesOperation(updated)]),
          inverse: createPlanningCommand([putLessonSeriesOperation(existing)]),
        };
        const log = this.createChangeLog(
          'planning.series.rename',
          `Rename lesson series “${existing.title}” to “${updated.title}”`,
          commands,
        );

        await clearSupportedRedoBranch(this.db);
        await this.applyOperations(commands.forward.operations);
        await this.db.changeLog.put(log);
        return { value: updated, log };
      },
    );

    if (result.log) this.notifyNewChange(result.log);
    return result.value;
  }

  async archiveLessonSeries(id: string): Promise<LessonSeries> {
    return this.setLessonSeriesLifecycleState(id, 'archived');
  }

  async restoreLessonSeries(id: string): Promise<LessonSeries> {
    return this.setLessonSeriesLifecycleState(id, 'active');
  }

  async deleteLessonSeries(id: string): Promise<void> {
    const log = await this.db.transaction(
      'rw',
      this.db.lessonSeries,
      this.db.lessonPlans,
      this.db.sessionOccurrences,
      this.db.changeLog,
      async () => {
        const existing = await this.requireSeries(id);
        const linkedPlans = await this.listSeriesPlans(existing.id, existing.contextId);
        const timestamp = this.now();
        const detachedPlans = linkedPlans.map((plan) =>
          lessonPlanSchema.parse({
            ...plan,
            seriesId: undefined,
            sequence: undefined,
            updatedAt: timestamp,
          }),
        );
        const commands: PlanningCommandPair = {
          forward: createPlanningCommand([
            ...detachedPlans.map(putLessonPlanOperation),
            deleteLessonSeriesOperation(existing.id),
          ]),
          inverse: createPlanningCommand([
            putLessonSeriesOperation(existing),
            ...linkedPlans.map(putLessonPlanOperation),
          ]),
        };
        const log = this.createChangeLog(
          'planning.series.delete',
          `Delete lesson series “${existing.title}” and detach ${linkedPlans.length} plan${linkedPlans.length === 1 ? '' : 's'}`,
          commands,
        );

        await clearSupportedRedoBranch(this.db);
        await this.applyOperations(commands.forward.operations);
        await this.db.changeLog.put(log);
        return log;
      },
    );

    this.notifyNewChange(log);
  }

  private async setLessonSeriesLifecycleState(
    id: string,
    lifecycleState: LessonSeries['lifecycleState'],
  ): Promise<LessonSeries> {
    const result = await this.db.transaction(
      'rw',
      this.db.lessonSeries,
      this.db.changeLog,
      async (): Promise<CommitResult<LessonSeries> | { value: LessonSeries; log: null }> => {
        const existing = await this.requireSeries(id);
        if (existing.lifecycleState === lifecycleState) return { value: existing, log: null };
        const timestamp = this.now();
        const updated = lessonSeriesSchema.parse({
          ...existing,
          lifecycleState,
          archivedAt: lifecycleState === 'archived' ? timestamp : undefined,
          updatedAt: timestamp,
        });
        const verb = lifecycleState === 'archived' ? 'Archive' : 'Restore';
        const commands: PlanningCommandPair = {
          forward: createPlanningCommand([putLessonSeriesOperation(updated)]),
          inverse: createPlanningCommand([putLessonSeriesOperation(existing)]),
        };
        const log = this.createChangeLog(
          `planning.series.${lifecycleState}`,
          `${verb} lesson series “${existing.title}”`,
          commands,
        );

        await clearSupportedRedoBranch(this.db);
        await this.applyOperations(commands.forward.operations);
        await this.db.changeLog.put(log);
        return { value: updated, log };
      },
    );

    if (result.log) this.notifyNewChange(result.log);
    return result.value;
  }

  private async listActivePlanSessions(planId: string): Promise<SessionOccurrence[]> {
    return (await this.db.sessionOccurrences.where('lessonPlanId').equals(planId).toArray())
      .map((value) => sessionOccurrenceSchema.parse(value))
      .filter((session) => session.deliveryState !== 'cancelled');
  }

  private async resolveSeriesAssignment(
    contextId: string,
    assignment: LessonSeriesAssignment,
    subject: string,
    allowArchivedSeriesId?: string,
  ): Promise<{ seriesId?: string; createdSeries?: LessonSeries }> {
    if (assignment.kind === 'none') return {};
    if (assignment.kind === 'existing') {
      const series = await this.requireSeries(assignment.seriesId);
      if (series.contextId !== contextId) {
        throw new Error('The selected lesson series belongs to another learner context.');
      }
      if (series.lifecycleState === 'archived' && series.id !== allowArchivedSeriesId) {
        throw new Error('Restore this lesson series before assigning new plans to it.');
      }
      return { seriesId: series.id };
    }

    const id = this.createId();
    if (await this.db.lessonSeries.get(id)) throw new Error('Lesson series ID already exists.');
    const createdSeries = lessonSeriesSchema.parse({
      id,
      contextId,
      title: assignment.title,
      subject,
      lifecycleState: 'active',
      updatedAt: this.now(),
    });
    return { seriesId: createdSeries.id, createdSeries };
  }

  async schedulePlan(planId: string, values: SessionEditorValues): Promise<SessionOccurrence> {
    const fields = parseSessionEditorValues(values);
    const result = await this.db.transaction(
      'rw',
      [
        this.db.learnerContexts,
        this.db.lessonPlans,
        this.db.sessionOccurrences,
        this.db.scheduleBlocks,
        this.db.scheduleExceptions,
        this.db.changeLog,
      ],
      async (): Promise<CommitResult<SessionOccurrence>> => {
        const plan = await this.requirePlan(planId);
        const contextValue = await this.db.learnerContexts.get(plan.contextId);
        if (!contextValue) throw new Error('Learner context no longer exists.');
        const context = learnerContextSchema.parse(contextValue);
        if (context.status !== 'active') {
          throw new Error('Restore this learner context before scheduling a new session.');
        }
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

  async previewSeriesBump(sessionId: string): Promise<SeriesBumpPreview> {
    const request = seriesBumpRequestSchema.parse({ sessionId });
    return this.db.transaction(
      'r',
      this.db.lessonSeries,
      this.db.lessonPlans,
      this.db.sessionOccurrences,
      this.db.scheduleBlocks,
      this.db.scheduleExceptions,
      async () => this.buildSeriesBumpPreview(request.sessionId),
    );
  }

  async bumpSeries(sessionId: string, expectedPreviewToken: string): Promise<SeriesBumpPreview> {
    const request = seriesBumpRequestSchema.parse({ sessionId, expectedPreviewToken });
    const result = await this.db.transaction(
      'rw',
      [
        this.db.lessonSeries,
        this.db.lessonPlans,
        this.db.sessionOccurrences,
        this.db.scheduleBlocks,
        this.db.scheduleExceptions,
        this.db.changeLog,
      ],
      async (): Promise<CommitResult<SeriesBumpPreview>> => {
        const preview = await this.buildSeriesBumpPreview(request.sessionId);
        if (preview.previewToken !== request.expectedPreviewToken) {
          throw new Error('The Bump preview is out of date. Preview the change again.');
        }
        if (!preview.canCommit) {
          throw new Error(preview.blockingIssues[0] ?? 'This lesson series cannot be bumped.');
        }

        const originals = (
          await Promise.all(
            preview.items.map((item) => this.db.sessionOccurrences.get(item.sessionId)),
          )
        ).map((value) => {
          if (!value) throw new Error('A session in the Bump preview no longer exists.');
          return sessionOccurrenceSchema.parse(value);
        });
        const originalsById = new Map(originals.map((session) => [session.id, session] as const));
        const updatedSessions = preview.items.map((item) => {
          const original = originalsById.get(item.sessionId);
          if (!original) throw new Error('A session in the Bump preview no longer exists.');
          return sessionOccurrenceSchema.parse({
            ...original,
            date: item.toDate,
            startMinute: item.toStartMinute,
            endMinute: item.toEndMinute,
          });
        });
        const commands: PlanningCommandPair = {
          forward: createPlanningCommand(updatedSessions.map(putSessionOperation)),
          inverse: createPlanningCommand(originals.map(putSessionOperation)),
        };
        const log = this.createChangeLog(
          'planning.series.bump',
          `Bump “${preview.seriesTitle}” from “${preview.selectedPlanTitle}”`,
          commands,
        );

        await clearSupportedRedoBranch(this.db);
        await this.applyOperations(commands.forward.operations);
        await this.db.changeLog.put(log);
        return { value: preview, log };
      },
    );

    this.notifyNewChange(result.log);
    return result.value;
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

  private async buildSeriesBumpPreview(sessionId: string): Promise<SeriesBumpPreview> {
    const selectedSession = await this.requireSession(sessionId);
    const selectedPlan = await this.requirePlan(selectedSession.lessonPlanId);
    if (!selectedPlan.seriesId) {
      throw new Error('Assign this lesson to a Lesson Series before using Bump.');
    }
    if (!selectedSession.scheduleBlockId) {
      throw new Error('Bump requires a session attached to a Schedule Block.');
    }

    const series = await this.requireSeries(selectedPlan.seriesId);
    const blockValue = await this.db.scheduleBlocks.get(selectedSession.scheduleBlockId);
    if (!blockValue) throw new Error('The Session Schedule Block no longer exists.');
    const scheduleBlock = scheduleBlockSchema.parse(blockValue);
    const seriesPlans = await this.listSeriesPlans(series.id, selectedPlan.contextId);
    const sessions = (
      await this.db.sessionOccurrences.where('contextId').equals(selectedPlan.contextId).toArray()
    ).map((value) => sessionOccurrenceSchema.parse(value));
    const scheduleExceptions = (
      await this.db.scheduleExceptions.where('scheduleBlockId').equals(scheduleBlock.id).toArray()
    ).map((value) => scheduleExceptionSchema.parse(value));

    return buildSeriesBumpPreview({
      selectedSession,
      selectedPlan,
      series,
      seriesPlans,
      sessions,
      scheduleBlock,
      scheduleExceptions,
    });
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

  private async requireSeries(id: string): Promise<LessonSeries> {
    const value = await this.db.lessonSeries.get(id);
    if (!value) throw new Error('Lesson series no longer exists.');
    return lessonSeriesSchema.parse(value);
  }

  private async listSeriesPlans(
    seriesId: string,
    contextId: string,
    excludeId?: string,
  ): Promise<LessonPlan[]> {
    return (await this.db.lessonPlans.where('seriesId').equals(seriesId).toArray())
      .map((value) => lessonPlanSchema.parse(value))
      .filter((plan) => plan.contextId === contextId && plan.id !== excludeId)
      .sort(compareSeriesPlans);
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
      if (operation.table === 'lessonSeries') {
        if (operation.action === 'put') await this.db.lessonSeries.put(operation.record);
        else await this.db.lessonSeries.delete(operation.id);
      } else if (operation.table === 'lessonPlans') {
        if (operation.action === 'put') await this.db.lessonPlans.put(operation.record);
        else await this.db.lessonPlans.delete(operation.id);
      } else if (operation.table === 'sessionOccurrences') {
        if (operation.action === 'put') await this.db.sessionOccurrences.put(operation.record);
        else await this.db.sessionOccurrences.delete(operation.id);
      } else if (operation.action === 'put') {
        await this.db.categoryAssignments.put(operation.record);
      } else {
        await this.db.categoryAssignments.delete(operation.id);
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

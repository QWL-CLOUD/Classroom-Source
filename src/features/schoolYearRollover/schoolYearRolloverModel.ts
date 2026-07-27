import { addDays, differenceInCalendarDays } from 'date-fns';
import { z } from 'zod';

import {
  categoryAssignmentSchema,
  learnerContextSchema,
  lessonPlanSchema,
  lessonSeriesSchema,
  scheduleBlockSchema,
  schoolYearSchema,
  standardAlignmentSchema,
  type CategoryAssignment,
  type LearnerContext,
  type LessonFlowStep,
  type LessonPlan,
  type LessonSeries,
  type ScheduleBlock,
  type SchoolYear,
  type StandardAlignment,
} from '@/domain/models/entities';
import { stableIntegrityHash } from '@/features/backupRecovery/backupFormat';
import { parseLocalDate, toLocalDateString } from '@/shared/dates/localDate';

export const schoolYearRolloverRequestSchema = z
  .object({
    sourceSchoolYearId: z.string().min(1),
    targetSchoolYearId: z.string().min(1),
    selectedPlanIds: z.array(z.string().min(1)).max(20_000),
    copySchedule: z.boolean(),
    selectedScheduleBlockIds: z.array(z.string().min(1)).max(5_000),
  })
  .superRefine((value, context) => {
    if (value.sourceSchoolYearId === value.targetSchoolYearId) {
      context.addIssue({
        code: 'custom',
        message: 'Choose different source and target school years.',
        path: ['targetSchoolYearId'],
      });
    }
    if (!value.copySchedule && value.selectedScheduleBlockIds.length > 0) {
      context.addIssue({
        code: 'custom',
        message: 'Schedule Blocks cannot be selected when Schedule copy is off.',
        path: ['selectedScheduleBlockIds'],
      });
    }
  });

export type SchoolYearRolloverRequest = z.infer<typeof schoolYearRolloverRequestSchema>;

export interface SchoolYearRolloverData {
  schoolYears: SchoolYear[];
  learnerContexts: LearnerContext[];
  scheduleBlocks: ScheduleBlock[];
  lessonSeries: LessonSeries[];
  lessonPlans: LessonPlan[];
  standardAlignments: StandardAlignment[];
  categoryAssignments: CategoryAssignment[];
}

export interface InstructionalPlanCandidate {
  plan: LessonPlan;
  context: LearnerContext;
  series?: LessonSeries;
}

export interface RolloverContextRow {
  source: LearnerContext;
  target: LearnerContext;
  action: 'create' | 'reuse';
}

export interface RolloverSeriesRow {
  source: LessonSeries;
  target: LessonSeries;
}

export interface RolloverPlanRow {
  source: LessonPlan;
  target: LessonPlan;
  contextName: string;
  seriesTitle?: string;
}

export interface RolloverScheduleConflict {
  blockId: string;
  blockTitle: string;
  conflictingBlockId: string;
  conflictingBlockTitle: string;
  reason: string;
}

export interface RolloverScheduleRow {
  source: ScheduleBlock;
  target: ScheduleBlock;
  conflicts: RolloverScheduleConflict[];
}

export interface SchoolYearRolloverPreview {
  request: SchoolYearRolloverRequest;
  sourceSchoolYear: SchoolYear;
  targetSchoolYear: SchoolYear;
  contextRows: RolloverContextRow[];
  seriesRows: RolloverSeriesRow[];
  planRows: RolloverPlanRow[];
  scheduleRows: RolloverScheduleRow[];
  createdContexts: LearnerContext[];
  createdSeries: LessonSeries[];
  createdPlans: LessonPlan[];
  createdScheduleBlocks: ScheduleBlock[];
  createdStandardAlignments: StandardAlignment[];
  createdCategoryAssignments: CategoryAssignment[];
  conflicts: RolloverScheduleConflict[];
  warnings: string[];
  blockingIssues: string[];
  baselineHash: string;
  canCommit: boolean;
  changeCount: number;
}

export interface SchoolYearRolloverModelDependencies {
  createId?: () => string;
  now?: () => string;
}

function normalizedName(value: string): string {
  return value.trim().toLocaleLowerCase('en');
}

function contextIdentity(context: Pick<LearnerContext, 'kind' | 'name'>): string {
  return `${context.kind}:${normalizedName(context.name)}`;
}

function comparePlan(
  first: InstructionalPlanCandidate,
  second: InstructionalPlanCandidate,
): number {
  return (
    first.context.name.localeCompare(second.context.name) ||
    (first.series?.title ?? '').localeCompare(second.series?.title ?? '') ||
    (first.plan.sequence ?? Number.MAX_SAFE_INTEGER) -
      (second.plan.sequence ?? Number.MAX_SAFE_INTEGER) ||
    first.plan.title.localeCompare(second.plan.title)
  );
}

function compareSchedule(first: ScheduleBlock, second: ScheduleBlock): number {
  return (
    first.sortOrder - second.sortOrder ||
    first.startMinute - second.startMinute ||
    first.title.localeCompare(second.title) ||
    first.id.localeCompare(second.id)
  );
}

function sortedById<T extends { id: string }>(values: readonly T[]): T[] {
  return [...values].sort((first, second) => first.id.localeCompare(second.id));
}

export function rolloverBaselineHash(data: SchoolYearRolloverData): string {
  return stableIntegrityHash({
    schoolYears: sortedById(data.schoolYears),
    learnerContexts: sortedById(data.learnerContexts),
    scheduleBlocks: sortedById(data.scheduleBlocks),
    lessonSeries: sortedById(data.lessonSeries),
    lessonPlans: sortedById(data.lessonPlans),
    standardAlignments: sortedById(data.standardAlignments),
    categoryAssignments: sortedById(data.categoryAssignments),
  });
}

function requireSchoolYear(values: readonly SchoolYear[], id: string, label: string): SchoolYear {
  const value = values.find((schoolYear) => schoolYear.id === id);
  if (!value) throw new Error(`${label} school year no longer exists.`);
  return schoolYearSchema.parse(value);
}

export function listInstructionalRolloverCandidates(
  sourceSchoolYearId: string,
  data: SchoolYearRolloverData,
): InstructionalPlanCandidate[] {
  const contextById = new Map(
    data.learnerContexts
      .filter(
        (context) =>
          context.schoolYearId === sourceSchoolYearId &&
          context.status === 'active' &&
          context.kind !== 'individual',
      )
      .map((context) => [context.id, context]),
  );
  const seriesById = new Map(
    data.lessonSeries
      .filter((series) => series.lifecycleState === 'active')
      .map((series) => [series.id, series]),
  );

  return data.lessonPlans
    .filter((plan) => plan.workflowState !== 'archived' && contextById.has(plan.contextId))
    .map((plan) => ({
      plan,
      context: contextById.get(plan.contextId)!,
      series: plan.seriesId ? seriesById.get(plan.seriesId) : undefined,
    }))
    .sort(comparePlan);
}

function sourceScheduleBlockIds(
  sourceContextIds: ReadonlySet<string>,
  scheduleBlocks: readonly ScheduleBlock[],
): Set<string> {
  const activeBlocks = scheduleBlocks.filter((block) => !block.archivedAt);
  const blockById = new Map(activeBlocks.map((block) => [block.id, block]));
  const included = new Set(
    activeBlocks
      .filter((block) => block.contextId && sourceContextIds.has(block.contextId))
      .map((block) => block.id),
  );
  for (const blockId of [...included]) {
    let parentId = blockById.get(blockId)?.parentId;
    const visited = new Set<string>();
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = blockById.get(parentId);
      if (!parent) break;
      included.add(parent.id);
      parentId = parent.parentId;
    }
  }
  return included;
}

export function listRolloverScheduleCandidates(
  sourceSchoolYearId: string,
  selectedPlanIds: readonly string[],
  data: SchoolYearRolloverData,
): ScheduleBlock[] {
  const selectedIds = new Set(selectedPlanIds);
  const sourceContextIds = new Set(
    listInstructionalRolloverCandidates(sourceSchoolYearId, data)
      .filter((candidate) => selectedIds.has(candidate.plan.id))
      .map((candidate) => candidate.context.id),
  );
  const candidateIds = sourceScheduleBlockIds(sourceContextIds, data.scheduleBlocks);
  return data.scheduleBlocks
    .filter((block) => candidateIds.has(block.id) && !block.archivedAt)
    .sort(compareSchedule);
}

function clampLocalDate(value: string, minimum: string, maximum: string): string {
  if (value < minimum) return minimum;
  if (value > maximum) return maximum;
  return value;
}

function shiftScheduleBoundary(
  value: string | undefined,
  boundary: 'start' | 'end',
  sourceYear: SchoolYear,
  targetYear: SchoolYear,
): string {
  if (!value) return boundary === 'start' ? targetYear.startsOn : targetYear.endsOn;
  if (boundary === 'start' && value <= sourceYear.startsOn) return targetYear.startsOn;
  if (boundary === 'end' && value >= sourceYear.endsOn) return targetYear.endsOn;
  const sourceStart = parseLocalDate(sourceYear.startsOn);
  const targetStart = parseLocalDate(targetYear.startsOn);
  const parsed = parseLocalDate(value);
  if (!sourceStart || !targetStart || !parsed) throw new Error('A Schedule date is invalid.');
  const shifted = toLocalDateString(
    addDays(targetStart, differenceInCalendarDays(parsed, sourceStart)),
  );
  return clampLocalDate(shifted, targetYear.startsOn, targetYear.endsOn);
}

function blockRange(block: ScheduleBlock): [string, string] {
  return [block.effectiveFrom ?? '0000-01-01', block.effectiveTo ?? '9999-12-31'];
}

function rangesOverlap(first: [string, string], second: [string, string]): boolean {
  return first[0] <= second[1] && second[0] <= first[1];
}

function weekdaysOverlap(first: readonly number[], second: readonly number[]): boolean {
  const values = new Set(first);
  return second.some((weekday) => values.has(weekday));
}

function timesOverlap(first: ScheduleBlock, second: ScheduleBlock): boolean {
  return first.startMinute < second.endMinute && second.startMinute < first.endMinute;
}

function contextsCompete(first: ScheduleBlock, second: ScheduleBlock): boolean {
  if (first.contextId && second.contextId) return first.contextId === second.contextId;
  return !first.contextId && !second.contextId;
}

function blocksConflict(first: ScheduleBlock, second: ScheduleBlock): boolean {
  if (first.kind === 'container' || second.kind === 'container') return false;
  return (
    rangesOverlap(blockRange(first), blockRange(second)) &&
    weekdaysOverlap(first.weekdays, second.weekdays) &&
    timesOverlap(first, second) &&
    contextsCompete(first, second)
  );
}

function cloneFlow(
  source: readonly LessonFlowStep[] | undefined,
  createId: () => string,
): { lessonFlow: LessonFlowStep[] | undefined; stepIdMap: Map<string, string> } {
  if (!source) return { lessonFlow: undefined, stepIdMap: new Map() };
  const stepIdMap = new Map(source.map((step) => [step.id, createId()]));
  return {
    lessonFlow: source.map((step) => ({
      ...step,
      id: stepIdMap.get(step.id)!,
    })),
    stepIdMap,
  };
}

function schoolYearBoundarySignature(value: SchoolYear): string {
  return JSON.stringify({
    id: value.id,
    startsOn: value.startsOn,
    endsOn: value.endsOn,
    active: value.active,
    lifecycleState: value.lifecycleState,
    archivedAt: value.archivedAt,
  });
}

export function schoolYearDatesUnchanged(
  before: Pick<SchoolYearRolloverPreview, 'sourceSchoolYear' | 'targetSchoolYear'>,
  current: readonly SchoolYear[],
): boolean {
  const source = current.find((year) => year.id === before.sourceSchoolYear.id);
  const target = current.find((year) => year.id === before.targetSchoolYear.id);
  return Boolean(
    source &&
    target &&
    schoolYearBoundarySignature(source) === schoolYearBoundarySignature(before.sourceSchoolYear) &&
    schoolYearBoundarySignature(target) === schoolYearBoundarySignature(before.targetSchoolYear),
  );
}

export function buildSchoolYearRolloverPreview(
  input: SchoolYearRolloverRequest,
  rawData: SchoolYearRolloverData,
  dependencies: SchoolYearRolloverModelDependencies = {},
): SchoolYearRolloverPreview {
  const request = schoolYearRolloverRequestSchema.parse({
    ...input,
    selectedPlanIds: [...new Set(input.selectedPlanIds)],
    selectedScheduleBlockIds: [...new Set(input.selectedScheduleBlockIds)],
  });
  const createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
  const now = dependencies.now ?? (() => new Date().toISOString());

  const data: SchoolYearRolloverData = {
    schoolYears: rawData.schoolYears.map((value) => schoolYearSchema.parse(value)),
    learnerContexts: rawData.learnerContexts.map((value) => learnerContextSchema.parse(value)),
    scheduleBlocks: rawData.scheduleBlocks.map((value) => scheduleBlockSchema.parse(value)),
    lessonSeries: rawData.lessonSeries.map((value) => lessonSeriesSchema.parse(value)),
    lessonPlans: rawData.lessonPlans.map((value) => lessonPlanSchema.parse(value)),
    standardAlignments: rawData.standardAlignments.map((value) =>
      standardAlignmentSchema.parse(value),
    ),
    categoryAssignments: rawData.categoryAssignments.map((value) =>
      categoryAssignmentSchema.parse(value),
    ),
  };

  const sourceSchoolYear = requireSchoolYear(
    data.schoolYears,
    request.sourceSchoolYearId,
    'Source',
  );
  const targetSchoolYear = requireSchoolYear(
    data.schoolYears,
    request.targetSchoolYearId,
    'Target',
  );

  const blockingIssues: string[] = [];
  const warnings: string[] = [];

  if (sourceSchoolYear.lifecycleState === 'archived') {
    blockingIssues.push('Restore the source school year before rolling plans forward.');
  }
  if (targetSchoolYear.lifecycleState === 'archived') {
    blockingIssues.push('Restore the target school year before committing rollover.');
  }
  if (targetSchoolYear.active) {
    warnings.push(
      `${targetSchoolYear.label} is already active. Rollover will not change activation.`,
    );
  }

  const allCandidates = listInstructionalRolloverCandidates(sourceSchoolYear.id, data);
  const candidateByPlanId = new Map(
    allCandidates.map((candidate) => [candidate.plan.id, candidate]),
  );
  const selectedCandidates: InstructionalPlanCandidate[] = [];

  for (const selectedId of request.selectedPlanIds) {
    const candidate = candidateByPlanId.get(selectedId);
    if (!candidate) {
      blockingIssues.push(
        `Selected Lesson Plan ${selectedId} is not an active Class or Group plan in the source year.`,
      );
      continue;
    }
    selectedCandidates.push(candidate);
  }

  if (selectedCandidates.length === 0) {
    blockingIssues.push('Select at least one active Lesson Plan to continue.');
  }

  const sourceContextById = new Map(
    selectedCandidates.map((candidate) => [candidate.context.id, candidate.context]),
  );
  const targetContexts = data.learnerContexts.filter(
    (context) => context.schoolYearId === targetSchoolYear.id,
  );
  const targetByIdentity = new Map<string, LearnerContext[]>();
  for (const context of targetContexts) {
    const values = targetByIdentity.get(contextIdentity(context)) ?? [];
    values.push(context);
    targetByIdentity.set(contextIdentity(context), values);
  }

  const contextRows: RolloverContextRow[] = [];
  const mappedTargetBySource = new Map<string, LearnerContext>();

  for (const source of [...sourceContextById.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const matches = targetByIdentity.get(contextIdentity(source)) ?? [];
    if (matches.length > 1) {
      blockingIssues.push(
        `${source.kind === 'class' ? 'Class' : 'Group'} “${source.name}” has multiple matching target records.`,
      );
      continue;
    }
    const existing = matches[0];
    if (existing?.status === 'archived') {
      blockingIssues.push(
        `${source.kind === 'class' ? 'Class' : 'Group'} “${source.name}” exists as archived in ${targetSchoolYear.label}.`,
      );
      continue;
    }
    const target = existing
      ? existing
      : learnerContextSchema.parse({
          ...source,
          id: createId(),
          schoolYearId: targetSchoolYear.id,
          status: 'active',
        });
    mappedTargetBySource.set(source.id, target);
    contextRows.push({ source, target, action: existing ? 'reuse' : 'create' });
  }

  const selectedSourceSeries = new Map<string, LessonSeries>();
  for (const candidate of selectedCandidates) {
    if (candidate.series) selectedSourceSeries.set(candidate.series.id, candidate.series);
  }

  const targetSeries = data.lessonSeries.filter((series) =>
    [...mappedTargetBySource.values()].some((context) => context.id === series.contextId),
  );
  const seriesRows: RolloverSeriesRow[] = [];
  const mappedSeriesBySource = new Map<string, LessonSeries>();
  const createdAt = now();

  for (const source of [...selectedSourceSeries.values()].sort((a, b) =>
    a.title.localeCompare(b.title),
  )) {
    const targetContext = mappedTargetBySource.get(source.contextId);
    if (!targetContext) continue;
    const duplicate = targetSeries.find((series) => series.rolledOverFromSeriesId === source.id);
    if (duplicate) {
      blockingIssues.push(
        `Lesson Series “${source.title}” was already rolled over to ${targetSchoolYear.label}.`,
      );
      continue;
    }
    const target = lessonSeriesSchema.parse({
      ...source,
      id: createId(),
      contextId: targetContext.id,
      lifecycleState: 'active',
      archivedAt: undefined,
      updatedAt: createdAt,
      rolledOverFromSeriesId: source.id,
      rolledOverFromSchoolYearId: sourceSchoolYear.id,
    });
    mappedSeriesBySource.set(source.id, target);
    seriesRows.push({ source, target });
  }

  const selectedSourceContextIds = new Set(sourceContextById.keys());
  const allowedScheduleIds = sourceScheduleBlockIds(selectedSourceContextIds, data.scheduleBlocks);
  const activeBlockById = new Map(
    data.scheduleBlocks.filter((block) => !block.archivedAt).map((block) => [block.id, block]),
  );
  const includedScheduleIds = new Set<string>();

  if (request.copySchedule) {
    for (const selectedId of request.selectedScheduleBlockIds) {
      if (!allowedScheduleIds.has(selectedId)) {
        blockingIssues.push(
          `Selected Schedule Block ${selectedId} is not available for the selected plans.`,
        );
        continue;
      }
      let current: ScheduleBlock | undefined = activeBlockById.get(selectedId);
      const visited = new Set<string>();
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        includedScheduleIds.add(current.id);
        current = current.parentId ? activeBlockById.get(current.parentId) : undefined;
      }
    }
  }

  const sourceScheduleBlocks = data.scheduleBlocks
    .filter((block) => includedScheduleIds.has(block.id) && !block.archivedAt)
    .sort(compareSchedule);
  const targetScheduleIdBySource = new Map(
    sourceScheduleBlocks.map((block) => [block.id, createId()]),
  );
  const scheduleRows: RolloverScheduleRow[] = [];
  const conflicts: RolloverScheduleConflict[] = [];

  for (const source of sourceScheduleBlocks) {
    const targetContext = source.contextId ? mappedTargetBySource.get(source.contextId) : undefined;
    if (source.contextId && !targetContext) {
      blockingIssues.push(
        `Schedule Block “${source.title}” belongs to a context without selected plans.`,
      );
      continue;
    }
    const effectiveFrom = shiftScheduleBoundary(
      source.effectiveFrom,
      'start',
      sourceSchoolYear,
      targetSchoolYear,
    );
    const effectiveTo = shiftScheduleBoundary(
      source.effectiveTo,
      'end',
      sourceSchoolYear,
      targetSchoolYear,
    );
    const target = scheduleBlockSchema.parse({
      ...source,
      id: targetScheduleIdBySource.get(source.id),
      parentId: source.parentId ? targetScheduleIdBySource.get(source.parentId) : undefined,
      contextId: targetContext?.id,
      effectiveFrom,
      effectiveTo,
      archivedAt: undefined,
    });
    scheduleRows.push({ source, target, conflicts: [] });
  }

  const existingTargetBlocks = data.scheduleBlocks.filter(
    (block) =>
      !includedScheduleIds.has(block.id) &&
      !block.archivedAt &&
      rangesOverlap(blockRange(block), [targetSchoolYear.startsOn, targetSchoolYear.endsOn]),
  );
  for (const row of scheduleRows) {
    for (const existing of existingTargetBlocks) {
      if (!blocksConflict(row.target, existing)) continue;
      const conflict: RolloverScheduleConflict = {
        blockId: row.target.id,
        blockTitle: row.target.title,
        conflictingBlockId: existing.id,
        conflictingBlockTitle: existing.title,
        reason: 'Overlapping weekday, time, date range, and Class or Group',
      };
      row.conflicts.push(conflict);
      conflicts.push(conflict);
    }
  }
  for (let firstIndex = 0; firstIndex < scheduleRows.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < scheduleRows.length; secondIndex += 1) {
      const first = scheduleRows[firstIndex]!;
      const second = scheduleRows[secondIndex]!;
      if (!blocksConflict(first.target, second.target)) continue;
      const conflict: RolloverScheduleConflict = {
        blockId: first.target.id,
        blockTitle: first.target.title,
        conflictingBlockId: second.target.id,
        conflictingBlockTitle: second.target.title,
        reason: 'Two selected Schedule Blocks overlap after date shifting',
      };
      first.conflicts.push(conflict);
      second.conflicts.push(conflict);
      conflicts.push(conflict);
    }
  }
  if (conflicts.length > 0) {
    warnings.push(
      `${conflicts.length} Schedule conflict${conflicts.length === 1 ? '' : 's'} will be copied as review warnings. Lesson Plans are not blocked.`,
    );
  }

  const targetPlanBySource = new Map<string, LessonPlan>();
  const stepMapBySourcePlan = new Map<string, Map<string, string>>();
  const planRows: RolloverPlanRow[] = [];

  for (const candidate of selectedCandidates) {
    const source = candidate.plan;
    const targetContext = mappedTargetBySource.get(source.contextId);
    if (!targetContext) continue;
    const duplicate = data.lessonPlans.find(
      (plan) => plan.contextId === targetContext.id && plan.rolledOverFromPlanId === source.id,
    );
    if (duplicate) {
      blockingIssues.push(
        `Lesson Plan “${source.title}” was already rolled over to ${targetSchoolYear.label}.`,
      );
      continue;
    }

    const flow = cloneFlow(source.lessonFlow, createId);
    const targetSeries = source.seriesId ? mappedSeriesBySource.get(source.seriesId) : undefined;
    const target = lessonPlanSchema.parse({
      ...source,
      id: createId(),
      contextId: targetContext.id,
      seriesId: targetSeries?.id,
      preferredScheduleBlockId: source.preferredScheduleBlockId
        ? targetScheduleIdBySource.get(source.preferredScheduleBlockId)
        : undefined,
      workflowState: 'draft',
      lessonFlow: flow.lessonFlow,
      createdAt,
      updatedAt: createdAt,
      rolledOverFromPlanId: source.id,
      rolledOverFromSchoolYearId: sourceSchoolYear.id,
    });
    targetPlanBySource.set(source.id, target);
    stepMapBySourcePlan.set(source.id, flow.stepIdMap);
    planRows.push({
      source,
      target,
      contextName: candidate.context.name,
      seriesTitle: candidate.series?.title,
    });
  }

  const createdStandardAlignments: StandardAlignment[] = [];
  for (const source of data.standardAlignments) {
    if (source.targetType !== 'lesson-plan') continue;
    const targetPlan = targetPlanBySource.get(source.targetId);
    if (!targetPlan) continue;
    const targetStepId = source.lessonFlowStepId
      ? stepMapBySourcePlan.get(source.targetId)?.get(source.lessonFlowStepId)
      : undefined;
    if (source.lessonFlowStepId && !targetStepId) {
      warnings.push(
        `A stale step-level Standard alignment on plan ${source.targetId} was not copied.`,
      );
      continue;
    }
    createdStandardAlignments.push(
      standardAlignmentSchema.parse({
        ...source,
        id: createId(),
        targetId: targetPlan.id,
        lessonFlowStepId: targetStepId,
        scopeKey: targetStepId
          ? `lesson-plan:${targetPlan.id}:step:${targetStepId}`
          : `lesson-plan:${targetPlan.id}:root`,
        createdAt,
      }),
    );
  }

  const createdCategoryAssignments: CategoryAssignment[] = [];
  for (const source of data.categoryAssignments) {
    if (source.entityType !== 'lesson-plan') continue;
    const targetPlan = targetPlanBySource.get(source.entityId);
    if (!targetPlan) continue;
    createdCategoryAssignments.push(
      categoryAssignmentSchema.parse({
        ...source,
        id: createId(),
        entityId: targetPlan.id,
        createdAt,
      }),
    );
  }

  const createdContexts = contextRows
    .filter((row) => row.action === 'create')
    .map((row) => row.target);
  const createdSeries = seriesRows.map((row) => row.target);
  const createdPlans = planRows.map((row) => row.target);
  const createdScheduleBlocks = scheduleRows.map((row) => row.target);
  const changeCount =
    createdContexts.length +
    createdSeries.length +
    createdPlans.length +
    createdScheduleBlocks.length +
    createdStandardAlignments.length +
    createdCategoryAssignments.length;

  if (createdPlans.length === 0 && blockingIssues.length === 0) {
    blockingIssues.push('This preview contains no new Lesson Plans to commit.');
  }

  return {
    request,
    sourceSchoolYear,
    targetSchoolYear,
    contextRows,
    seriesRows,
    planRows,
    scheduleRows,
    createdContexts,
    createdSeries,
    createdPlans,
    createdScheduleBlocks,
    createdStandardAlignments,
    createdCategoryAssignments,
    conflicts,
    warnings,
    blockingIssues,
    baselineHash: rolloverBaselineHash(data),
    canCommit: blockingIssues.length === 0 && createdPlans.length > 0,
    changeCount,
  };
}

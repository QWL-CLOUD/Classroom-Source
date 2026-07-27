import { addDays, differenceInCalendarDays } from 'date-fns';
import { z } from 'zod';

import {
  contextMembershipSchema,
  learnerContextSchema,
  scheduleBlockSchema,
  schoolYearSchema,
  type ContextMembership,
  type LearnerContext,
  type ScheduleBlock,
  type SchoolYear,
} from '@/domain/models/entities';
import { stableIntegrityHash } from '@/features/backupRecovery/backupFormat';
import { parseLocalDate, toLocalDateString } from '@/shared/dates/localDate';

export const schoolYearRolloverRequestSchema = z
  .object({
    sourceSchoolYearId: z.string().min(1),
    targetSchoolYearId: z.string().min(1),
    selectedContextIds: z.array(z.string().min(1)).max(5_000),
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
  contextMemberships: ContextMembership[];
  scheduleBlocks: ScheduleBlock[];
}

export interface RolloverContextRow {
  source: LearnerContext;
  target: LearnerContext;
  action: 'create' | 'reuse';
}

export interface RolloverMembershipRow {
  source: ContextMembership;
  target: ContextMembership;
  action: 'create' | 'reuse';
  containerName: string;
  memberName: string;
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
  membershipRows: RolloverMembershipRow[];
  scheduleRows: RolloverScheduleRow[];
  createdContexts: LearnerContext[];
  createdMemberships: ContextMembership[];
  createdScheduleBlocks: ScheduleBlock[];
  conflicts: RolloverScheduleConflict[];
  warnings: string[];
  blockingIssues: string[];
  baselineHash: string;
  canCommit: boolean;
  changeCount: number;
}

export interface SchoolYearRolloverModelDependencies {
  createId?: () => string;
}

function normalizedName(value: string): string {
  return value.trim().toLocaleLowerCase('en');
}

function contextIdentity(context: Pick<LearnerContext, 'kind' | 'name'>): string {
  return `${context.kind}:${normalizedName(context.name)}`;
}

function compareContext(first: LearnerContext, second: LearnerContext): number {
  const kindOrder = { class: 0, group: 1, individual: 2 } as const;
  return kindOrder[first.kind] - kindOrder[second.kind] || first.name.localeCompare(second.name);
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
    contextMemberships: sortedById(data.contextMemberships),
    scheduleBlocks: sortedById(data.scheduleBlocks),
  });
}

function requireSchoolYear(values: readonly SchoolYear[], id: string, label: string): SchoolYear {
  const value = values.find((schoolYear) => schoolYear.id === id);
  if (!value) throw new Error(`${label} school year no longer exists.`);
  return schoolYearSchema.parse(value);
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
  data: SchoolYearRolloverData,
): ScheduleBlock[] {
  const sourceContextIds = new Set(
    data.learnerContexts
      .filter(
        (context) => context.schoolYearId === sourceSchoolYearId && context.status === 'active',
      )
      .map((context) => context.id),
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

function kindLabel(kind: LearnerContext['kind']): string {
  if (kind === 'class') return 'Class';
  if (kind === 'group') return 'Group';
  return 'Individual';
}

export function buildSchoolYearRolloverPreview(
  input: SchoolYearRolloverRequest,
  rawData: SchoolYearRolloverData,
  dependencies: SchoolYearRolloverModelDependencies = {},
): SchoolYearRolloverPreview {
  const request = schoolYearRolloverRequestSchema.parse({
    ...input,
    selectedContextIds: [...new Set(input.selectedContextIds)],
    selectedScheduleBlockIds: [...new Set(input.selectedScheduleBlockIds)],
  });
  const createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
  const data: SchoolYearRolloverData = {
    schoolYears: rawData.schoolYears.map((value) => schoolYearSchema.parse(value)),
    learnerContexts: rawData.learnerContexts.map((value) => learnerContextSchema.parse(value)),
    contextMemberships: rawData.contextMemberships.map((value) =>
      contextMembershipSchema.parse(value),
    ),
    scheduleBlocks: rawData.scheduleBlocks.map((value) => scheduleBlockSchema.parse(value)),
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
    blockingIssues.push('Restore the source school year before rolling it forward.');
  }
  if (targetSchoolYear.lifecycleState === 'archived') {
    blockingIssues.push('Restore the target school year before committing rollover.');
  }
  if (targetSchoolYear.active) {
    warnings.push(
      `${targetSchoolYear.label} is already active. Rollover will not change activation.`,
    );
  }

  const sourceContexts = data.learnerContexts
    .filter(
      (context) =>
        context.schoolYearId === sourceSchoolYear.id &&
        context.status === 'active' &&
        request.selectedContextIds.includes(context.id),
    )
    .sort(compareContext);
  const validSourceIds = new Set(sourceContexts.map((context) => context.id));
  for (const selectedId of request.selectedContextIds) {
    if (!validSourceIds.has(selectedId)) {
      blockingIssues.push(
        `Selected learner context ${selectedId} is no longer active in the source year.`,
      );
    }
  }
  if (sourceContexts.length === 0) {
    blockingIssues.push('Select at least one active learner context to continue.');
  }

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
  for (const source of sourceContexts) {
    const matches = targetByIdentity.get(contextIdentity(source)) ?? [];
    if (matches.length > 1) {
      blockingIssues.push(
        `${kindLabel(source.kind)} “${source.name}” has multiple matching target records. Resolve the duplicate target contexts first.`,
      );
      continue;
    }
    const existing = matches[0];
    if (existing?.status === 'archived') {
      blockingIssues.push(
        `${kindLabel(source.kind)} “${source.name}” already exists as archived in ${targetSchoolYear.label}. Restore it before rollover.`,
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

  const selectedSourceIds = new Set(sourceContexts.map((context) => context.id));
  const sourceNameById = new Map(sourceContexts.map((context) => [context.id, context.name]));
  const existingMembershipByPair = new Map(
    data.contextMemberships.map((membership) => [
      `${membership.containerContextId}:${membership.memberContextId}`,
      membership,
    ]),
  );
  const membershipRows: RolloverMembershipRow[] = [];
  for (const membership of data.contextMemberships) {
    if (
      !selectedSourceIds.has(membership.containerContextId) ||
      !selectedSourceIds.has(membership.memberContextId)
    ) {
      continue;
    }
    const targetContainer = mappedTargetBySource.get(membership.containerContextId);
    const targetMember = mappedTargetBySource.get(membership.memberContextId);
    if (!targetContainer || !targetMember) continue;
    const pair = `${targetContainer.id}:${targetMember.id}`;
    const existing = existingMembershipByPair.get(pair);
    const target = existing
      ? existing
      : contextMembershipSchema.parse({
          ...membership,
          id: createId(),
          containerContextId: targetContainer.id,
          memberContextId: targetMember.id,
        });
    membershipRows.push({
      source: membership,
      target,
      action: existing ? 'reuse' : 'create',
      containerName: sourceNameById.get(membership.containerContextId) ?? 'Container',
      memberName: sourceNameById.get(membership.memberContextId) ?? 'Member',
    });
  }

  const scheduleRows: RolloverScheduleRow[] = [];
  const conflicts: RolloverScheduleConflict[] = [];
  if (request.copySchedule) {
    const allSourceContextIds = new Set(
      data.learnerContexts
        .filter(
          (context) => context.schoolYearId === sourceSchoolYear.id && context.status === 'active',
        )
        .map((context) => context.id),
    );
    const allowedScheduleIds = sourceScheduleBlockIds(allSourceContextIds, data.scheduleBlocks);
    const activeBlockById = new Map(
      data.scheduleBlocks.filter((block) => !block.archivedAt).map((block) => [block.id, block]),
    );
    const includedIds = new Set<string>();
    for (const selectedId of request.selectedScheduleBlockIds) {
      if (!allowedScheduleIds.has(selectedId)) {
        blockingIssues.push(
          `Selected Schedule Block ${selectedId} is not available for the source year.`,
        );
        continue;
      }
      let current: ScheduleBlock | undefined = activeBlockById.get(selectedId);
      const visited = new Set<string>();
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        includedIds.add(current.id);
        current = current.parentId ? activeBlockById.get(current.parentId) : undefined;
      }
    }
    const sourceBlocks = data.scheduleBlocks
      .filter((block) => includedIds.has(block.id) && !block.archivedAt)
      .sort(compareSchedule);
    const targetIdBySourceBlock = new Map(sourceBlocks.map((block) => [block.id, createId()]));

    for (const source of sourceBlocks) {
      const targetContext = source.contextId
        ? mappedTargetBySource.get(source.contextId)
        : undefined;
      if (source.contextId && !targetContext) {
        blockingIssues.push(
          `Schedule Block “${source.title}” belongs to a learner context that is not selected for continuation.`,
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
      if (effectiveFrom > effectiveTo) {
        blockingIssues.push(
          `Schedule Block “${source.title}” produces an invalid target date range.`,
        );
        continue;
      }
      const target = scheduleBlockSchema.parse({
        ...source,
        id: targetIdBySourceBlock.get(source.id),
        parentId: source.parentId ? targetIdBySourceBlock.get(source.parentId) : undefined,
        contextId: targetContext?.id,
        effectiveFrom,
        effectiveTo,
        archivedAt: undefined,
      });
      scheduleRows.push({ source, target, conflicts: [] });
    }

    const existingTargetBlocks = data.scheduleBlocks.filter(
      (block) =>
        !includedIds.has(block.id) &&
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
          reason: 'Overlapping weekday, time, date range, and learner context',
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
      blockingIssues.push(
        `${conflicts.length} Schedule conflict${conflicts.length === 1 ? '' : 's'} must be resolved by deselecting or editing blocks before rollover.`,
      );
    }
  }

  const createdContexts = contextRows
    .filter((row) => row.action === 'create')
    .map((row) => row.target);
  const createdMemberships = membershipRows
    .filter((row) => row.action === 'create')
    .map((row) => row.target);
  const createdScheduleBlocks = scheduleRows.map((row) => row.target);
  const changeCount =
    createdContexts.length + createdMemberships.length + createdScheduleBlocks.length;
  if (changeCount === 0 && blockingIssues.length === 0) {
    blockingIssues.push('This preview contains no new records to commit.');
  }

  return {
    request,
    sourceSchoolYear,
    targetSchoolYear,
    contextRows,
    membershipRows,
    scheduleRows,
    createdContexts,
    createdMemberships,
    createdScheduleBlocks,
    conflicts,
    warnings,
    blockingIssues,
    baselineHash: rolloverBaselineHash(data),
    canCommit: blockingIssues.length === 0 && changeCount > 0,
    changeCount,
  };
}

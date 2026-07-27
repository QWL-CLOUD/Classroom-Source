import { describe, expect, it } from 'vitest';

import type {
  ContextMembership,
  LearnerContext,
  ScheduleBlock,
  SchoolYear,
} from '@/domain/models/entities';

import {
  buildSchoolYearRolloverPreview,
  listRolloverScheduleCandidates,
  type SchoolYearRolloverData,
} from './schoolYearRolloverModel';

const sourceYear: SchoolYear = {
  id: 'year-source',
  label: '2026–2027',
  startsOn: '2026-07-01',
  endsOn: '2027-06-30',
  active: true,
  lifecycleState: 'active',
};

const targetYear: SchoolYear = {
  id: 'year-target',
  label: '2027–2028',
  startsOn: '2027-08-15',
  endsOn: '2028-06-15',
  active: false,
  lifecycleState: 'active',
};

const contexts: LearnerContext[] = [
  {
    id: 'class-source',
    kind: 'class',
    name: 'Grade 3',
    schoolYearId: sourceYear.id,
    status: 'active',
  },
  {
    id: 'group-source',
    kind: 'group',
    name: 'Blue Group',
    schoolYearId: sourceYear.id,
    status: 'active',
  },
  {
    id: 'learner-source',
    kind: 'individual',
    name: 'Avery',
    schoolYearId: sourceYear.id,
    status: 'active',
  },
];

const memberships: ContextMembership[] = [
  {
    id: 'membership-class-group',
    containerContextId: 'class-source',
    memberContextId: 'group-source',
  },
  {
    id: 'membership-group-learner',
    containerContextId: 'group-source',
    memberContextId: 'learner-source',
  },
];

const scheduleBlocks: ScheduleBlock[] = [
  {
    id: 'schedule-parent',
    title: 'Grade 3 day',
    subject: '',
    category: 'Teaching',
    kind: 'container',
    weekdays: [1, 2, 3, 4, 5],
    startMinute: 480,
    endMinute: 900,
    effectiveFrom: sourceYear.startsOn,
    effectiveTo: sourceYear.endsOn,
    planningEnabled: false,
    bumpEnabled: false,
    showInWeek: true,
    sortOrder: 0,
  },
  {
    id: 'schedule-math',
    parentId: 'schedule-parent',
    contextId: 'class-source',
    title: 'Math',
    subject: 'Math',
    category: 'Teaching',
    kind: 'teachable',
    weekdays: [1, 3],
    startMinute: 540,
    endMinute: 600,
    effectiveFrom: '2026-09-01',
    effectiveTo: '2027-05-31',
    planningEnabled: true,
    bumpEnabled: true,
    showInWeek: true,
    sortOrder: 1,
  },
];

function data(overrides: Partial<SchoolYearRolloverData> = {}): SchoolYearRolloverData {
  return {
    schoolYears: [sourceYear, targetYear],
    learnerContexts: contexts,
    contextMemberships: memberships,
    scheduleBlocks,
    ...overrides,
  };
}

function ids(...values: string[]): () => string {
  const queue = [...values];
  return () => queue.shift() ?? `generated-${queue.length}`;
}

describe('school year rollover preview', () => {
  it('continues selected contexts and preserves placements without copying teaching records', () => {
    const preview = buildSchoolYearRolloverPreview(
      {
        sourceSchoolYearId: sourceYear.id,
        targetSchoolYearId: targetYear.id,
        selectedContextIds: contexts.map((context) => context.id),
        copySchedule: false,
        selectedScheduleBlockIds: [],
      },
      data(),
      {
        createId: ids(
          'class-target',
          'group-target',
          'learner-target',
          'membership-target-1',
          'membership-target-2',
        ),
      },
    );

    expect(preview.canCommit).toBe(true);
    expect(preview.createdContexts).toHaveLength(3);
    expect(preview.createdMemberships).toHaveLength(2);
    expect(preview.createdScheduleBlocks).toEqual([]);
    expect(preview.targetSchoolYear.active).toBe(false);
    expect(preview.membershipRows).toEqual([
      expect.objectContaining({
        action: 'create',
        containerName: 'Grade 3',
        memberName: 'Blue Group',
      }),
      expect.objectContaining({
        action: 'create',
        containerName: 'Blue Group',
        memberName: 'Avery',
      }),
    ]);
  });

  it('reuses one matching active target context and blocks an archived match', () => {
    const activeTarget: LearnerContext = {
      ...contexts[0]!,
      id: 'class-target-existing',
      schoolYearId: targetYear.id,
    };
    const archivedTarget: LearnerContext = {
      ...contexts[1]!,
      id: 'group-target-archived',
      schoolYearId: targetYear.id,
      status: 'archived',
    };

    const preview = buildSchoolYearRolloverPreview(
      {
        sourceSchoolYearId: sourceYear.id,
        targetSchoolYearId: targetYear.id,
        selectedContextIds: ['class-source', 'group-source'],
        copySchedule: false,
        selectedScheduleBlockIds: [],
      },
      data({ learnerContexts: [...contexts, activeTarget, archivedTarget] }),
      { createId: ids('unused') },
    );

    expect(preview.contextRows).toContainEqual(
      expect.objectContaining({
        source: expect.objectContaining({ id: 'class-source' }),
        action: 'reuse',
      }),
    );
    expect(preview.blockingIssues).toContainEqual(expect.stringMatching(/exists as archived/));
    expect(preview.canCommit).toBe(false);
  });

  it('includes Schedule ancestors and shifts effective dates into the target year', () => {
    const preview = buildSchoolYearRolloverPreview(
      {
        sourceSchoolYearId: sourceYear.id,
        targetSchoolYearId: targetYear.id,
        selectedContextIds: ['class-source'],
        copySchedule: true,
        selectedScheduleBlockIds: ['schedule-math'],
      },
      data(),
      { createId: ids('class-target', 'parent-target', 'math-target') },
    );

    expect(listRolloverScheduleCandidates(sourceYear.id, data()).map((block) => block.id)).toEqual([
      'schedule-parent',
      'schedule-math',
    ]);
    expect(preview.createdScheduleBlocks).toHaveLength(2);
    expect(preview.createdScheduleBlocks).toContainEqual(
      expect.objectContaining({
        id: 'parent-target',
        effectiveFrom: targetYear.startsOn,
        effectiveTo: targetYear.endsOn,
      }),
    );
    expect(preview.createdScheduleBlocks).toContainEqual(
      expect.objectContaining({
        id: 'math-target',
        parentId: 'parent-target',
        contextId: 'class-target',
        effectiveFrom: '2027-10-16',
        effectiveTo: '2028-06-15',
      }),
    );
    expect(preview.conflicts).toEqual([]);
    expect(preview.canCommit).toBe(true);
  });

  it('blocks a shifted Schedule conflict against the target context', () => {
    const activeTarget: LearnerContext = {
      ...contexts[0]!,
      id: 'class-target-existing',
      schoolYearId: targetYear.id,
    };
    const targetConflict: ScheduleBlock = {
      ...scheduleBlocks[1]!,
      id: 'target-conflict',
      parentId: undefined,
      contextId: activeTarget.id,
      title: 'Target intervention',
      effectiveFrom: targetYear.startsOn,
      effectiveTo: targetYear.endsOn,
    };
    const preview = buildSchoolYearRolloverPreview(
      {
        sourceSchoolYearId: sourceYear.id,
        targetSchoolYearId: targetYear.id,
        selectedContextIds: ['class-source'],
        copySchedule: true,
        selectedScheduleBlockIds: ['schedule-math'],
      },
      data({
        learnerContexts: [...contexts, activeTarget],
        scheduleBlocks: [...scheduleBlocks, targetConflict],
      }),
      { createId: ids('parent-target', 'math-target') },
    );

    expect(preview.conflicts).toHaveLength(1);
    expect(preview.blockingIssues).toContainEqual(expect.stringMatching(/Schedule conflict/));
    expect(preview.canCommit).toBe(false);
  });
});

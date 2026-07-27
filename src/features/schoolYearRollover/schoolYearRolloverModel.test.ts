import { describe, expect, it } from 'vitest';

import {
  buildSchoolYearRolloverPreview,
  listInstructionalRolloverCandidates,
  schoolYearDatesUnchanged,
  type SchoolYearRolloverData,
} from './schoolYearRolloverModel';

function data(): SchoolYearRolloverData {
  return {
    schoolYears: [
      {
        id: 'source-year',
        label: '2026–2027',
        startsOn: '2026-08-24',
        endsOn: '2027-06-18',
        active: true,
        lifecycleState: 'active',
      },
      {
        id: 'target-year',
        label: '2027–2028',
        startsOn: '2027-08-23',
        endsOn: '2028-06-16',
        active: false,
        lifecycleState: 'active',
      },
    ],
    learnerContexts: [
      {
        id: 'source-class',
        kind: 'class',
        name: 'Grade 3',
        schoolYearId: 'source-year',
        status: 'active',
      },
      {
        id: 'source-student',
        kind: 'individual',
        name: 'Student A',
        schoolYearId: 'source-year',
        status: 'active',
      },
    ],
    scheduleBlocks: [
      {
        id: 'source-schedule',
        contextId: 'source-class',
        title: 'Chinese',
        subject: 'Chinese',
        category: 'Teaching',
        kind: 'teachable',
        weekdays: [1],
        startMinute: 540,
        endMinute: 600,
        effectiveFrom: '2026-08-24',
        effectiveTo: '2027-06-18',
        planningEnabled: true,
        bumpEnabled: true,
        showInWeek: true,
        sortOrder: 0,
      },
    ],
    lessonSeries: [
      {
        id: 'source-series',
        contextId: 'source-class',
        title: 'Unit 1',
        subject: 'Chinese',
        lifecycleState: 'active',
      },
    ],
    lessonPlans: [
      {
        id: 'source-plan',
        contextId: 'source-class',
        title: 'Lesson 1',
        subject: 'Chinese',
        workflowState: 'ready',
        seriesId: 'source-series',
        sequence: 0,
        preferredScheduleBlockId: 'source-schedule',
        lessonFlow: [{ id: 'source-step', title: 'Opening', phase: 'opening' }],
        createdAt: '2026-07-01T12:00:00.000Z',
        updatedAt: '2026-07-01T12:00:00.000Z',
      },
      {
        id: 'individual-plan',
        contextId: 'source-student',
        title: 'Private plan',
        subject: 'Chinese',
        workflowState: 'ready',
        createdAt: '2026-07-01T12:00:00.000Z',
        updatedAt: '2026-07-01T12:00:00.000Z',
      },
    ],
    standardAlignments: [
      {
        id: 'source-alignment',
        standardId: 'standard-1',
        targetType: 'lesson-plan',
        targetId: 'source-plan',
        lessonFlowStepId: 'source-step',
        scopeKey: 'lesson-plan:source-plan:step:source-step',
        createdAt: '2026-07-01T12:00:00.000Z',
      },
    ],
    categoryAssignments: [
      {
        id: 'source-category',
        familyId: 'focus-tag',
        categoryValueId: 'focus-value',
        entityType: 'lesson-plan',
        entityId: 'source-plan',
        createdAt: '2026-07-01T12:00:00.000Z',
      },
    ],
  };
}

describe('instructional school year rollover model', () => {
  it('offers Class and Group plans but excludes individual student plans', () => {
    expect(
      listInstructionalRolloverCandidates('source-year', data()).map((value) => value.plan.id),
    ).toEqual(['source-plan']);
  });

  it('copies plans, flow, standards and categories while keeping School Year dates immutable', () => {
    const ids = [
      'target-class',
      'target-series',
      'target-schedule',
      'target-step',
      'target-plan',
      'target-alignment',
      'target-category',
    ];
    const preview = buildSchoolYearRolloverPreview(
      {
        sourceSchoolYearId: 'source-year',
        targetSchoolYearId: 'target-year',
        selectedPlanIds: ['source-plan'],
        copySchedule: true,
        selectedScheduleBlockIds: ['source-schedule'],
      },
      data(),
      {
        createId: () => ids.shift()!,
        now: () => '2027-07-01T12:00:00.000Z',
      },
    );

    expect(preview.canCommit).toBe(true);
    expect(preview.createdContexts).toHaveLength(1);
    expect(preview.createdSeries).toHaveLength(1);
    expect(preview.createdPlans[0]).toMatchObject({
      workflowState: 'draft',
      preferredScheduleBlockId: 'target-schedule',
      rolledOverFromPlanId: 'source-plan',
      rolledOverFromSchoolYearId: 'source-year',
    });
    expect(preview.createdPlans[0]?.lessonFlow?.[0]?.id).toBe('target-step');
    expect(preview.createdStandardAlignments[0]).toMatchObject({
      targetId: 'target-plan',
      lessonFlowStepId: 'target-step',
      scopeKey: 'lesson-plan:target-plan:step:target-step',
    });
    expect(preview.createdCategoryAssignments[0]).toMatchObject({
      entityId: 'target-plan',
    });
    expect(schoolYearDatesUnchanged(preview, data().schoolYears)).toBe(true);
  });

  it('keeps Schedule conflicts as warnings instead of blocking Lesson Plan copy', () => {
    const values = data();
    values.learnerContexts.push({
      id: 'target-class',
      kind: 'class',
      name: 'Grade 3',
      schoolYearId: 'target-year',
      status: 'active',
    });
    values.scheduleBlocks.push({
      id: 'target-conflict',
      contextId: 'target-class',
      title: 'Existing Chinese',
      subject: 'Chinese',
      category: 'Teaching',
      kind: 'teachable',
      weekdays: [1],
      startMinute: 540,
      endMinute: 600,
      effectiveFrom: '2027-08-23',
      effectiveTo: '2028-06-16',
      planningEnabled: true,
      bumpEnabled: true,
      showInWeek: true,
      sortOrder: 0,
    });
    const ids = [
      'target-series',
      'copied-schedule',
      'target-step',
      'target-plan',
      'target-alignment',
      'target-category',
    ];
    const preview = buildSchoolYearRolloverPreview(
      {
        sourceSchoolYearId: 'source-year',
        targetSchoolYearId: 'target-year',
        selectedPlanIds: ['source-plan'],
        copySchedule: true,
        selectedScheduleBlockIds: ['source-schedule'],
      },
      values,
      {
        createId: () => ids.shift()!,
        now: () => '2027-07-01T12:00:00.000Z',
      },
    );
    expect(preview.conflicts).toHaveLength(1);
    expect(preview.warnings.join(' ')).toMatch(/Schedule conflict/);
    expect(preview.canCommit).toBe(true);
  });
  it('blocks a second rollover of the same source plan into the same target context', () => {
    const values = data();
    values.learnerContexts.push({
      id: 'target-class',
      kind: 'class',
      name: 'Grade 3',
      schoolYearId: 'target-year',
      status: 'active',
    });
    values.lessonPlans.push({
      id: 'existing-copy',
      contextId: 'target-class',
      title: 'Lesson 1',
      subject: 'Chinese',
      workflowState: 'draft',
      createdAt: '2027-07-01T12:00:00.000Z',
      updatedAt: '2027-07-01T12:00:00.000Z',
      rolledOverFromPlanId: 'source-plan',
      rolledOverFromSchoolYearId: 'source-year',
    });
    const preview = buildSchoolYearRolloverPreview(
      {
        sourceSchoolYearId: 'source-year',
        targetSchoolYearId: 'target-year',
        selectedPlanIds: ['source-plan'],
        copySchedule: false,
        selectedScheduleBlockIds: [],
      },
      values,
      {
        createId: () => crypto.randomUUID(),
        now: () => '2027-07-01T12:00:00.000Z',
      },
    );
    expect(preview.blockingIssues.join(' ')).toMatch(/already rolled over/);
    expect(preview.canCommit).toBe(false);
  });
});

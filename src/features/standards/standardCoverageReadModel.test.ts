import { describe, expect, it } from 'vitest';

import type {
  LessonPlan,
  LessonTemplate,
  Standard,
  StandardAlignment,
} from '@/domain/models/entities';
import { buildStandardsCoverageView } from './standardCoverageReadModel';

const timestamp = '2026-07-26T12:00:00.000Z';

function standard(id: string, code: string, overrides: Partial<Standard> = {}): Standard {
  return {
    id,
    issuingOrganization: 'Synthetic Standards Office',
    frameworkTitle: 'Synthetic Framework',
    frameworkKey: 'synthetic|framework',
    code,
    normalizedCode: code.toLocaleLowerCase('en'),
    statement: `Statement for ${code}`,
    subject: 'Mathematics',
    gradeBand: '3',
    sortOrder: 0,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

const plans: LessonPlan[] = [
  {
    id: 'plan-aligned',
    contextId: 'context-1',
    title: 'Aligned Plan',
    subject: 'Math',
    workflowState: 'ready',
    lessonFlow: [
      { id: 'plan-step-aligned', title: 'Aligned step', phase: 'instruction' },
      { id: 'plan-step-open', title: 'Open step', phase: 'closure' },
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: 'plan-open',
    contextId: 'context-1',
    title: 'Unaligned Plan',
    subject: 'Math',
    workflowState: 'draft',
    lessonFlow: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: 'plan-archived',
    contextId: 'context-1',
    title: 'Archived Plan',
    subject: 'Math',
    workflowState: 'archived',
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];

const templates: LessonTemplate[] = [
  {
    id: 'template-aligned',
    title: 'Aligned Template',
    status: 'active',
    lessonFlow: [{ id: 'template-step', title: 'Template step', phase: 'guided-practice' }],
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: 'template-open',
    title: 'Unaligned Template',
    status: 'active',
    lessonFlow: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: 'template-archived',
    title: 'Archived Template',
    status: 'archived',
    lessonFlow: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: timestamp,
  },
];

function alignment(
  id: string,
  standardId: string,
  targetType: StandardAlignment['targetType'],
  targetId: string,
  lessonFlowStepId?: string,
): StandardAlignment {
  return {
    id,
    standardId,
    targetType,
    targetId,
    lessonFlowStepId,
    scopeKey: lessonFlowStepId
      ? `${targetType}:${targetId}:step:${lessonFlowStepId}`
      : `${targetType}:${targetId}:root`,
    createdAt: timestamp,
  };
}

describe('Standards coverage read model', () => {
  it('counts only explicit active source alignments by Plan, step, and Lesson Template', () => {
    const standards = [
      standard('standard-a', '3.NF.A.1'),
      standard('standard-b', '3.NF.A.2'),
      standard('standard-open', '3.NF.A.3'),
      standard('standard-archived', '3.NF.A.4', {
        status: 'archived',
        archivedAt: timestamp,
      }),
    ];
    const alignments = [
      alignment('alignment-plan', 'standard-a', 'lesson-plan', 'plan-aligned'),
      alignment(
        'alignment-plan-step',
        'standard-a',
        'lesson-plan',
        'plan-aligned',
        'plan-step-aligned',
      ),
      alignment('alignment-template', 'standard-b', 'lesson-template', 'template-aligned'),
      alignment(
        'alignment-template-step',
        'standard-b',
        'lesson-template',
        'template-aligned',
        'template-step',
      ),
      alignment('archived-standard', 'standard-archived', 'lesson-plan', 'plan-aligned'),
      alignment('archived-plan', 'standard-a', 'lesson-plan', 'plan-archived'),
      alignment('archived-template', 'standard-a', 'lesson-template', 'template-archived'),
      alignment('stale-step', 'standard-a', 'lesson-plan', 'plan-aligned', 'removed-step'),
    ];

    const coverage = buildStandardsCoverageView({ standards, alignments, plans, templates });

    expect(coverage).toMatchObject({
      activeStandardCount: 3,
      alignedStandardCount: 2,
      unalignedStandardCount: 1,
      activeAlignmentCount: 4,
      entityCounts: { lessonPlan: 1, lessonFlowStep: 2, lessonTemplate: 1 },
    });
    expect(coverage.unalignedStandards.map((row) => row.label)).toEqual(['3.NF.A.3']);
    expect(coverage.alignments.map((row) => row.entityType)).toEqual([
      'lesson-plan',
      'lesson-flow-step',
      'lesson-template',
      'lesson-flow-step',
    ]);
  });

  it('shows unaligned roots and Lesson Flow steps at their own explicit scope', () => {
    const coverage = buildStandardsCoverageView({
      standards: [standard('standard-a', '3.NF.A.1')],
      alignments: [
        alignment(
          'alignment-plan-step',
          'standard-a',
          'lesson-plan',
          'plan-aligned',
          'plan-step-aligned',
        ),
      ],
      plans,
      templates,
    });

    expect(
      coverage.unalignedSources.map((source) => [
        source.entityType,
        source.title,
        source.stepTitle,
      ]),
    ).toEqual([
      ['lesson-flow-step', 'Aligned Plan', 'Open step'],
      ['lesson-flow-step', 'Aligned Template', 'Template step'],
      ['lesson-plan', 'Aligned Plan', undefined],
      ['lesson-plan', 'Unaligned Plan', undefined],
      ['lesson-template', 'Aligned Template', undefined],
      ['lesson-template', 'Unaligned Template', undefined],
    ]);
  });

  it('builds descriptive framework, subject, grade-band, and Standard groups', () => {
    const standards = [
      standard('standard-a', '3.NF.A.1'),
      standard('standard-b', '3.NF.A.2', {
        subject: undefined,
        gradeBand: undefined,
      }),
    ];
    const coverage = buildStandardsCoverageView({
      standards,
      alignments: [alignment('alignment-plan', 'standard-a', 'lesson-plan', 'plan-aligned')],
      plans,
      templates,
    });

    expect(coverage.groups.framework).toEqual([
      expect.objectContaining({ standardCount: 2, alignedStandardCount: 1, alignmentCount: 1 }),
    ]);
    expect(coverage.groups.subject.map((group) => group.label)).toEqual([
      'Mathematics',
      'Not specified',
    ]);
    expect(coverage.groups['grade-band'].map((group) => group.label)).toEqual([
      '3',
      'Not specified',
    ]);
    expect(coverage.groups.standard).toEqual([
      expect.objectContaining({ label: '3.NF.A.1', alignmentCount: 1 }),
      expect.objectContaining({ label: '3.NF.A.2', alignmentCount: 0 }),
    ]);
  });
});

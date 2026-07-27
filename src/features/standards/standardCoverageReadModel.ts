import type {
  LessonPlan,
  LessonTemplate,
  Standard,
  StandardAlignment,
} from '@/domain/models/entities';
import { standardFrameworkLabel } from '@/features/standards/standardReadModel';

export type StandardCoverageEntityType = 'lesson-plan' | 'lesson-flow-step' | 'lesson-template';
export type StandardCoverageDimension = 'framework' | 'subject' | 'grade-band' | 'standard';

export const standardCoverageEntityLabels: Record<StandardCoverageEntityType, string> = {
  'lesson-plan': 'Plans',
  'lesson-flow-step': 'Lesson Flow steps',
  'lesson-template': 'Lesson Templates',
};

export interface StandardCoverageEntityCounts {
  lessonPlan: number;
  lessonFlowStep: number;
  lessonTemplate: number;
}

export interface StandardCoverageAlignmentView {
  alignmentId: string;
  standardId: string;
  standardCode: string;
  standardStatement: string;
  frameworkKey: string;
  frameworkLabel: string;
  subject?: string;
  gradeBand?: string;
  entityType: StandardCoverageEntityType;
  targetType: StandardAlignment['targetType'];
  targetId: string;
  sourceTitle: string;
  sourceHref: string;
  stepId?: string;
  stepTitle?: string;
}

export interface StandardCoverageGroup {
  key: string;
  label: string;
  standardCount: number;
  alignedStandardCount: number;
  alignmentCount: number;
  entityCounts: StandardCoverageEntityCounts;
  frameworkKey?: string;
  subject?: string;
  gradeBand?: string;
  standardId?: string;
  standardStatement?: string;
}

export interface UnalignedCoverageSource {
  entityType: StandardCoverageEntityType;
  targetType: StandardAlignment['targetType'];
  targetId: string;
  title: string;
  href: string;
  stepId?: string;
  stepTitle?: string;
}

export interface StandardsCoverageView {
  activeStandardCount: number;
  alignedStandardCount: number;
  unalignedStandardCount: number;
  activeAlignmentCount: number;
  entityCounts: StandardCoverageEntityCounts;
  alignments: StandardCoverageAlignmentView[];
  unalignedStandards: StandardCoverageGroup[];
  unalignedSources: UnalignedCoverageSource[];
  groups: Record<StandardCoverageDimension, StandardCoverageGroup[]>;
}

interface ActiveTarget {
  type: StandardAlignment['targetType'];
  id: string;
  title: string;
  href: string;
  steps: Map<string, string>;
}

function emptyEntityCounts(): StandardCoverageEntityCounts {
  return { lessonPlan: 0, lessonFlowStep: 0, lessonTemplate: 0 };
}

function incrementEntityCount(
  counts: StandardCoverageEntityCounts,
  entityType: StandardCoverageEntityType,
): void {
  if (entityType === 'lesson-plan') counts.lessonPlan += 1;
  else if (entityType === 'lesson-template') counts.lessonTemplate += 1;
  else counts.lessonFlowStep += 1;
}

function coverageEntityType(alignment: StandardAlignment): StandardCoverageEntityType {
  if (alignment.lessonFlowStepId) return 'lesson-flow-step';
  return alignment.targetType;
}

function planHref(planId: string): string {
  const params = new URLSearchParams({ plan: planId, return: 'learners' });
  return `#/planning/edit?${params.toString()}`;
}

function templateHref(templateId: string): string {
  return `#/templates?template=${encodeURIComponent(templateId)}`;
}

function activeTargets(
  plans: readonly LessonPlan[],
  templates: readonly LessonTemplate[],
): Map<string, ActiveTarget> {
  const targets = new Map<string, ActiveTarget>();
  for (const plan of plans) {
    if (plan.workflowState === 'archived') continue;
    targets.set(`lesson-plan:${plan.id}`, {
      type: 'lesson-plan',
      id: plan.id,
      title: plan.title,
      href: planHref(plan.id),
      steps: new Map((plan.lessonFlow ?? []).map((step) => [step.id, step.title])),
    });
  }
  for (const template of templates) {
    if (template.status !== 'active') continue;
    targets.set(`lesson-template:${template.id}`, {
      type: 'lesson-template',
      id: template.id,
      title: template.title,
      href: templateHref(template.id),
      steps: new Map(template.lessonFlow.map((step) => [step.id, step.title])),
    });
  }
  return targets;
}

function buildGroup(
  key: string,
  label: string,
  standards: readonly Standard[],
  alignments: readonly StandardCoverageAlignmentView[],
  extras: Partial<StandardCoverageGroup> = {},
): StandardCoverageGroup {
  const standardIds = new Set(standards.map((standard) => standard.id));
  const groupAlignments = alignments.filter((alignment) => standardIds.has(alignment.standardId));
  const alignedStandardIds = new Set(groupAlignments.map((alignment) => alignment.standardId));
  const entityCounts = emptyEntityCounts();
  for (const alignment of groupAlignments) incrementEntityCount(entityCounts, alignment.entityType);
  return {
    key,
    label,
    standardCount: standards.length,
    alignedStandardCount: alignedStandardIds.size,
    alignmentCount: groupAlignments.length,
    entityCounts,
    ...extras,
  };
}

function groupedStandards(
  standards: readonly Standard[],
  alignments: readonly StandardCoverageAlignmentView[],
  keyFor: (standard: Standard) => string,
  labelFor: (standard: Standard) => string,
  extrasFor: (standard: Standard) => Partial<StandardCoverageGroup>,
): StandardCoverageGroup[] {
  const groups = new Map<string, Standard[]>();
  for (const standard of standards) {
    const key = keyFor(standard);
    const values = groups.get(key) ?? [];
    values.push(standard);
    groups.set(key, values);
  }
  return [...groups.entries()]
    .map(([key, values]) =>
      buildGroup(key, labelFor(values[0]!), values, alignments, extrasFor(values[0]!)),
    )
    .sort((first, second) =>
      first.label.localeCompare(second.label, 'en', { numeric: true, sensitivity: 'base' }),
    );
}

export function buildStandardsCoverageView(input: {
  standards: readonly Standard[];
  alignments: readonly StandardAlignment[];
  plans: readonly LessonPlan[];
  templates: readonly LessonTemplate[];
}): StandardsCoverageView {
  const standards = input.standards.filter((standard) => standard.status === 'active');
  const standardsById = new Map(standards.map((standard) => [standard.id, standard]));
  const targets = activeTargets(input.plans, input.templates);
  const alignments: StandardCoverageAlignmentView[] = [];

  for (const alignment of input.alignments) {
    const standard = standardsById.get(alignment.standardId);
    const target = targets.get(`${alignment.targetType}:${alignment.targetId}`);
    if (!standard || !target) continue;
    const stepTitle = alignment.lessonFlowStepId
      ? target.steps.get(alignment.lessonFlowStepId)
      : undefined;
    if (alignment.lessonFlowStepId && !stepTitle) continue;
    alignments.push({
      alignmentId: alignment.id,
      standardId: standard.id,
      standardCode: standard.code,
      standardStatement: standard.statement,
      frameworkKey: standard.frameworkKey,
      frameworkLabel: standardFrameworkLabel(standard),
      subject: standard.subject,
      gradeBand: standard.gradeBand,
      entityType: coverageEntityType(alignment),
      targetType: alignment.targetType,
      targetId: alignment.targetId,
      sourceTitle: target.title,
      sourceHref: target.href,
      stepId: alignment.lessonFlowStepId,
      stepTitle,
    });
  }

  alignments.sort(
    (first, second) =>
      first.frameworkLabel.localeCompare(second.frameworkLabel, 'en', {
        sensitivity: 'base',
      }) ||
      first.standardCode.localeCompare(second.standardCode, 'en', {
        numeric: true,
        sensitivity: 'base',
      }) ||
      first.sourceTitle.localeCompare(second.sourceTitle, 'en', { sensitivity: 'base' }) ||
      (first.stepTitle ?? '').localeCompare(second.stepTitle ?? '', 'en', { sensitivity: 'base' }),
  );

  const alignedStandardIds = new Set(alignments.map((alignment) => alignment.standardId));
  const entityCounts = emptyEntityCounts();
  for (const alignment of alignments) incrementEntityCount(entityCounts, alignment.entityType);

  const rootScopes = new Set(
    alignments
      .filter((alignment) => !alignment.stepId)
      .map((alignment) => `${alignment.targetType}:${alignment.targetId}`),
  );
  const stepScopes = new Set(
    alignments
      .filter((alignment) => alignment.stepId)
      .map(
        (alignment) =>
          `${alignment.targetType}:${alignment.targetId}:step:${alignment.stepId as string}`,
      ),
  );
  const unalignedSources: UnalignedCoverageSource[] = [];
  for (const target of targets.values()) {
    if (!rootScopes.has(`${target.type}:${target.id}`)) {
      unalignedSources.push({
        entityType: target.type,
        targetType: target.type,
        targetId: target.id,
        title: target.title,
        href: target.href,
      });
    }
    for (const [stepId, stepTitle] of target.steps) {
      if (stepScopes.has(`${target.type}:${target.id}:step:${stepId}`)) continue;
      unalignedSources.push({
        entityType: 'lesson-flow-step',
        targetType: target.type,
        targetId: target.id,
        title: target.title,
        href: target.href,
        stepId,
        stepTitle,
      });
    }
  }
  unalignedSources.sort(
    (first, second) =>
      first.entityType.localeCompare(second.entityType) ||
      first.title.localeCompare(second.title, 'en', { sensitivity: 'base' }) ||
      (first.stepTitle ?? '').localeCompare(second.stepTitle ?? '', 'en', { sensitivity: 'base' }),
  );

  const frameworkGroups = groupedStandards(
    standards,
    alignments,
    (standard) => standard.frameworkKey,
    (standard) => standardFrameworkLabel(standard),
    (standard) => ({ frameworkKey: standard.frameworkKey }),
  );
  const subjectGroups = groupedStandards(
    standards,
    alignments,
    (standard) => standard.subject ?? '__not-specified__',
    (standard) => standard.subject ?? 'Not specified',
    (standard) => ({ subject: standard.subject ?? '' }),
  );
  const gradeBandGroups = groupedStandards(
    standards,
    alignments,
    (standard) => standard.gradeBand ?? '__not-specified__',
    (standard) => standard.gradeBand ?? 'Not specified',
    (standard) => ({ gradeBand: standard.gradeBand ?? '' }),
  );
  const standardGroups = standards
    .map((standard) =>
      buildGroup(standard.id, standard.code, [standard], alignments, {
        standardId: standard.id,
        standardStatement: standard.statement,
      }),
    )
    .sort(
      (first, second) =>
        first.label.localeCompare(second.label, 'en', { numeric: true, sensitivity: 'base' }) ||
        first.key.localeCompare(second.key),
    );

  return {
    activeStandardCount: standards.length,
    alignedStandardCount: alignedStandardIds.size,
    unalignedStandardCount: standards.length - alignedStandardIds.size,
    activeAlignmentCount: alignments.length,
    entityCounts,
    alignments,
    unalignedStandards: standardGroups.filter((group) => group.alignmentCount === 0),
    unalignedSources,
    groups: {
      framework: frameworkGroups,
      subject: subjectGroups,
      'grade-band': gradeBandGroups,
      standard: standardGroups,
    },
  };
}

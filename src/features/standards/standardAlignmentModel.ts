import {
  standardAlignmentSchema,
  type LessonFlowStep,
  type StandardAlignment,
  type StandardAlignmentTargetType,
} from '@/domain/models/entities';

import { buildStandardAlignmentScopeKey } from './standardIdentity';

export interface StandardAlignmentDraft {
  rootStandardIds: string[];
  stepStandardIds: Record<string, string[]>;
}

export interface StandardAlignmentTarget {
  targetType: StandardAlignmentTargetType;
  targetId: string;
  lessonFlow: readonly LessonFlowStep[];
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((first, second) => first.localeCompare(second));
}

export function emptyStandardAlignmentDraft(
  lessonFlow: readonly Pick<LessonFlowStep, 'id'>[],
): StandardAlignmentDraft {
  return {
    rootStandardIds: [],
    stepStandardIds: Object.fromEntries(lessonFlow.map((step) => [step.id, []])),
  };
}

export function buildStandardAlignmentDraft(
  alignments: readonly StandardAlignment[],
  target: StandardAlignmentTarget,
): StandardAlignmentDraft {
  const draft = emptyStandardAlignmentDraft(target.lessonFlow);
  for (const value of alignments) {
    const alignment = standardAlignmentSchema.parse(value);
    if (alignment.targetType !== target.targetType || alignment.targetId !== target.targetId) {
      continue;
    }
    if (alignment.lessonFlowStepId) {
      if (!draft.stepStandardIds[alignment.lessonFlowStepId]) continue;
      draft.stepStandardIds[alignment.lessonFlowStepId]!.push(alignment.standardId);
    } else {
      draft.rootStandardIds.push(alignment.standardId);
    }
  }
  draft.rootStandardIds = sortedUnique(draft.rootStandardIds);
  for (const stepId of Object.keys(draft.stepStandardIds)) {
    draft.stepStandardIds[stepId] = sortedUnique(draft.stepStandardIds[stepId]!);
  }
  return draft;
}

export function listDesiredStandardAlignmentScopes(
  target: StandardAlignmentTarget,
  draft: StandardAlignmentDraft,
): Array<{
  standardId: string;
  lessonFlowStepId?: string;
  scopeKey: string;
}> {
  const values: Array<{
    standardId: string;
    lessonFlowStepId?: string;
    scopeKey: string;
  }> = [];
  for (const standardId of sortedUnique(draft.rootStandardIds)) {
    values.push({
      standardId,
      scopeKey: buildStandardAlignmentScopeKey(target),
    });
  }
  const validStepIds = new Set(target.lessonFlow.map((step) => step.id));
  for (const [lessonFlowStepId, standardIds] of Object.entries(draft.stepStandardIds)) {
    if (!validStepIds.has(lessonFlowStepId)) continue;
    for (const standardId of sortedUnique(standardIds)) {
      values.push({
        standardId,
        lessonFlowStepId,
        scopeKey: buildStandardAlignmentScopeKey({
          ...target,
          lessonFlowStepId,
        }),
      });
    }
  }
  return values;
}

export function toggleStandardAlignment(
  draft: StandardAlignmentDraft,
  standardId: string,
  lessonFlowStepId?: string,
): StandardAlignmentDraft {
  if (lessonFlowStepId) {
    const current = draft.stepStandardIds[lessonFlowStepId] ?? [];
    return {
      ...draft,
      stepStandardIds: {
        ...draft.stepStandardIds,
        [lessonFlowStepId]: current.includes(standardId)
          ? current.filter((value) => value !== standardId)
          : [...current, standardId],
      },
    };
  }
  return {
    ...draft,
    rootStandardIds: draft.rootStandardIds.includes(standardId)
      ? draft.rootStandardIds.filter((value) => value !== standardId)
      : [...draft.rootStandardIds, standardId],
  };
}

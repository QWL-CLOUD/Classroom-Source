import type { TeachingReflectionRecord } from '@/domain/models/entities';
import type { PlanningReturnTarget } from '@/features/planning/planningNavigation';
import {
  appendTeachingReviewReturnParams,
  type TeachingReviewReturnState,
} from '@/features/teachingReview/teachingReviewNavigation';

import {
  teachingReflectionValuesSchema,
  type TeachingReflectionValues,
} from './teachingReflectionMutationService';
import type { TeachingReflectionSourceWarning } from './teachingReflectionReadModel';

export interface TeachingReflectionEditorValues {
  whatWorked: string;
  whatToAdjust: string;
  additionalNotes: string;
}

export function createTeachingReflectionEditorValues(): TeachingReflectionEditorValues {
  return {
    whatWorked: '',
    whatToAdjust: '',
    additionalNotes: '',
  };
}

export function toTeachingReflectionEditorValues(
  reflection: TeachingReflectionRecord,
): TeachingReflectionEditorValues {
  return {
    whatWorked: reflection.whatWorked ?? '',
    whatToAdjust: reflection.whatToAdjust ?? '',
    additionalNotes: reflection.additionalNotes ?? '',
  };
}

export function parseTeachingReflectionEditorValues(
  values: TeachingReflectionEditorValues,
): TeachingReflectionValues {
  return teachingReflectionValuesSchema.parse(values);
}

export function buildTeachingReflectionHref(
  sessionOccurrenceId: string,
  returnTo: PlanningReturnTarget,
  reviewReturn?: TeachingReviewReturnState,
): string {
  const params = new URLSearchParams({ session: sessionOccurrenceId });
  if (returnTo !== 'learners') params.set('return', returnTo);
  if (returnTo === 'review' && reviewReturn) appendTeachingReviewReturnParams(params, reviewReturn);
  return `#/planning/session/reflection?${params.toString()}`;
}

export function buildTeachingReflectionSessionHref(
  sessionOccurrenceId: string,
  returnTo: PlanningReturnTarget,
  reviewReturn?: TeachingReviewReturnState,
): string {
  const params = new URLSearchParams({ session: sessionOccurrenceId });
  if (returnTo !== 'learners') params.set('return', returnTo);
  if (returnTo === 'review' && reviewReturn) appendTeachingReviewReturnParams(params, reviewReturn);
  return `#/planning/session?${params.toString()}`;
}

const sourceWarningMessages: Record<TeachingReflectionSourceWarning, string> = {
  'school-year-source-unavailable':
    'The original School Year is unavailable. The saved reflection remains readable.',
  'context-source-unavailable':
    'The original planning context is unavailable. The saved context snapshot is shown.',
  'lesson-plan-source-unavailable':
    'The original Lesson Plan is unavailable. The saved plan snapshot is shown.',
  'session-source-unavailable':
    'The original Session is unavailable. The saved date and time snapshot is shown.',
  'session-reopened':
    'The source Session is currently reopened. This reflection remains retained as teaching history.',
  'session-cancelled':
    'The source Session is currently cancelled. This reflection remains retained as teaching history.',
  'session-pointer-missing':
    'The source Session no longer points to this reflection. The reflection record remains retained.',
  'session-pointer-conflict':
    'The source Session points to a different reflection. Review the source records before editing.',
};

export function presentTeachingReflectionSourceWarning(
  warning: TeachingReflectionSourceWarning,
): string {
  return sourceWarningMessages[warning];
}

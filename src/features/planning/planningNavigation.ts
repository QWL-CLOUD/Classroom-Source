import {
  appendLearnerProgressReturnParams,
  buildLearnerProgressHref,
  type LearnerProgressReturnState,
} from '@/features/learnerProgress/learnerProgressNavigation';
import {
  appendTeachingReviewReturnParams,
  buildTeachingReviewHref,
  type TeachingReviewReturnState,
} from '@/features/teachingReview/teachingReviewNavigation';
import { buildWeekHref } from '@/features/week/weekNavigation';

export const planningReturnTargets = [
  'learners',
  'today',
  'week',
  'calendar',
  'review',
  'progress',
] as const;

export type PlanningReturnTarget = (typeof planningReturnTargets)[number];
export type DailyPlanningReturnTarget = Exclude<PlanningReturnTarget, 'review' | 'progress'>;

export function isDailyPlanningReturnTarget(
  value: PlanningReturnTarget,
): value is DailyPlanningReturnTarget {
  return value !== 'review' && value !== 'progress';
}

export function planningReturnTargetLabel(value: PlanningReturnTarget): string {
  switch (value) {
    case 'learners':
      return 'Learners';
    case 'today':
      return 'Today';
    case 'week':
      return 'Week';
    case 'calendar':
      return 'Calendar';
    case 'review':
      return 'Teaching Review';
    case 'progress':
      return 'Learner Progress';
  }
}

export function parsePlanningReturnTarget(value: string | null): PlanningReturnTarget {
  return planningReturnTargets.includes(value as PlanningReturnTarget)
    ? (value as PlanningReturnTarget)
    : 'learners';
}

export function buildPlanningEntryHref(options: {
  date: string;
  returnTo: Exclude<PlanningReturnTarget, 'learners' | 'progress'>;
  contextId?: string;
  scheduleBlockId?: string;
}): string {
  const params = new URLSearchParams({ date: options.date, return: options.returnTo });
  if (options.contextId) params.set('context', options.contextId);
  if (options.scheduleBlockId) params.set('block', options.scheduleBlockId);
  return `#/planning/edit?${params.toString()}`;
}

export function buildSessionEditorHref(options: {
  planId: string;
  date?: string;
  returnTo?: PlanningReturnTarget;
  reviewReturn?: TeachingReviewReturnState;
  progressReturn?: LearnerProgressReturnState;
}): string {
  const params = new URLSearchParams({ plan: options.planId });
  if (options.date) params.set('date', options.date);
  if (options.returnTo && options.returnTo !== 'learners') params.set('return', options.returnTo);
  if (options.returnTo === 'review' && options.reviewReturn) {
    appendTeachingReviewReturnParams(params, options.reviewReturn);
  }
  if (options.returnTo === 'progress' && options.progressReturn) {
    appendLearnerProgressReturnParams(params, options.progressReturn);
  }
  return `#/planning/session?${params.toString()}`;
}

export function buildPlanningSurfaceHref(options: {
  returnTo: PlanningReturnTarget;
  date: string;
  contextId: string;
  learnerView?: 'upcoming' | 'unscheduled' | 'completed';
  focusSessionId?: string;
  focusOccurrenceId?: string;
  reviewReturn?: TeachingReviewReturnState;
  progressReturn?: LearnerProgressReturnState;
}): string {
  if (options.returnTo === 'review') {
    return buildTeachingReviewHref(options.reviewReturn ?? {});
  }
  if (options.returnTo === 'progress') {
    return buildLearnerProgressHref(options.progressReturn ?? {});
  }
  if (options.returnTo === 'today') return `#/today?date=${options.date}`;
  if (options.returnTo === 'calendar') return `#/calendar?date=${options.date}`;
  if (options.returnTo === 'week') {
    return buildWeekHref({
      date: options.date,
      view: 'everything',
      focus:
        options.focusOccurrenceId ??
        (options.focusSessionId ? `session-occurrence:${options.focusSessionId}` : undefined),
    });
  }

  const params = new URLSearchParams({
    context: options.contextId,
    planning: options.learnerView ?? 'upcoming',
  });
  if (options.learnerView === 'upcoming') params.set('date', options.date);
  return `#/learners?${params.toString()}`;
}

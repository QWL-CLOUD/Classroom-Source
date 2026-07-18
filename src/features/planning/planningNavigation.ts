import { buildWeekHref } from '@/features/week/weekNavigation';

export const planningReturnTargets = ['learners', 'today', 'week', 'calendar'] as const;

export type PlanningReturnTarget = (typeof planningReturnTargets)[number];

export function parsePlanningReturnTarget(value: string | null): PlanningReturnTarget {
  return planningReturnTargets.includes(value as PlanningReturnTarget)
    ? (value as PlanningReturnTarget)
    : 'learners';
}

export function buildPlanningEntryHref(options: {
  date: string;
  returnTo: Exclude<PlanningReturnTarget, 'learners'>;
  contextId?: string;
}): string {
  const params = new URLSearchParams({ date: options.date, return: options.returnTo });
  if (options.contextId) params.set('context', options.contextId);
  return `#/planning/edit?${params.toString()}`;
}

export function buildSessionEditorHref(options: {
  planId: string;
  date?: string;
  returnTo?: PlanningReturnTarget;
}): string {
  const params = new URLSearchParams({ plan: options.planId });
  if (options.date) params.set('date', options.date);
  if (options.returnTo && options.returnTo !== 'learners') params.set('return', options.returnTo);
  return `#/planning/session?${params.toString()}`;
}

export function buildPlanningSurfaceHref(options: {
  returnTo: PlanningReturnTarget;
  date: string;
  contextId: string;
  learnerView?: 'upcoming' | 'unscheduled' | 'completed';
  focusSessionId?: string;
}): string {
  if (options.returnTo === 'today') return `#/today?date=${options.date}`;
  if (options.returnTo === 'calendar') return `#/calendar?date=${options.date}`;
  if (options.returnTo === 'week') {
    return buildWeekHref({
      date: options.date,
      view: 'everything',
      focus: options.focusSessionId ? `session-occurrence:${options.focusSessionId}` : undefined,
    });
  }

  const params = new URLSearchParams({
    context: options.contextId,
    planning: options.learnerView ?? 'upcoming',
  });
  if (options.learnerView === 'upcoming') params.set('date', options.date);
  return `#/learners?${params.toString()}`;
}

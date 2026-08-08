import type { TeachingInsightsSourceTrace } from '@/features/insights/teachingInsightsContract';

import {
  appendTeachingReviewPeriodParams,
  parseTeachingReviewPeriodState,
  type TeachingReviewPeriodState,
} from './teachingReviewPeriod';

export const teachingReviewQueues = [
  'awaiting-reflection',
  'past-still-scheduled',
  'open-next-steps',
  'record-issues',
] as const;

export type TeachingReviewQueue = (typeof teachingReviewQueues)[number];

export interface TeachingReviewReturnState {
  schoolYearId?: string;
  queue?: TeachingReviewQueue;
  focus?: string;
  period?: TeachingReviewPeriodState;
}

function clean(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

export function parseTeachingReviewQueue(value: string | null): TeachingReviewQueue | undefined {
  return teachingReviewQueues.includes(value as TeachingReviewQueue)
    ? (value as TeachingReviewQueue)
    : undefined;
}

export function parseTeachingReviewReturnState(
  search: URLSearchParams,
): TeachingReviewReturnState | null {
  if (search.get('return') !== 'review') return null;
  return {
    schoolYearId: clean(search.get('schoolYear')),
    queue: parseTeachingReviewQueue(search.get('reviewQueue')),
    focus: clean(search.get('reviewFocus')),
    period: parseTeachingReviewPeriodState(search, 'review'),
  };
}

export function appendTeachingReviewReturnParams(
  params: URLSearchParams,
  state: TeachingReviewReturnState,
): URLSearchParams {
  params.set('return', 'review');
  if (state.schoolYearId) params.set('schoolYear', state.schoolYearId);
  if (state.queue) params.set('reviewQueue', state.queue);
  if (state.focus) params.set('reviewFocus', state.focus);
  appendTeachingReviewPeriodParams(params, state.period, 'review');
  return params;
}

export function preserveTeachingReviewReturnParams(
  current: URLSearchParams,
  next: URLSearchParams,
): URLSearchParams {
  const state = parseTeachingReviewReturnState(current);
  return state ? appendTeachingReviewReturnParams(next, state) : next;
}

export function buildTeachingReviewHref(state: TeachingReviewReturnState): string {
  const params = new URLSearchParams();
  if (state.schoolYearId) params.set('schoolYear', state.schoolYearId);
  if (state.queue) params.set('queue', state.queue);
  if (state.focus) params.set('focus', state.focus);
  appendTeachingReviewPeriodParams(params, state.period);
  const query = params.toString();
  return query ? `#/teaching-review?${query}` : '#/teaching-review';
}

export function decorateTeachingReviewSourceHref(
  href: string,
  state: TeachingReviewReturnState,
): string {
  if (!href.startsWith('#/')) return href;
  const [path, query = ''] = href.slice(1).split('?');
  const params = appendTeachingReviewReturnParams(new URLSearchParams(query), state);
  return `#${path}?${params.toString()}`;
}

export function buildTeachingReviewSourceHref(
  source: TeachingInsightsSourceTrace,
  state: TeachingReviewReturnState,
): string | undefined {
  let href = source.href;
  if (source.entityType === 'assessment-evidence') {
    const params = new URLSearchParams({ evidence: source.entityId });
    if (state.schoolYearId) params.set('schoolYear', state.schoolYearId);
    href = `#/learner-progress?${params.toString()}`;
  } else if (source.entityType === 'standard') {
    href = `#/standards?standard=${encodeURIComponent(source.entityId)}`;
  } else if (source.entityType === 'library-item') {
    href = `#/library?item=${encodeURIComponent(source.entityId)}`;
  } else if (source.entityType === 'task') {
    href = `#/tasks?task=${encodeURIComponent(source.entityId)}`;
  }
  return href ? decorateTeachingReviewSourceHref(href, state) : undefined;
}

export function buildTeachingReviewTasksHref(
  reflectionId: string,
  state: TeachingReviewReturnState,
): string {
  const params = new URLSearchParams({ reflection: reflectionId });
  appendTeachingReviewReturnParams(params, state);
  return `#/tasks?${params.toString()}`;
}

export function reviewFocusKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`;
}

export function reviewFocusElementId(queue: TeachingReviewQueue, focus: string): string {
  return `teaching-review-focus-${queue}-${focus.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

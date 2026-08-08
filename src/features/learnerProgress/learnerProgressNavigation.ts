import {
  appendTeachingReviewReturnParams,
  parseTeachingReviewQueue,
  type TeachingReviewReturnState,
} from '@/features/teachingReview/teachingReviewNavigation';
import { parseLocalDate } from '@/shared/dates/localDate';

import type {
  LearnerProgressKindFilter,
  LearnerProgressMode,
  LearnerProgressOrder,
  LearnerProgressStatusFilter,
} from './learnerProgressReadModel';
import type { LearnerProgressPeriodState } from './learnerProgressPeriod';

export interface LearnerProgressReturnState {
  schoolYearId?: string;
  mode?: LearnerProgressMode;
  selectedId?: string;
  evidenceId?: string;
  status?: LearnerProgressStatusFilter;
  kind?: LearnerProgressKindFilter;
  assessmentId?: string;
  standardFilterId?: string;
  sessionId?: string;
  order?: LearnerProgressOrder;
  period?: LearnerProgressPeriodState;
  parentReview?: TeachingReviewReturnState;
}

function clean(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function parseMode(value: string | null): LearnerProgressMode | undefined {
  return value === 'learners' || value === 'contexts' || value === 'standards' ? value : undefined;
}

function parseStatus(value: string | null): LearnerProgressStatusFilter | undefined {
  return value === 'active' || value === 'archived' || value === 'all' ? value : undefined;
}

function parseKind(value: string | null): LearnerProgressKindFilter | undefined {
  return value === 'all' || value === 'score' || value === 'proficiency' || value === 'observation'
    ? value
    : undefined;
}

function parsePeriod(search: URLSearchParams): LearnerProgressPeriodState | undefined {
  const preset = search.get('progressPeriod');
  if (!preset || preset === 'school-year') return { preset: 'school-year' };
  if (preset === 'this-week' || preset === 'last-week') return { preset };
  if (preset !== 'custom') return undefined;
  const from = clean(search.get('progressFrom'));
  const to = clean(search.get('progressTo'));
  return from && to && parseLocalDate(from) && parseLocalDate(to) && from <= to
    ? { preset: 'custom', from, to }
    : { preset: 'school-year' };
}

function appendPeriod(params: URLSearchParams, period?: LearnerProgressPeriodState): void {
  params.delete('progressPeriod');
  params.delete('progressFrom');
  params.delete('progressTo');
  if (!period || period.preset === 'school-year') return;
  params.set('progressPeriod', period.preset);
  if (period.preset === 'custom' && period.from && period.to) {
    params.set('progressFrom', period.from);
    params.set('progressTo', period.to);
  }
}

function parseParentReview(search: URLSearchParams): TeachingReviewReturnState | undefined {
  const schoolYearId = clean(search.get('progressReviewSchoolYear'));
  const queue = parseTeachingReviewQueue(search.get('progressReviewQueue'));
  const focus = clean(search.get('progressReviewFocus'));
  const rawPeriod = search.get('progressReviewPeriod');
  const period =
    rawPeriod === 'this-week' || rawPeriod === 'last-week'
      ? { preset: rawPeriod as 'this-week' | 'last-week' }
      : rawPeriod === 'custom'
        ? (() => {
            const from = clean(search.get('progressReviewFrom'));
            const to = clean(search.get('progressReviewTo'));
            return from && to && parseLocalDate(from) && parseLocalDate(to) && from <= to
              ? { preset: 'custom' as const, from, to }
              : { preset: 'school-year' as const };
          })()
        : { preset: 'school-year' as const };
  return schoolYearId || queue || focus ? { schoolYearId, queue, focus, period } : undefined;
}

function appendParentReview(params: URLSearchParams, review?: TeachingReviewReturnState): void {
  if (!review) return;
  if (review.schoolYearId) params.set('progressReviewSchoolYear', review.schoolYearId);
  if (review.queue) params.set('progressReviewQueue', review.queue);
  if (review.focus) params.set('progressReviewFocus', review.focus);
  if (review.period && review.period.preset !== 'school-year') {
    params.set('progressReviewPeriod', review.period.preset);
    if (review.period.preset === 'custom' && review.period.from && review.period.to) {
      params.set('progressReviewFrom', review.period.from);
      params.set('progressReviewTo', review.period.to);
    }
  }
}

export function parseLearnerProgressReturnState(
  search: URLSearchParams,
): LearnerProgressReturnState | null {
  if (search.get('return') !== 'progress') return null;
  const mode = parseMode(search.get('progressView'));
  const selectedId = clean(search.get('progressSelected'));
  return {
    schoolYearId: clean(search.get('progressSchoolYear')),
    mode,
    selectedId,
    evidenceId: clean(search.get('progressEvidence')),
    status: parseStatus(search.get('progressStatus')),
    kind: parseKind(search.get('progressKind')),
    assessmentId: clean(search.get('progressAssessment')),
    standardFilterId: clean(search.get('progressStandardFilter')),
    sessionId: clean(search.get('progressSession')),
    order: search.get('progressOrder') === 'oldest' ? 'oldest' : undefined,
    period: parsePeriod(search),
    parentReview: parseParentReview(search),
  };
}

export function appendLearnerProgressReturnParams(
  params: URLSearchParams,
  state: LearnerProgressReturnState,
): URLSearchParams {
  params.set('return', 'progress');
  if (state.schoolYearId) params.set('progressSchoolYear', state.schoolYearId);
  if (state.mode) params.set('progressView', state.mode);
  if (state.selectedId) params.set('progressSelected', state.selectedId);
  if (state.evidenceId) params.set('progressEvidence', state.evidenceId);
  if (state.status) params.set('progressStatus', state.status);
  if (state.kind) params.set('progressKind', state.kind);
  if (state.assessmentId) params.set('progressAssessment', state.assessmentId);
  if (state.standardFilterId) params.set('progressStandardFilter', state.standardFilterId);
  if (state.sessionId) params.set('progressSession', state.sessionId);
  if (state.order === 'oldest') params.set('progressOrder', 'oldest');
  appendPeriod(params, state.period);
  appendParentReview(params, state.parentReview);
  return params;
}

export function buildLearnerProgressHref(state: LearnerProgressReturnState): string {
  const params = new URLSearchParams();
  if (state.schoolYearId) params.set('schoolYear', state.schoolYearId);
  if (state.mode && state.mode !== 'learners') params.set('view', state.mode);
  if (state.selectedId) {
    if (state.mode === 'contexts') params.set('context', state.selectedId);
    else if (state.mode === 'standards') params.set('standard', state.selectedId);
    else params.set('student', state.selectedId);
  }
  if (state.evidenceId) params.set('evidence', state.evidenceId);
  if (state.status && state.status !== 'active') params.set('status', state.status);
  if (state.kind && state.kind !== 'all') params.set('kind', state.kind);
  if (state.assessmentId) params.set('assessment', state.assessmentId);
  if (state.standardFilterId) params.set('standardFilter', state.standardFilterId);
  if (state.sessionId) params.set('session', state.sessionId);
  if (state.order === 'oldest') params.set('order', 'oldest');
  if (state.period && state.period.preset !== 'school-year') {
    params.set('period', state.period.preset);
    if (state.period.preset === 'custom' && state.period.from && state.period.to) {
      params.set('from', state.period.from);
      params.set('to', state.period.to);
    }
  }
  if (state.parentReview) appendTeachingReviewReturnParams(params, state.parentReview);
  const query = params.toString();
  return query ? `#/learner-progress?${query}` : '#/learner-progress';
}

export function buildLearnerProgressEntryHref(
  state: {
    schoolYearId?: string;
    mode?: LearnerProgressMode;
    selectedId?: string;
    assessmentId?: string;
    standardFilterId?: string;
    sessionId?: string;
  } = {},
): string {
  return buildLearnerProgressHref({
    schoolYearId: state.schoolYearId,
    mode: state.mode,
    selectedId: state.selectedId,
    assessmentId: state.assessmentId,
    standardFilterId: state.standardFilterId,
    sessionId: state.sessionId,
  });
}

export function decorateLearnerProgressSourceHref(
  href: string,
  state: LearnerProgressReturnState,
): string {
  if (!href.startsWith('#/')) return href;
  const [path, query = ''] = href.slice(1).split('?');
  const params = appendLearnerProgressReturnParams(new URLSearchParams(query), state);
  return `#${path}?${params.toString()}`;
}

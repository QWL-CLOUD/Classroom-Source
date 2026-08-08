import type {
  LearnerProgressKindFilter,
  LearnerProgressStatusFilter,
} from '@/features/learnerProgress/learnerProgressReadModel';
import {
  appendLearnerProgressPeriodParams,
  parseLearnerProgressPeriodState,
  type LearnerProgressPeriodState,
} from '@/features/learnerProgress/learnerProgressPeriod';

export interface LearnerEvidenceReportRouteState {
  schoolYearId?: string;
  studentId?: string;
  period: LearnerProgressPeriodState;
  status: LearnerProgressStatusFilter;
  kind: LearnerProgressKindFilter;
}

function clean(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

export function parseLearnerEvidenceReportRouteState(
  search: URLSearchParams,
): LearnerEvidenceReportRouteState {
  const rawStatus = search.get('status');
  const status: LearnerProgressStatusFilter =
    rawStatus === 'archived' || rawStatus === 'all' ? rawStatus : 'active';
  const rawKind = search.get('kind');
  const kind: LearnerProgressKindFilter =
    rawKind === 'score' || rawKind === 'proficiency' || rawKind === 'observation' ? rawKind : 'all';

  return {
    schoolYearId: clean(search.get('schoolYear')),
    studentId: clean(search.get('student')),
    period: parseLearnerProgressPeriodState(search),
    status,
    kind,
  };
}

export function buildLearnerEvidenceReportHref(
  state: Partial<LearnerEvidenceReportRouteState> = {},
): string {
  const params = new URLSearchParams();
  if (state.schoolYearId) params.set('schoolYear', state.schoolYearId);
  if (state.studentId) params.set('student', state.studentId);
  appendLearnerProgressPeriodParams(params, state.period);
  if (state.status && state.status !== 'active') params.set('status', state.status);
  if (state.kind && state.kind !== 'all') params.set('kind', state.kind);
  const query = params.toString();
  return query ? `#/reports?${query}` : '#/reports';
}

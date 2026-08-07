import type {
  LearnerProgressKindFilter,
  LearnerProgressMode,
  LearnerProgressStatusFilter,
} from './learnerProgressReadModel';

export interface LearnerProgressRouteState {
  mode: LearnerProgressMode;
  selectedId?: string;
  evidenceId?: string;
  status: LearnerProgressStatusFilter;
  kind: LearnerProgressKindFilter;
}

function clean(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

export function parseLearnerProgressRouteState(search: URLSearchParams): LearnerProgressRouteState {
  const rawMode = search.get('view');
  const mode: LearnerProgressMode =
    rawMode === 'contexts' || rawMode === 'standards' ? rawMode : 'learners';
  const rawStatus = search.get('status');
  const status: LearnerProgressStatusFilter =
    rawStatus === 'archived' || rawStatus === 'all' ? rawStatus : 'active';
  const rawKind = search.get('kind');
  const kind: LearnerProgressKindFilter =
    rawKind === 'score' || rawKind === 'proficiency' || rawKind === 'observation' ? rawKind : 'all';

  const selectedId =
    mode === 'learners'
      ? clean(search.get('student'))
      : mode === 'contexts'
        ? clean(search.get('context'))
        : clean(search.get('standard'));

  return {
    mode,
    selectedId,
    evidenceId: clean(search.get('evidence')),
    status,
    kind,
  };
}

export function appendLearnerProgressMode(
  params: URLSearchParams,
  mode: LearnerProgressMode,
  selectedId?: string,
): URLSearchParams {
  params.delete('student');
  params.delete('context');
  params.delete('standard');
  params.delete('evidence');

  if (mode === 'learners') params.delete('view');
  else params.set('view', mode);

  if (!selectedId) return params;
  if (mode === 'learners') params.set('student', selectedId);
  else if (mode === 'contexts') params.set('context', selectedId);
  else params.set('standard', selectedId);
  return params;
}

export function appendLearnerProgressFilters(
  params: URLSearchParams,
  status: LearnerProgressStatusFilter,
  kind: LearnerProgressKindFilter,
): URLSearchParams {
  if (status === 'active') params.delete('status');
  else params.set('status', status);

  if (kind === 'all') params.delete('kind');
  else params.set('kind', kind);
  return params;
}

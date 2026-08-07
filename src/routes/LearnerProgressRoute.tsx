import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { LearnerProgressDashboard } from '@/features/learnerProgress/LearnerProgressDashboard';
import {
  appendLearnerProgressPeriodParams,
  clampLearnerProgressPeriodToSchoolYear,
  parseLearnerProgressPeriodState,
  resolveLearnerProgressPeriod,
  type LearnerProgressPeriodState,
} from '@/features/learnerProgress/learnerProgressPeriod';
import {
  buildLearnerProgressView,
  type LearnerProgressKindFilter,
  type LearnerProgressMode,
  type LearnerProgressStatusFilter,
} from '@/features/learnerProgress/learnerProgressReadModel';
import {
  appendLearnerProgressFilters,
  appendLearnerProgressMode,
  parseLearnerProgressRouteState,
} from '@/features/learnerProgress/learnerProgressRouteState';
import { useLearnerProgress } from '@/features/learnerProgress/useLearnerProgress';

import styles from './InsightsRoute.module.css';

export function LearnerProgressRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSchoolYearId = searchParams.get('schoolYear') ?? undefined;
  const periodState = parseLearnerProgressPeriodState(searchParams);
  const routeState = parseLearnerProgressRouteState(searchParams);
  const state = useLearnerProgress(requestedSchoolYearId);
  const selectedSchoolYear = state.status === 'ready' ? state.data.selectedSchoolYear : null;
  const effectivePeriod = selectedSchoolYear
    ? clampLearnerProgressPeriodToSchoolYear(periodState, selectedSchoolYear)
    : periodState;

  useEffect(() => {
    if (!selectedSchoolYear) return;
    const next = new URLSearchParams(searchParams);
    appendLearnerProgressPeriodParams(next, effectivePeriod);
    if (next.toString() === searchParams.toString()) return;
    setSearchParams(next, { replace: true });
  }, [effectivePeriod, searchParams, selectedSchoolYear, setSearchParams]);

  useEffect(() => {
    if (!requestedSchoolYearId || state.status !== 'ready') return;
    const selectedSchoolYearId = state.data.selectedSchoolYear?.id;
    if (!selectedSchoolYearId || selectedSchoolYearId === requestedSchoolYearId) return;
    const requestedExists = state.data.schoolYears.some(
      (schoolYear) => schoolYear.id === requestedSchoolYearId,
    );
    if (requestedExists) return;

    const next = new URLSearchParams(searchParams);
    next.set('schoolYear', selectedSchoolYearId);
    next.delete('student');
    next.delete('context');
    next.delete('standard');
    next.delete('evidence');
    setSearchParams(next, { replace: true });
  }, [requestedSchoolYearId, searchParams, setSearchParams, state]);

  function update(next: URLSearchParams): void {
    setSearchParams(next);
  }

  function selectSchoolYear(schoolYearId: string): void {
    const next = new URLSearchParams(searchParams);
    next.set('schoolYear', schoolYearId);
    const target =
      state.status === 'ready'
        ? state.data.schoolYears.find((schoolYear) => schoolYear.id === schoolYearId)
        : undefined;
    appendLearnerProgressPeriodParams(
      next,
      target ? clampLearnerProgressPeriodToSchoolYear(effectivePeriod, target) : effectivePeriod,
    );
    appendLearnerProgressMode(next, routeState.mode);
    update(next);
  }

  function selectPeriod(period: LearnerProgressPeriodState): void {
    const next = new URLSearchParams(searchParams);
    appendLearnerProgressPeriodParams(next, period);
    next.delete('evidence');
    update(next);
  }

  function selectMode(mode: LearnerProgressMode): void {
    const next = new URLSearchParams(searchParams);
    appendLearnerProgressMode(next, mode);
    update(next);
  }

  function selectScope(id?: string): void {
    const next = new URLSearchParams(searchParams);
    appendLearnerProgressMode(next, routeState.mode, id);
    update(next);
  }

  function selectStatus(status: LearnerProgressStatusFilter): void {
    const next = new URLSearchParams(searchParams);
    appendLearnerProgressFilters(next, status, routeState.kind);
    next.delete('evidence');
    update(next);
  }

  function selectKind(kind: LearnerProgressKindFilter): void {
    const next = new URLSearchParams(searchParams);
    appendLearnerProgressFilters(next, routeState.status, kind);
    next.delete('evidence');
    update(next);
  }

  function selectEvidence(id?: string): void {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('evidence', id);
    else next.delete('evidence');
    update(next);
  }

  if (state.status === 'loading') {
    return (
      <section className={`card ${styles.state}`} role="status" aria-live="polite">
        <h1>Learner Progress</h1>
        <p>Loading source-traceable Assessment Evidence…</p>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section className={`card ${styles.state}`} role="alert">
        <h1>Learner Progress unavailable</h1>
        <p>{state.message}</p>
        <p>
          Classroom did not silently drop malformed Evidence records. Review System Health or the
          source data before trying again.
        </p>
        <div className={styles.actions}>
          <Link className="button" to="/system-health">
            Open System Health
          </Link>
          <Link className="button" to="/export">
            Open Export &amp; Backup
          </Link>
        </div>
      </section>
    );
  }

  if (!state.data.selectedSchoolYear || !state.data.snapshot) {
    return (
      <section className={`card ${styles.state}`} aria-labelledby="learner-progress-no-year">
        <p className="page-eyebrow">Reflect</p>
        <h1 id="learner-progress-no-year">Learner Progress needs a School Year</h1>
        <p>Create a School Year before Classroom can scope learner Evidence by date.</p>
        <div className={styles.actions}>
          <Link className="button button-primary" to="/settings#school-years">
            Manage School Years
          </Link>
        </div>
      </section>
    );
  }

  const resolvedPeriod = resolveLearnerProgressPeriod(
    effectivePeriod,
    state.data.selectedSchoolYear,
    state.data.asOfDate,
  );
  const view = buildLearnerProgressView(state.data.snapshot, {
    mode: routeState.mode,
    selectedId: routeState.selectedId,
    evidenceId: routeState.evidenceId,
    status: routeState.status,
    kind: routeState.kind,
    period: resolvedPeriod,
  });

  return (
    <LearnerProgressDashboard
      schoolYears={state.data.schoolYears}
      view={view}
      period={effectivePeriod}
      resolvedPeriod={resolvedPeriod}
      statusFilter={routeState.status}
      kindFilter={routeState.kind}
      onSchoolYearChange={selectSchoolYear}
      onPeriodChange={selectPeriod}
      onModeChange={selectMode}
      onScopeChange={selectScope}
      onStatusFilterChange={selectStatus}
      onKindFilterChange={selectKind}
      onEvidenceChange={selectEvidence}
    />
  );
}

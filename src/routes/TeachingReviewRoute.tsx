import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { TeachingReviewDashboard } from '@/features/teachingReview/TeachingReviewDashboard';
import { parseTeachingReviewQueue } from '@/features/teachingReview/teachingReviewNavigation';
import {
  appendTeachingReviewPeriodParams,
  clampTeachingReviewPeriodToSchoolYear,
  filterTeachingReviewViewByPeriod,
  parseTeachingReviewPeriodState,
  resolveTeachingReviewPeriod,
  type TeachingReviewPeriodState,
} from '@/features/teachingReview/teachingReviewPeriod';
import { buildTeachingReviewView } from '@/features/teachingReview/teachingReviewReadModel';
import { useTeachingInsights } from '@/features/insights/useTeachingInsights';

import styles from './InsightsRoute.module.css';

export function TeachingReviewRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSchoolYearId = searchParams.get('schoolYear') ?? undefined;
  const focusQueue = parseTeachingReviewQueue(searchParams.get('queue'));
  const focus = searchParams.get('focus')?.trim() || undefined;
  const periodState = parseTeachingReviewPeriodState(searchParams);
  const state = useTeachingInsights(requestedSchoolYearId);
  const selectedPeriodSchoolYear = state.status === 'ready' ? state.data.selectedSchoolYear : null;
  const effectivePeriodState = selectedPeriodSchoolYear
    ? clampTeachingReviewPeriodToSchoolYear(periodState, selectedPeriodSchoolYear)
    : periodState;

  useEffect(() => {
    if (!selectedPeriodSchoolYear) return;
    const next = new URLSearchParams(searchParams);
    appendTeachingReviewPeriodParams(next, effectivePeriodState);
    if (next.toString() === searchParams.toString()) return;
    setSearchParams(next, { replace: true });
  }, [effectivePeriodState, searchParams, selectedPeriodSchoolYear, setSearchParams]);

  useEffect(() => {
    if (!requestedSchoolYearId || state.status !== 'ready') return;
    const selectedSchoolYearId = state.data.selectedSchoolYear?.id;
    if (!selectedSchoolYearId || selectedSchoolYearId === requestedSchoolYearId) return;

    const requestedSchoolYearExists = state.data.schoolYears.some(
      (schoolYear) => schoolYear.id === requestedSchoolYearId,
    );
    if (requestedSchoolYearExists) return;

    const next = new URLSearchParams(searchParams);
    next.set('schoolYear', selectedSchoolYearId);
    setSearchParams(next, { replace: true });
  }, [requestedSchoolYearId, searchParams, setSearchParams, state]);

  function selectSchoolYear(schoolYearId: string): void {
    const next = new URLSearchParams(searchParams);
    next.set('schoolYear', schoolYearId);
    const targetSchoolYear =
      state.status === 'ready'
        ? state.data.schoolYears.find((schoolYear) => schoolYear.id === schoolYearId)
        : undefined;
    appendTeachingReviewPeriodParams(
      next,
      targetSchoolYear
        ? clampTeachingReviewPeriodToSchoolYear(effectivePeriodState, targetSchoolYear)
        : effectivePeriodState,
    );
    next.delete('focus');
    setSearchParams(next);
  }

  function selectPeriod(period: TeachingReviewPeriodState): void {
    const next = new URLSearchParams(searchParams);
    appendTeachingReviewPeriodParams(next, period);
    next.delete('focus');
    setSearchParams(next);
  }

  if (state.status === 'loading') {
    return (
      <section className={`card ${styles.state}`} role="status" aria-live="polite">
        <h1>Teaching Review</h1>
        <p>Loading source-linked review queues…</p>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section className={`card ${styles.state}`} role="alert">
        <h1>Teaching Review unavailable</h1>
        <p>{state.message}</p>
        <p>
          Classroom did not create partial review queues from malformed canonical records. Review
          System Health or the source data before trying again.
        </p>
        <div className={styles.actions}>
          <Link className="button" to="/system-health">
            Open System Health
          </Link>
          <Link className="button" to="/export">
            Open Backup &amp; Recovery
          </Link>
        </div>
      </section>
    );
  }

  if (!state.data.selectedSchoolYear || !state.data.view) {
    return (
      <section className={`card ${styles.state}`} aria-labelledby="review-no-year-heading">
        <p className="page-eyebrow">Reflect</p>
        <h1 id="review-no-year-heading">Teaching Review needs a School Year</h1>
        <p>Create a School Year before Classroom can build source-linked teaching review queues.</p>
        <div className={styles.actions}>
          <Link className="button button-primary" to="/settings#school-years">
            Manage School Years
          </Link>
        </div>
      </section>
    );
  }

  const fullView = buildTeachingReviewView(state.data.view);
  const resolvedPeriod = resolveTeachingReviewPeriod(effectivePeriodState, fullView.schoolYear);
  const filteredView = filterTeachingReviewViewByPeriod(
    fullView,
    state.data.sessionDatesById,
    resolvedPeriod,
  );

  return (
    <TeachingReviewDashboard
      schoolYears={state.data.schoolYears}
      view={filteredView}
      period={effectivePeriodState}
      resolvedPeriod={resolvedPeriod}
      onSchoolYearChange={selectSchoolYear}
      onPeriodChange={selectPeriod}
      focusQueue={focusQueue}
      focus={focus}
    />
  );
}

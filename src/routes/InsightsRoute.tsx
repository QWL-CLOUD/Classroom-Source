import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { TeachingInsightsDashboard } from '@/features/insights/TeachingInsightsDashboard';
import { useTeachingInsights } from '@/features/insights/useTeachingInsights';

import styles from './InsightsRoute.module.css';

export function InsightsRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSchoolYearId = searchParams.get('schoolYear') ?? undefined;
  const state = useTeachingInsights(requestedSchoolYearId);

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
    setSearchParams(next);
  }

  if (state.status === 'loading') {
    return (
      <section className={`card ${styles.state}`} role="status" aria-live="polite">
        <h1>Teaching Insights</h1>
        <p>Loading source-linked teaching records…</p>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section className={`card ${styles.state}`} role="alert">
        <h1>Teaching Insights unavailable</h1>
        <p>{state.message}</p>
        <p>
          Classroom did not drop malformed canonical records or calculate partial metrics. Review
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
      <section className={`card ${styles.state}`} aria-labelledby="insights-no-year-heading">
        <p className="page-eyebrow">Reflect</p>
        <h1 id="insights-no-year-heading">Teaching Insights needs a School Year</h1>
        <p>
          Create a School Year before Classroom can apply date boundaries or connect planning
          contexts to teaching records.
        </p>
        <div className={styles.actions}>
          <Link className="button button-primary" to="/settings#school-years">
            Manage School Years
          </Link>
        </div>
      </section>
    );
  }

  return (
    <TeachingInsightsDashboard
      schoolYears={state.data.schoolYears}
      view={state.data.view}
      onSchoolYearChange={selectSchoolYear}
    />
  );
}

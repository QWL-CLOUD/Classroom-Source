import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { buildLearnerProgressHref } from '@/features/learnerProgress/learnerProgressNavigation';
import {
  clampLearnerProgressPeriodToSchoolYear,
  resolveLearnerProgressPeriod,
  type LearnerProgressPeriodPreset,
} from '@/features/learnerProgress/learnerProgressPeriod';
import { buildLearnerProgressView } from '@/features/learnerProgress/learnerProgressReadModel';
import { useLearnerProgress } from '@/features/learnerProgress/useLearnerProgress';
import {
  buildLearnerEvidenceReport,
  learnerEvidenceReportSourceStatusLabel,
  type LearnerEvidenceReportSource,
} from '@/features/reports/learnerEvidenceReport';
import { downloadLearnerEvidenceReportCsv } from '@/features/reports/learnerEvidenceReportCsv';
import {
  parseLearnerEvidenceReportRouteState,
  type LearnerEvidenceReportRouteState,
} from '@/features/reports/reportsNavigation';
import { formatLongDate, formatShortDate, parseLocalDate } from '@/shared/dates/localDate';

import styles from './ReportsRoute.module.css';

const periodLabels: Record<LearnerProgressPeriodPreset, string> = {
  'school-year': 'School Year',
  'this-week': 'This Week',
  'last-week': 'Last Week',
  custom: 'Custom',
};

const kindLabels: Record<LearnerEvidenceReportRouteState['kind'], string> = {
  all: 'All Evidence kinds',
  score: 'Score',
  proficiency: 'Proficiency',
  observation: 'Observation',
};

const statusLabels: Record<LearnerEvidenceReportRouteState['status'], string> = {
  active: 'Active Evidence',
  archived: 'Archived Evidence',
  all: 'Active + Archived',
};

function sourceDisplay(source: LearnerEvidenceReportSource | undefined) {
  if (!source) return <span className={styles.muted}>Not linked</span>;
  const status = learnerEvidenceReportSourceStatusLabel(source.status);
  return (
    <span className={styles.sourceValue}>
      <span>{source.label}</span>
      {status ? <span className={styles.sourceStatus}>{status}</span> : null}
    </span>
  );
}

export function ReportsRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const routeState = parseLearnerEvidenceReportRouteState(searchParams);
  const state = useLearnerProgress(routeState.schoolYearId);
  const selectedSchoolYear = state.status === 'ready' ? state.data.selectedSchoolYear : null;
  const effectivePeriod = selectedSchoolYear
    ? clampLearnerProgressPeriodToSchoolYear(routeState.period, selectedSchoolYear)
    : routeState.period;
  const [customFrom, setCustomFrom] = useState(
    routeState.period.preset === 'custom' ? (routeState.period.from ?? '') : '',
  );
  const [customTo, setCustomTo] = useState(
    routeState.period.preset === 'custom' ? (routeState.period.to ?? '') : '',
  );

  const effectiveCustomFrom =
    effectivePeriod.preset === 'custom'
      ? (effectivePeriod.from ?? selectedSchoolYear?.startsOn)
      : undefined;
  const effectiveCustomTo =
    effectivePeriod.preset === 'custom'
      ? (effectivePeriod.to ?? selectedSchoolYear?.endsOn)
      : undefined;

  useEffect(() => {
    if (!effectiveCustomFrom || !effectiveCustomTo) return;
    setCustomFrom(effectiveCustomFrom);
    setCustomTo(effectiveCustomTo);
  }, [effectiveCustomFrom, effectiveCustomTo]);

  useEffect(() => {
    if (!routeState.schoolYearId || state.status !== 'ready') return;
    const selectedSchoolYearId = state.data.selectedSchoolYear?.id;
    if (!selectedSchoolYearId || selectedSchoolYearId === routeState.schoolYearId) return;
    if (state.data.schoolYears.some((schoolYear) => schoolYear.id === routeState.schoolYearId)) {
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.set('schoolYear', selectedSchoolYearId);
    next.delete('student');
    setSearchParams(next, { replace: true });
  }, [routeState.schoolYearId, searchParams, setSearchParams, state]);

  useEffect(() => {
    if (!selectedSchoolYear || routeState.period.preset !== 'custom') return;
    if (
      effectivePeriod.preset === routeState.period.preset &&
      effectivePeriod.from === routeState.period.from &&
      effectivePeriod.to === routeState.period.to
    ) {
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.set('period', 'custom');
    if (effectivePeriod.from) next.set('from', effectivePeriod.from);
    if (effectivePeriod.to) next.set('to', effectivePeriod.to);
    setSearchParams(next, { replace: true });
  }, [effectivePeriod, routeState.period, searchParams, selectedSchoolYear, setSearchParams]);

  function updateSearch(mutator: (params: URLSearchParams) => void): void {
    const next = new URLSearchParams(searchParams);
    mutator(next);
    setSearchParams(next);
  }

  function selectSchoolYear(schoolYearId: string): void {
    updateSearch((next) => {
      next.set('schoolYear', schoolYearId);
      next.delete('student');
      next.delete('period');
      next.delete('from');
      next.delete('to');
    });
  }

  function selectLearner(studentId: string): void {
    updateSearch((next) => {
      if (studentId) next.set('student', studentId);
      else next.delete('student');
    });
  }

  function selectPeriod(preset: LearnerProgressPeriodPreset): void {
    if (!selectedSchoolYear) return;
    updateSearch((next) => {
      next.delete('from');
      next.delete('to');
      if (preset === 'school-year') {
        next.delete('period');
        return;
      }
      next.set('period', preset);
      if (preset === 'custom') {
        const resolved = resolveLearnerProgressPeriod(
          effectivePeriod,
          selectedSchoolYear,
          state.status === 'ready' ? state.data.asOfDate : selectedSchoolYear.startsOn,
        );
        const from = resolved.startsOn ?? selectedSchoolYear.startsOn;
        const to = resolved.endsOn ?? selectedSchoolYear.endsOn;
        next.set('from', from);
        next.set('to', to);
        setCustomFrom(from);
        setCustomTo(to);
      }
    });
  }

  function applyCustomRange(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!parseLocalDate(customFrom) || !parseLocalDate(customTo) || customFrom > customTo) return;
    updateSearch((next) => {
      next.set('period', 'custom');
      next.set('from', customFrom);
      next.set('to', customTo);
    });
  }

  function selectStatus(status: LearnerEvidenceReportRouteState['status']): void {
    updateSearch((next) => {
      if (status === 'active') next.delete('status');
      else next.set('status', status);
    });
  }

  function selectKind(kind: LearnerEvidenceReportRouteState['kind']): void {
    updateSearch((next) => {
      if (kind === 'all') next.delete('kind');
      else next.set('kind', kind);
    });
  }

  if (state.status === 'loading') {
    return (
      <section className={`card ${styles.state}`} role="status" aria-live="polite">
        <h1>Reports</h1>
        <p>Loading source-traceable learner Evidence…</p>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section className={`card ${styles.state}`} role="alert">
        <h1>Reports unavailable</h1>
        <p>{state.message}</p>
        <p>Classroom did not silently omit malformed Evidence records from this report.</p>
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

  if (!state.data.selectedSchoolYear || !state.data.snapshot) {
    return (
      <section className={`card ${styles.state}`} aria-labelledby="reports-no-year">
        <p className="page-eyebrow">Reflect</p>
        <h1 id="reports-no-year">Reports need a School Year</h1>
        <p>Create a School Year before Classroom can produce a learner Evidence summary.</p>
        <Link className="button button-primary" to="/settings#school-years">
          Manage School Years
        </Link>
      </section>
    );
  }

  const resolvedPeriod = resolveLearnerProgressPeriod(
    effectivePeriod,
    state.data.selectedSchoolYear,
    state.data.asOfDate,
  );
  const view = buildLearnerProgressView(state.data.snapshot, {
    mode: 'learners',
    selectedId: routeState.studentId,
    status: routeState.status,
    kind: routeState.kind,
    order: 'newest',
    period: resolvedPeriod,
  });
  const report = buildLearnerEvidenceReport({
    view,
    period: resolvedPeriod,
    status: routeState.status,
    kind: routeState.kind,
  });
  const customRangeInvalid =
    !parseLocalDate(customFrom) || !parseLocalDate(customTo) || customFrom > customTo;
  const learnerProgressHref = routeState.studentId
    ? buildLearnerProgressHref({
        schoolYearId: view.schoolYear.id,
        mode: 'learners',
        selectedId: routeState.studentId,
        status: routeState.status,
        kind: routeState.kind,
        period: effectivePeriod,
      })
    : '#/learner-progress';

  return (
    <section className={styles.page} aria-labelledby="reports-heading">
      <header className={`page-header ${styles.pageHeader} ${styles.screenOnly}`}>
        <div>
          <p className="page-eyebrow">Reflect</p>
          <h1 className="page-title" id="reports-heading">
            Reports
          </h1>
          <p className="page-subtitle">
            Produce a teacher-internal summary from recorded Evidence without converting it into
            grades, mastery, rankings, readiness, or an inferred progress score.
          </p>
        </div>
        <div className={styles.headerActions}>
          {report ? (
            <>
              <button
                className="button button-primary"
                type="button"
                onClick={() => downloadLearnerEvidenceReportCsv(report)}
              >
                Download CSV
              </button>
              <button className="button" type="button" onClick={() => window.print()}>
                Print report
              </button>
            </>
          ) : null}
          <a className="button" href={learnerProgressHref}>
            Open Learner Progress
          </a>
        </div>
      </header>

      <aside
        className={`card ${styles.contract} ${styles.screenOnly}`}
        aria-labelledby="report-contract"
      >
        <div>
          <p className={styles.kicker}>Report contract v1</p>
          <h2 id="report-contract">Teacher Internal · recorded Evidence only</h2>
        </div>
        <p>
          This report is a presentation of the existing Learner Progress read model. Evidence kinds
          remain distinct, historical source snapshots remain visible, and zero records never imply
          failure or an Evidence gap.
        </p>
      </aside>

      <section
        className={`card ${styles.controls} ${styles.screenOnly}`}
        aria-labelledby="report-filters"
      >
        <div>
          <p className={styles.kicker}>Report scope</p>
          <h2 id="report-filters">Choose the learner and recorded Evidence to include</h2>
        </div>
        <div className={styles.filterGrid}>
          <label>
            <span>School Year</span>
            <select
              className="select"
              value={view.schoolYear.id}
              onChange={(event) => selectSchoolYear(event.currentTarget.value)}
            >
              {state.data.schoolYears.map((schoolYear) => (
                <option key={schoolYear.id} value={schoolYear.id}>
                  {schoolYear.label}
                  {schoolYear.lifecycleState === 'archived' ? ' — Archived' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Learner</span>
            <select
              className="select"
              value={routeState.studentId ?? ''}
              onChange={(event) => selectLearner(event.currentTarget.value)}
            >
              <option value="">Choose a learner</option>
              {view.scopeRows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label}
                  {row.sourceStatus === 'archived' ? ' — Archived' : ''}
                  {row.sourceStatus === 'unavailable' ? ' — Source unavailable' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Period</span>
            <select
              className="select"
              value={effectivePeriod.preset}
              onChange={(event) =>
                selectPeriod(event.currentTarget.value as LearnerProgressPeriodPreset)
              }
            >
              {Object.entries(periodLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Evidence status</span>
            <select
              className="select"
              value={routeState.status}
              onChange={(event) =>
                selectStatus(event.currentTarget.value as LearnerEvidenceReportRouteState['status'])
              }
            >
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Evidence kind</span>
            <select
              className="select"
              value={routeState.kind}
              onChange={(event) =>
                selectKind(event.currentTarget.value as LearnerEvidenceReportRouteState['kind'])
              }
            >
              {Object.entries(kindLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {effectivePeriod.preset === 'custom' ? (
          <form className={styles.customRange} onSubmit={applyCustomRange}>
            <label>
              <span>From</span>
              <input
                className="input"
                type="date"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.currentTarget.value)}
              />
            </label>
            <label>
              <span>To</span>
              <input
                className="input"
                type="date"
                value={customTo}
                onChange={(event) => setCustomTo(event.currentTarget.value)}
              />
            </label>
            <button className="button" type="submit" disabled={customRangeInvalid}>
              Apply range
            </button>
          </form>
        ) : null}
      </section>

      {report ? (
        <article
          className={`card ${styles.report}`}
          aria-labelledby="learner-evidence-report-title"
        >
          <header className={styles.reportHeader}>
            <div>
              <p className={styles.kicker}>Teacher Internal · Learner Evidence Summary</p>
              <h2 id="learner-evidence-report-title">
                {report.learnerLabel} · Learner Evidence Summary
              </h2>
              <p>
                {report.schoolYearLabel} · {report.period.label}
                {learnerEvidenceReportSourceStatusLabel(report.learnerStatus)
                  ? ` · ${learnerEvidenceReportSourceStatusLabel(report.learnerStatus)}`
                  : ''}
              </p>
            </div>
            <dl className={styles.reportMeta}>
              <div>
                <dt>Evidence status</dt>
                <dd>{statusLabels[report.filters.status]}</dd>
              </div>
              <div>
                <dt>Evidence kind</dt>
                <dd>{kindLabels[report.filters.kind]}</dd>
              </div>
              <div>
                <dt>Data as of</dt>
                <dd>{formatLongDate(report.asOfDate)}</dd>
              </div>
            </dl>
          </header>

          <section className={styles.summary} aria-label="Recorded Evidence counts">
            <div>
              <strong>{report.summary.evidenceCount}</strong>
              <span>Recorded Evidence</span>
            </div>
            <div>
              <strong>{report.summary.scoreCount}</strong>
              <span>Score</span>
            </div>
            <div>
              <strong>{report.summary.proficiencyCount}</strong>
              <span>Proficiency</span>
            </div>
            <div>
              <strong>{report.summary.observationCount}</strong>
              <span>Observation</span>
            </div>
          </section>

          <p className={styles.disclosure} role="note">
            Counts mean recorded Evidence only. Classroom does not infer mastery, grades, readiness,
            growth, learner rank, or missing Evidence from this report.
          </p>

          {report.rows.length === 0 ? (
            <section className={styles.emptyReport}>
              <h3>No recorded Evidence in this report scope</h3>
              <p>
                This is an empty record set, not a judgment about the learner or an inferred
                Evidence gap.
              </p>
            </section>
          ) : (
            <ol className={styles.records} aria-label="Learner Evidence records">
              {report.rows.map((row) => (
                <li key={row.id} className={styles.record}>
                  <header className={styles.recordHeader}>
                    <div>
                      <span className={styles.recordDate}>{formatShortDate(row.occurredOn)}</span>
                      <h3>{row.title}</h3>
                    </div>
                    <div className={styles.recordValue}>
                      <span>{kindLabels[row.kind]}</span>
                      {row.status === 'archived' ? <span>Archived</span> : null}
                      <strong>{row.valueLabel}</strong>
                    </div>
                  </header>
                  {row.observationText ? (
                    <section className={styles.narrative}>
                      <h4>Observation</h4>
                      <p>{row.observationText}</p>
                    </section>
                  ) : null}
                  {row.notes ? (
                    <section className={styles.narrative}>
                      <h4>Notes</h4>
                      <p>{row.notes}</p>
                    </section>
                  ) : null}
                  <dl className={styles.sources}>
                    <div>
                      <dt>Context</dt>
                      <dd>{sourceDisplay(row.context)}</dd>
                    </div>
                    <div>
                      <dt>Assessment</dt>
                      <dd>{sourceDisplay(row.assessment)}</dd>
                    </div>
                    <div>
                      <dt>Session</dt>
                      <dd>{sourceDisplay(row.session)}</dd>
                    </div>
                    <div className={styles.standardSources}>
                      <dt>Standards</dt>
                      <dd>
                        {row.standards.length === 0 ? (
                          <span className={styles.muted}>None linked</span>
                        ) : (
                          <ul>
                            {row.standards.map((standard, index) => (
                              <li key={`${row.id}-standard-${index}`}>{sourceDisplay(standard)}</li>
                            ))}
                          </ul>
                        )}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ol>
          )}
        </article>
      ) : (
        <section className={`card ${styles.chooseLearner}`} aria-labelledby="choose-report-learner">
          <p className={styles.kicker}>Learner Evidence Summary</p>
          <h2 id="choose-report-learner">Choose one learner to preview the report</h2>
          <p>
            Reports are intentionally learner-specific in this foundation. Classroom does not rank
            learners or create class-average comparisons.
          </p>
        </section>
      )}
    </section>
  );
}

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';

import type { SchoolYear } from '@/domain/models/entities';
import { formatLongDate, formatShortDate, parseLocalDate } from '@/shared/dates/localDate';

import type {
  LearnerProgressEvidenceItem,
  LearnerProgressKindFilter,
  LearnerProgressMode,
  LearnerProgressSource,
  LearnerProgressStatusFilter,
  LearnerProgressView,
} from './learnerProgressReadModel';
import type {
  LearnerProgressPeriodPreset,
  LearnerProgressPeriodState,
  LearnerProgressResolvedPeriod,
} from './learnerProgressPeriod';
import styles from './LearnerProgressDashboard.module.css';

interface LearnerProgressDashboardProps {
  schoolYears: readonly SchoolYear[];
  view: LearnerProgressView;
  period: LearnerProgressPeriodState;
  resolvedPeriod: LearnerProgressResolvedPeriod;
  statusFilter: LearnerProgressStatusFilter;
  kindFilter: LearnerProgressKindFilter;
  onSchoolYearChange: (schoolYearId: string) => void;
  onPeriodChange: (period: LearnerProgressPeriodState) => void;
  onModeChange: (mode: LearnerProgressMode) => void;
  onScopeChange: (id?: string) => void;
  onStatusFilterChange: (status: LearnerProgressStatusFilter) => void;
  onKindFilterChange: (kind: LearnerProgressKindFilter) => void;
  onEvidenceChange: (id?: string) => void;
}

const modeLabels: Record<LearnerProgressMode, string> = {
  learners: 'Learners',
  contexts: 'Contexts',
  standards: 'Standards',
};

const periodLabels: Record<LearnerProgressPeriodPreset, string> = {
  'school-year': 'School Year',
  'this-week': 'This Week',
  'last-week': 'Last Week',
  custom: 'Custom',
};

const kindLabels: Record<LearnerProgressKindFilter, string> = {
  all: 'All Evidence kinds',
  score: 'Score',
  proficiency: 'Proficiency',
  observation: 'Observation',
};

function sourceStatusLabel(source: LearnerProgressSource): string | null {
  if (source.status === 'archived') return 'Archived';
  if (source.status === 'snapshot') return 'Historical snapshot';
  if (source.status === 'unavailable') return 'Unavailable';
  return null;
}

function SourceValue({ source }: { source: LearnerProgressSource }) {
  const status = sourceStatusLabel(source);
  return (
    <span className={styles.sourceValue}>
      {source.href ? <a href={source.href}>{source.label}</a> : <span>{source.label}</span>}
      {status ? <span className={styles.sourceStatus}>{status}</span> : null}
    </span>
  );
}

function EvidenceCard({
  item,
  selected,
  onSelect,
}: {
  item: LearnerProgressEvidenceItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className={`${styles.evidenceCard} ${selected ? styles.evidenceCardSelected : ''}`}
        aria-current={selected ? 'true' : undefined}
        onClick={onSelect}
      >
        <span className={styles.evidenceCardHeader}>
          <span>
            <strong>{item.title}</strong>
            <small>{formatShortDate(item.occurredOn)}</small>
          </span>
          <span className={styles.evidenceBadges}>
            <span>{kindLabels[item.kind]}</span>
            {item.status === 'archived' ? <span>Archived</span> : null}
          </span>
        </span>
        <span className={styles.evidenceValue}>{item.valueLabel}</span>
        <span className={styles.evidenceLearner}>{item.student.label}</span>
      </button>
    </li>
  );
}

function EvidenceDetail({
  item,
  onClose,
}: {
  item: LearnerProgressEvidenceItem;
  onClose: () => void;
}) {
  return (
    <article
      className={`card ${styles.detail}`}
      aria-labelledby={`evidence-detail-${item.id}`}
      id={`learner-progress-evidence-${item.id}`}
      tabIndex={-1}
    >
      <header className={styles.detailHeader}>
        <div>
          <p className={styles.kicker}>Exact Evidence record</p>
          <h2 id={`evidence-detail-${item.id}`}>{item.title}</h2>
          <p>
            {formatLongDate(item.occurredOn)} · {kindLabels[item.kind]}
            {item.status === 'archived' ? ' · Archived' : ''}
          </p>
        </div>
        <div className={styles.detailActions}>
          <strong>{item.valueLabel}</strong>
          <button type="button" className="button" onClick={onClose}>
            Close detail
          </button>
        </div>
      </header>

      {item.observationText ? (
        <section className={styles.observation} aria-label="Teacher observation">
          <h3>Observation</h3>
          <p>{item.observationText}</p>
        </section>
      ) : null}

      {item.notes ? (
        <section className={styles.observation} aria-label="Evidence notes">
          <h3>Notes</h3>
          <p>{item.notes}</p>
        </section>
      ) : null}

      <dl className={styles.sourceGrid}>
        <div>
          <dt>Learner</dt>
          <dd>
            <SourceValue source={item.student} />
          </dd>
        </div>
        <div>
          <dt>Context</dt>
          <dd>{item.context ? <SourceValue source={item.context} /> : 'Not linked'}</dd>
        </div>
        <div>
          <dt>Lesson Plan</dt>
          <dd>{item.lessonPlan ? <SourceValue source={item.lessonPlan} /> : 'Not linked'}</dd>
        </div>
        <div>
          <dt>Session</dt>
          <dd>{item.session ? <SourceValue source={item.session} /> : 'Not linked'}</dd>
        </div>
        <div>
          <dt>Assessment</dt>
          <dd>{item.assessment ? <SourceValue source={item.assessment} /> : 'Not linked'}</dd>
        </div>
      </dl>

      <section className={styles.standards} aria-labelledby={`evidence-standards-${item.id}`}>
        <h3 id={`evidence-standards-${item.id}`}>Standards</h3>
        {item.standards.length === 0 ? (
          <p>No Standards are linked to this Evidence record.</p>
        ) : (
          <ul>
            {item.standards.map((standard, index) => (
              <li key={`${standard.entityId ?? 'missing'}-${index}`}>
                <SourceValue source={standard} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

export function LearnerProgressDashboard({
  schoolYears,
  view,
  period,
  resolvedPeriod,
  statusFilter,
  kindFilter,
  onSchoolYearChange,
  onPeriodChange,
  onModeChange,
  onScopeChange,
  onStatusFilterChange,
  onKindFilterChange,
  onEvidenceChange,
}: LearnerProgressDashboardProps) {
  const [customFrom, setCustomFrom] = useState(
    period.preset === 'custom'
      ? (period.from ?? view.schoolYear.startsOn)
      : (resolvedPeriod.startsOn ?? view.schoolYear.startsOn),
  );
  const [customTo, setCustomTo] = useState(
    period.preset === 'custom'
      ? (period.to ?? view.schoolYear.endsOn)
      : (resolvedPeriod.endsOn ?? view.schoolYear.endsOn),
  );

  useEffect(() => {
    if (!view.selectedEvidence) return;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(
        `learner-progress-evidence-${view.selectedEvidence?.id}`,
      );
      target?.focus({ preventScroll: true });
      target?.scrollIntoView?.({ block: 'nearest' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [view.selectedEvidence]);

  useEffect(() => {
    if (period.preset === 'custom') {
      setCustomFrom(period.from ?? view.schoolYear.startsOn);
      setCustomTo(period.to ?? view.schoolYear.endsOn);
      return;
    }
    setCustomFrom(resolvedPeriod.startsOn ?? view.schoolYear.startsOn);
    setCustomTo(resolvedPeriod.endsOn ?? view.schoolYear.endsOn);
  }, [
    period,
    resolvedPeriod.endsOn,
    resolvedPeriod.startsOn,
    view.schoolYear.endsOn,
    view.schoolYear.startsOn,
  ]);

  function handlePeriodPresetChange(event: ChangeEvent<HTMLSelectElement>): void {
    const preset = event.currentTarget.value as LearnerProgressPeriodPreset;
    if (preset === 'custom') {
      onPeriodChange({
        preset,
        from: resolvedPeriod.startsOn ?? view.schoolYear.startsOn,
        to: resolvedPeriod.endsOn ?? view.schoolYear.endsOn,
      });
      return;
    }
    onPeriodChange({ preset });
  }

  function applyCustomPeriod(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!parseLocalDate(customFrom) || !parseLocalDate(customTo) || customFrom > customTo) return;
    onPeriodChange({ preset: 'custom', from: customFrom, to: customTo });
  }

  const customRangeInvalid =
    !parseLocalDate(customFrom) || !parseLocalDate(customTo) || customFrom > customTo;

  return (
    <section className={styles.page} aria-labelledby="learner-progress-heading">
      <header className={`page-header ${styles.pageHeader}`}>
        <div>
          <p className="page-eyebrow">Reflect</p>
          <h1 className="page-title" id="learner-progress-heading">
            Learner Progress
          </h1>
          <p className="page-subtitle">
            Review recorded learner Evidence over time without converting Evidence into grades,
            mastery, rankings, or hidden ability scores.
          </p>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.schoolYearControl}>
            <label htmlFor="learner-progress-school-year">School Year</label>
            <select
              id="learner-progress-school-year"
              className="select"
              value={view.schoolYear.id}
              onChange={(event) => onSchoolYearChange(event.currentTarget.value)}
            >
              {schoolYears.map((schoolYear) => (
                <option key={schoolYear.id} value={schoolYear.id}>
                  {schoolYear.label}
                  {schoolYear.lifecycleState === 'archived' ? ' — Archived' : ''}
                </option>
              ))}
            </select>
            <small>As of {formatLongDate(view.asOfDate)}</small>
          </div>
          <div className={styles.headerLinks}>
            <a
              className="button"
              href={`#/insights?schoolYear=${encodeURIComponent(view.schoolYear.id)}`}
            >
              Teaching Insights
            </a>
            <a
              className="button"
              href={`#/teaching-review?schoolYear=${encodeURIComponent(view.schoolYear.id)}`}
            >
              Teaching Review
            </a>
          </div>
        </div>
      </header>

      <aside className={`card ${styles.contractNote}`} aria-labelledby="learner-progress-contract">
        <div>
          <p className={styles.kicker}>Learner Progress contract v{view.contractVersion}</p>
          <h2 id="learner-progress-contract">Recorded Evidence, not a mastery judgment</h2>
        </div>
        <p>
          Score, Proficiency, and Observation records stay structurally distinct. Counts mean
          recorded Evidence only. No Evidence in this scope does not mean failure, and Classroom
          does not infer grades, mastery, readiness, growth scores, or learner rank.
        </p>
        <dl>
          <div>
            <dt>School Year</dt>
            <dd>
              {formatShortDate(view.schoolYear.startsOn)}–{formatShortDate(view.schoolYear.endsOn)}
            </dd>
          </div>
          <div>
            <dt>Review period</dt>
            <dd>{resolvedPeriod.label}</dd>
          </div>
          <div>
            <dt>Scope</dt>
            <dd>{view.scopeLabel}</dd>
          </div>
        </dl>
      </aside>

      <section className={`card ${styles.controls}`} aria-labelledby="learner-progress-window">
        <div className={styles.controlIntro}>
          <p className={styles.kicker}>Evidence window</p>
          <h2 id="learner-progress-window">Choose the review scope</h2>
          <p>
            Time and kind filters change which recorded Evidence appears. Context mode uses the
            Evidence record's explicit Context link; it does not reconstruct historical membership
            from today's roster.
          </p>
          {!resolvedPeriod.overlapsSchoolYear ? (
            <p className={styles.warning} role="status">
              This period does not overlap the selected School Year.
            </p>
          ) : null}
        </div>
        <div className={styles.filterGrid}>
          <label>
            Period
            <select className="select" value={period.preset} onChange={handlePeriodPresetChange}>
              {Object.entries(periodLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Lifecycle
            <select
              className="select"
              value={statusFilter}
              onChange={(event) =>
                onStatusFilterChange(event.currentTarget.value as LearnerProgressStatusFilter)
              }
            >
              <option value="active">Active Evidence</option>
              <option value="archived">Archived Evidence</option>
              <option value="all">All Evidence</option>
            </select>
          </label>
          <label>
            Evidence kind
            <select
              className="select"
              value={kindFilter}
              onChange={(event) =>
                onKindFilterChange(event.currentTarget.value as LearnerProgressKindFilter)
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
        {period.preset === 'custom' ? (
          <form className={styles.customRange} onSubmit={applyCustomPeriod}>
            <label>
              From
              <input
                className="input"
                type="date"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.currentTarget.value)}
              />
            </label>
            <label>
              To
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

      <nav className={styles.modeTabs} aria-label="Learner Progress views">
        {(Object.keys(modeLabels) as LearnerProgressMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            className={view.mode === mode ? styles.modeActive : undefined}
            aria-current={view.mode === mode ? 'page' : undefined}
            onClick={() => onModeChange(mode)}
          >
            {modeLabels[mode]}
          </button>
        ))}
      </nav>

      <section className={styles.workspace}>
        <aside
          className={`card ${styles.scopePanel}`}
          aria-labelledby="learner-progress-scope-list"
        >
          <header>
            <p className={styles.kicker}>{modeLabels[view.mode]} view</p>
            <h2 id="learner-progress-scope-list">Select a source scope</h2>
          </header>
          <ul>
            <li>
              <button
                type="button"
                className={!view.selectedId ? styles.scopeActive : undefined}
                aria-current={!view.selectedId ? 'true' : undefined}
                onClick={() => onScopeChange(undefined)}
              >
                <span>
                  {view.mode === 'learners'
                    ? 'All learners'
                    : view.mode === 'contexts'
                      ? 'All contexts'
                      : 'All Standards'}
                </span>
                <strong>{view.scopeEvidenceCount}</strong>
              </button>
            </li>
            {view.scopeRows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className={view.selectedId === row.id ? styles.scopeActive : undefined}
                  aria-current={view.selectedId === row.id ? 'true' : undefined}
                  onClick={() => onScopeChange(row.id)}
                >
                  <span>
                    <strong>{row.label}</strong>
                    <small>{row.meta}</small>
                  </span>
                  <strong>{row.evidenceCount}</strong>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className={styles.timelineColumn}>
          <section className={`card ${styles.summary}`} aria-labelledby="learner-progress-summary">
            <header>
              <p className={styles.kicker}>Recorded Evidence</p>
              <h2 id="learner-progress-summary">{view.scopeLabel}</h2>
              <p>
                These are record counts for the selected scope and filters. They are not grades or
                mastery calculations.
              </p>
            </header>
            <div className={styles.metricGrid}>
              <article>
                <span>Evidence</span>
                <strong>{view.summary.evidenceCount}</strong>
              </article>
              <article>
                <span>Learners represented</span>
                <strong>{view.summary.learnerCount}</strong>
              </article>
              <article>
                <span>Scores</span>
                <strong>{view.summary.scoreCount}</strong>
              </article>
              <article>
                <span>Proficiency / Observation</span>
                <strong>
                  {view.summary.proficiencyCount} / {view.summary.observationCount}
                </strong>
              </article>
            </div>
          </section>

          <section
            className={`card ${styles.timeline}`}
            aria-labelledby="learner-progress-timeline"
          >
            <header>
              <h2 id="learner-progress-timeline">Evidence timeline</h2>
              <p>Newest recorded Evidence appears first.</p>
            </header>
            {view.evidence.length === 0 ? (
              <div className={styles.emptyState} role="status">
                <strong>No recorded Evidence in this scope.</strong>
                <span>
                  Change the learner/source, period, lifecycle, or Evidence kind to review another
                  scope.
                </span>
              </div>
            ) : (
              <ul className={styles.evidenceList}>
                {view.evidence.map((item) => (
                  <EvidenceCard
                    key={item.id}
                    item={item}
                    selected={view.selectedEvidence?.id === item.id}
                    onSelect={() => onEvidenceChange(item.id)}
                  />
                ))}
              </ul>
            )}
          </section>

          {view.selectedEvidence ? (
            <EvidenceDetail
              item={view.selectedEvidence}
              onClose={() => onEvidenceChange(undefined)}
            />
          ) : null}
        </div>
      </section>
    </section>
  );
}

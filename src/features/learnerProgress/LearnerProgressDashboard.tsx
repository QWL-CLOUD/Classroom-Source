import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';

import type { SchoolYear } from '@/domain/models/entities';
import { formatLongDate, formatShortDate, parseLocalDate } from '@/shared/dates/localDate';

import type {
  LearnerProgressEvidenceItem,
  LearnerProgressKindFilter,
  LearnerProgressMode,
  LearnerProgressOrder,
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
  assessmentFilterId?: string;
  standardFilterId?: string;
  sessionFilterId?: string;
  orderFilter: LearnerProgressOrder;
  onSchoolYearChange: (schoolYearId: string) => void;
  onPeriodChange: (period: LearnerProgressPeriodState) => void;
  onModeChange: (mode: LearnerProgressMode) => void;
  onScopeChange: (id?: string) => void;
  onStatusFilterChange: (status: LearnerProgressStatusFilter) => void;
  onKindFilterChange: (kind: LearnerProgressKindFilter) => void;
  onAssessmentFilterChange: (id?: string) => void;
  onStandardFilterChange: (id?: string) => void;
  onSessionFilterChange: (id?: string) => void;
  onOrderFilterChange: (order: LearnerProgressOrder) => void;
  onClearSourceFilters: () => void;
  onEvidenceChange: (id?: string) => void;
  onCreateEvidence?: () => void;
  onEditEvidence?: (id: string) => void;
  onArchiveEvidence?: (id: string) => void;
  onRestoreEvidence?: (id: string) => void;
  decorateSourceHref?: (href: string) => string;
  feedbackPanel?: ReactNode;
  editorPanel?: ReactNode;
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

function SourceValue({
  source,
  decorateHref,
}: {
  source: LearnerProgressSource;
  decorateHref?: (href: string) => string;
}) {
  const status = sourceStatusLabel(source);
  return (
    <span className={styles.sourceValue}>
      {source.href ? (
        <a href={decorateHref ? decorateHref(source.href) : source.href}>{source.label}</a>
      ) : (
        <span>{source.label}</span>
      )}
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
  onEdit,
  onArchive,
  onRestore,
  decorateSourceHref,
  proficiencyHistory,
}: {
  item: LearnerProgressEvidenceItem;
  onClose: () => void;
  onEdit?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  decorateSourceHref?: (href: string) => string;
  proficiencyHistory?: LearnerProgressView['proficiencyHistory'];
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
          <div className={styles.detailButtons}>
            {onEdit ? (
              <button type="button" className="button" onClick={onEdit}>
                Edit Evidence
              </button>
            ) : null}
            {item.status === 'active' && onArchive ? (
              <button type="button" className="button" onClick={onArchive}>
                Archive Evidence
              </button>
            ) : null}
            {item.status === 'archived' && onRestore ? (
              <button type="button" className="button" onClick={onRestore}>
                Restore Evidence
              </button>
            ) : null}
            <button type="button" className="button" onClick={onClose}>
              Close detail
            </button>
          </div>
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
            <SourceValue source={item.student} decorateHref={decorateSourceHref} />
          </dd>
        </div>
        <div>
          <dt>Context</dt>
          <dd>
            {item.context ? (
              <SourceValue source={item.context} decorateHref={decorateSourceHref} />
            ) : (
              'Not linked'
            )}
          </dd>
        </div>
        <div>
          <dt>Lesson Plan</dt>
          <dd>
            {item.lessonPlan ? (
              <SourceValue source={item.lessonPlan} decorateHref={decorateSourceHref} />
            ) : (
              'Not linked'
            )}
          </dd>
        </div>
        <div>
          <dt>Session</dt>
          <dd>
            {item.session ? (
              <SourceValue source={item.session} decorateHref={decorateSourceHref} />
            ) : (
              'Not linked'
            )}
          </dd>
        </div>
        <div>
          <dt>Assessment</dt>
          <dd>
            {item.assessment ? (
              <SourceValue source={item.assessment} decorateHref={decorateSourceHref} />
            ) : (
              'Not linked'
            )}
          </dd>
        </div>
      </dl>

      {proficiencyHistory ? (
        <section
          className={styles.proficiencyHistory}
          aria-labelledby={`evidence-proficiency-history-${item.id}`}
        >
          <div>
            <h3 id={`evidence-proficiency-history-${item.id}`}>Same-scale proficiency history</h3>
            <p>
              {proficiencyHistory.scaleLabel ?? proficiencyHistory.scaleKey} · recorded labels from
              the selected School Year, including archived records. Classroom does not convert these
              records into mastery or growth.
            </p>
          </div>
          <ol>
            {proficiencyHistory.entries.map((entry) => (
              <li key={entry.id}>
                <span>
                  <strong>{entry.label}</strong>
                  <small>{formatShortDate(entry.occurredOn)}</small>
                </span>
                <span>
                  {entry.title}
                  {entry.status === 'archived' ? ' · Archived' : ''}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className={styles.standards} aria-labelledby={`evidence-standards-${item.id}`}>
        <h3 id={`evidence-standards-${item.id}`}>Standards</h3>
        {item.standards.length === 0 ? (
          <p>No Standards are linked to this Evidence record.</p>
        ) : (
          <ul>
            {item.standards.map((standard, index) => (
              <li key={`${standard.entityId ?? 'missing'}-${index}`}>
                <SourceValue source={standard} decorateHref={decorateSourceHref} />
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
  assessmentFilterId,
  standardFilterId,
  sessionFilterId,
  orderFilter,
  onSchoolYearChange,
  onPeriodChange,
  onModeChange,
  onScopeChange,
  onStatusFilterChange,
  onKindFilterChange,
  onAssessmentFilterChange,
  onStandardFilterChange,
  onSessionFilterChange,
  onOrderFilterChange,
  onClearSourceFilters,
  onEvidenceChange,
  onCreateEvidence,
  onEditEvidence,
  onArchiveEvidence,
  onRestoreEvidence,
  decorateSourceHref,
  feedbackPanel,
  editorPanel,
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

  const editorOpen = Boolean(editorPanel);

  useEffect(() => {
    if (!editorOpen) return;
    const frame = window.requestAnimationFrame(() => {
      const editor = document.getElementById('assessment-evidence-editor');
      editor?.focus({ preventScroll: true });
      editor?.scrollIntoView?.({ block: 'nearest' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editorOpen]);

  useEffect(() => {
    if (!view.selectedEvidence || editorOpen) return;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(
        `learner-progress-evidence-${view.selectedEvidence?.id}`,
      );
      target?.focus({ preventScroll: true });
      target?.scrollIntoView?.({ block: 'nearest' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editorOpen, view.selectedEvidence]);

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
  const sourceFiltersActive = Boolean(assessmentFilterId || standardFilterId || sessionFilterId);

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
            {onCreateEvidence ? (
              <button className="button button-primary" type="button" onClick={onCreateEvidence}>
                Add Evidence
              </button>
            ) : null}
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
        <div className={styles.contractCopy}>
          <p>
            Score, Proficiency, and Observation records stay structurally distinct. Counts mean
            recorded Evidence only. No Evidence in this scope does not mean failure, and Classroom
            does not infer grades, mastery, readiness, growth scores, or learner rank.
          </p>
          {view.schoolYearState === 'historical' ? (
            <p className={styles.historicalNote} role="note">
              Historical School Year selected. Recorded Evidence remains reviewable, but current
              retained roster coverage is unavailable because Classroom does not reconstruct past
              membership.
            </p>
          ) : view.schoolYearState === 'future' ? (
            <p className={styles.historicalNote} role="note">
              Future School Year selected. Recorded Evidence may be empty until teaching records are
              added.
            </p>
          ) : null}
        </div>
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
            <select
              aria-label="Period"
              className="select"
              value={period.preset}
              onChange={handlePeriodPresetChange}
            >
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
              aria-label="Lifecycle"
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
              aria-label="Evidence kind"
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
          <label>
            Library Assessment
            <select
              aria-label="Library Assessment"
              className="select"
              value={assessmentFilterId ?? ''}
              onChange={(event) => onAssessmentFilterChange(event.currentTarget.value || undefined)}
            >
              <option value="">All Assessments</option>
              {view.assessmentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                  {option.sourceStatus === 'archived'
                    ? ' · Archived'
                    : option.sourceStatus === 'snapshot'
                      ? ' · Historical'
                      : option.sourceStatus === 'unavailable'
                        ? ' · Unavailable'
                        : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Linked Standard
            <select
              aria-label="Linked Standard"
              className="select"
              value={standardFilterId ?? ''}
              onChange={(event) => onStandardFilterChange(event.currentTarget.value || undefined)}
            >
              <option value="">All linked Standards</option>
              {view.standardOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                  {option.sourceStatus === 'archived'
                    ? ' · Archived'
                    : option.sourceStatus === 'snapshot'
                      ? ' · Historical'
                      : option.sourceStatus === 'unavailable'
                        ? ' · Unavailable'
                        : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Session source
            <select
              aria-label="Session source"
              className="select"
              value={sessionFilterId ?? ''}
              onChange={(event) => onSessionFilterChange(event.currentTarget.value || undefined)}
            >
              <option value="">All Sessions</option>
              {view.sessionOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                  {option.sourceStatus === 'snapshot'
                    ? ' · Historical'
                    : option.sourceStatus === 'unavailable'
                      ? ' · Unavailable'
                      : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Timeline order
            <select
              aria-label="Timeline order"
              className="select"
              value={orderFilter}
              onChange={(event) =>
                onOrderFilterChange(event.currentTarget.value as LearnerProgressOrder)
              }
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
          <button
            className="button button-quiet"
            type="button"
            disabled={!sourceFiltersActive}
            onClick={onClearSourceFilters}
          >
            Clear source filters
          </button>
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

          {view.rosterCoverage ? (
            <section
              className={`card ${styles.coverage}`}
              aria-labelledby="learner-progress-roster-coverage"
            >
              <header>
                <p className={styles.kicker}>Current retained roster coverage</p>
                <h2 id="learner-progress-roster-coverage">{view.rosterCoverage.label}</h2>
              </header>
              {view.rosterCoverage.status === 'available' ? (
                <dl>
                  <div>
                    <dt>Current retained roster learners</dt>
                    <dd>{view.rosterCoverage.currentRetainedRosterLearnerCount}</dd>
                  </div>
                  <div>
                    <dt>Roster learners represented by Evidence</dt>
                    <dd>{view.rosterCoverage.coveredRosterLearnerCount}</dd>
                  </div>
                  <div>
                    <dt>Class / Group contexts</dt>
                    <dd>{view.rosterCoverage.contextCount}</dd>
                  </div>
                </dl>
              ) : (
                <p className={styles.coverageUnavailable}>
                  {view.rosterCoverage.status === 'not-applicable'
                    ? 'Roster coverage is not applicable to this context.'
                    : 'Roster coverage is unavailable for this historical or archived scope.'}
                </p>
              )}
              <p>{view.rosterCoverage.note}</p>
            </section>
          ) : null}

          {feedbackPanel}

          <div
            className={`${styles.evidenceWorkspace} ${
              editorPanel || view.selectedEvidence ? styles.evidenceWorkspaceWithInspector : ''
            }`}
          >
            <section
              className={`card ${styles.timeline}`}
              aria-labelledby="learner-progress-timeline"
            >
              <header>
                <h2 id="learner-progress-timeline">Evidence timeline</h2>
                <p>
                  {orderFilter === 'oldest'
                    ? 'Oldest recorded Evidence appears first.'
                    : 'Newest recorded Evidence appears first.'}
                </p>
              </header>
              {view.evidence.length === 0 ? (
                <div className={styles.emptyState} role="status">
                  <strong>No recorded Evidence in this scope.</strong>
                  <span>
                    Change the learner/source, period, lifecycle, Evidence kind, or source filters
                    to review another scope.
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

            {editorPanel ? (
              <div className={`${styles.inspectorSlot} ${styles.editorSlot}`}>{editorPanel}</div>
            ) : view.selectedEvidence ? (
              <div className={styles.inspectorSlot}>
                <EvidenceDetail
                  item={view.selectedEvidence}
                  onClose={() => onEvidenceChange(undefined)}
                  onEdit={
                    view.selectedEvidence.status === 'active' && onEditEvidence
                      ? () => onEditEvidence(view.selectedEvidence!.id)
                      : undefined
                  }
                  onArchive={
                    onArchiveEvidence
                      ? () => onArchiveEvidence(view.selectedEvidence!.id)
                      : undefined
                  }
                  onRestore={
                    onRestoreEvidence
                      ? () => onRestoreEvidence(view.selectedEvidence!.id)
                      : undefined
                  }
                  decorateSourceHref={decorateSourceHref}
                  proficiencyHistory={view.proficiencyHistory}
                />
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </section>
  );
}

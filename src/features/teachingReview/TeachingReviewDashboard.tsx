import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';

import type { SchoolYear } from '@/domain/models/entities';
import type { TeachingInsightsSourceTrace } from '@/features/insights/teachingInsightsContract';
import { formatLongDate, formatShortDate, parseLocalDate } from '@/shared/dates/localDate';

import {
  buildTeachingReviewSourceHref,
  buildTeachingReviewTasksHref,
  reviewFocusElementId,
  reviewFocusKey,
  type TeachingReviewQueue,
} from './teachingReviewNavigation';
import type { TeachingReviewView } from './teachingReviewReadModel';
import type {
  TeachingReviewPeriodPreset,
  TeachingReviewPeriodState,
  TeachingReviewResolvedPeriod,
} from './teachingReviewPeriod';
import styles from './TeachingReviewDashboard.module.css';

interface TeachingReviewDashboardProps {
  schoolYears: readonly SchoolYear[];
  view: TeachingReviewView;
  period: TeachingReviewPeriodState;
  resolvedPeriod: TeachingReviewResolvedPeriod;
  onSchoolYearChange: (schoolYearId: string) => void;
  onPeriodChange: (period: TeachingReviewPeriodState) => void;
  focusQueue?: TeachingReviewQueue;
  focus?: string;
}

const sessionStateLabels = {
  completed: 'Completed',
  reopened: 'Reopened',
  cancelled: 'Cancelled',
  unavailable: 'Source unavailable',
} as const;

const periodLabels: Record<TeachingReviewPeriodPreset, string> = {
  'school-year': 'School Year',
  'this-week': 'This Week',
  'last-week': 'Last Week',
  custom: 'Custom',
};

function numberLabel(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function SourceLink({
  source,
  href,
  children,
}: {
  source: TeachingInsightsSourceTrace;
  href?: string;
  children?: ReactNode;
}) {
  const label = children ?? source.label;
  const resolvedHref = href ?? source.href;
  if (!resolvedHref) return <span>{label}</span>;
  return <a href={resolvedHref}>{label}</a>;
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail: ReactNode;
}) {
  return (
    <article className={styles.metricCard}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

export function TeachingReviewDashboard({
  schoolYears,
  view,
  period,
  resolvedPeriod,
  onSchoolYearChange,
  onPeriodChange,
  focusQueue,
  focus,
}: TeachingReviewDashboardProps) {
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

  useEffect(() => {
    if (!focus && !focusQueue) return;
    const frame = window.requestAnimationFrame(() => {
      const focusedRecord =
        focus && focusQueue
          ? document.getElementById(reviewFocusElementId(focusQueue, focus))
          : null;
      const queueSection = focusQueue
        ? document.getElementById(`teaching-review-queue-${focusQueue}`)
        : null;
      const target = focusedRecord ?? queueSection;
      if (!target) return;
      target.focus({ preventScroll: true });
      target.scrollIntoView?.({ block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focus, focusQueue, view.schoolYear.id]);
  function handleSchoolYearChange(event: ChangeEvent<HTMLSelectElement>): void {
    onSchoolYearChange(event.currentTarget.value);
  }

  function handlePeriodPresetChange(event: ChangeEvent<HTMLSelectElement>): void {
    const preset = event.currentTarget.value as TeachingReviewPeriodPreset;
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

  function reviewReturnState(queue: TeachingReviewQueue, focusValue: string) {
    return {
      schoolYearId: view.schoolYear.id,
      queue,
      focus: focusValue,
      period,
    };
  }

  return (
    <section className={styles.page} aria-labelledby="teaching-review-heading">
      <header className={`page-header ${styles.pageHeader}`}>
        <div>
          <p className="page-eyebrow">Reflect</p>
          <h1 className="page-title" id="teaching-review-heading">
            Teaching Review
          </h1>
          <p className="page-subtitle">
            Work through source-linked teaching follow-up without turning review prompts into
            scores, rankings, or hidden workflow state.
          </p>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.schoolYearControl}>
            <label htmlFor="teaching-review-school-year">School Year</label>
            <select
              id="teaching-review-school-year"
              className="select"
              value={view.schoolYear.id}
              onChange={handleSchoolYearChange}
            >
              {schoolYears.map((schoolYear) => (
                <option key={schoolYear.id} value={schoolYear.id}>
                  {schoolYear.label}
                  {schoolYear.lifecycleState === 'archived' ? ' — Archived' : ''}
                </option>
              ))}
            </select>
            <small>As of {formatLongDate(view.schoolYear.asOfDate)}</small>
          </div>
          <a
            className="button"
            href={`#/insights?schoolYear=${encodeURIComponent(view.schoolYear.id)}`}
          >
            Back to Teaching Insights
          </a>
        </div>
      </header>

      <aside className={`card ${styles.contractNote}`} aria-labelledby="review-contract-heading">
        <div>
          <p className={styles.kicker}>Review contract v{view.contractVersion}</p>
          <h2 id="review-contract-heading">Review prompts, not judgments</h2>
        </div>
        <p>
          These queues are derived from Teaching Insights facts. Opening a source may lead to a
          writable workflow, but this page does not save reviewed state, create Tasks, edit teaching
          records, or infer whether instruction was effective.
        </p>
        <dl>
          <div>
            <dt>School Year</dt>
            <dd>
              {formatShortDate(view.schoolYear.startsOn)}–{formatShortDate(view.schoolYear.endsOn)}
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{view.schoolYear.status}</dd>
          </div>
          <div>
            <dt>Review period</dt>
            <dd>{resolvedPeriod.label}</dd>
          </div>
          <div>
            <dt>Record Issues</dt>
            <dd>School Year-wide</dd>
          </div>
        </dl>
      </aside>

      <section className={`card ${styles.periodSection}`} aria-labelledby="review-period-heading">
        <div>
          <p className={styles.kicker}>Review period</p>
          <h2 id="review-period-heading">Choose the teaching window</h2>
          <p>
            Awaiting Reflection, Past still Scheduled, and Open Next Steps follow the selected
            teaching period. Record Issues remain School Year-wide because many integrity records do
            not have a meaningful occurrence date.
          </p>
          {!resolvedPeriod.overlapsSchoolYear ? (
            <p className={styles.periodWarning} role="status">
              This period does not overlap the selected School Year. Date-based review queues are
              empty until you choose another period.
            </p>
          ) : null}
        </div>
        <div className={styles.periodControls}>
          <label htmlFor="teaching-review-period">Period</label>
          <select
            id="teaching-review-period"
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
          <small>{resolvedPeriod.label}</small>
          {period.preset === 'custom' ? (
            <form className={styles.customPeriodForm} onSubmit={applyCustomPeriod}>
              <label>
                From
                <input
                  className="input"
                  type="date"
                  min={view.schoolYear.startsOn}
                  max={view.schoolYear.endsOn}
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.currentTarget.value)}
                />
              </label>
              <label>
                To
                <input
                  className="input"
                  type="date"
                  min={view.schoolYear.startsOn}
                  max={view.schoolYear.endsOn}
                  value={customTo}
                  onChange={(event) => setCustomTo(event.currentTarget.value)}
                />
              </label>
              <button className="button" type="submit" disabled={customRangeInvalid}>
                Apply range
              </button>
              {customRangeInvalid ? (
                <small role="alert">Choose a valid From date on or before the To date.</small>
              ) : null}
            </form>
          ) : null}
        </div>
      </section>

      <section
        className={`card ${styles.summarySection}`}
        aria-labelledby="review-overview-heading"
      >
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.kicker}>Review overview</p>
            <h2 id="review-overview-heading">What may need teacher attention</h2>
          </div>
          <p>
            Counts describe retained records only. A queue item is not a quality concern, learner
            concern, or required action unless the teacher decides it is.
          </p>
        </div>
        <div className={styles.metricGrid}>
          <MetricCard
            label="Awaiting Reflection"
            value={numberLabel(view.awaitingReflection.count)}
            detail="Completed Sessions in this period without an active Reflection"
          />
          <MetricCard
            label="Past still Scheduled"
            value={numberLabel(view.pastStillScheduled.count)}
            detail="Past Sessions in this period still marked Scheduled"
          />
          <MetricCard
            label="Open Next Steps"
            value={numberLabel(view.openNextSteps.taskCount)}
            detail={`Across ${numberLabel(view.openNextSteps.reflectionCount)} Reflection${
              view.openNextSteps.reflectionCount === 1 ? '' : 's'
            }`}
          />
          <MetricCard
            label="Record Issues"
            value={numberLabel(view.recordIssues.issueCount)}
            detail={`${numberLabel(view.recordIssues.affectedRecordCount)} affected source record${
              view.recordIssues.affectedRecordCount === 1 ? '' : 's'
            } · School Year-wide`}
          />
        </div>
      </section>

      <section
        id="teaching-review-queue-awaiting-reflection"
        className={`card ${styles.queueSection}`}
        aria-labelledby="awaiting-reflection-heading"
        tabIndex={-1}
      >
        <div className={styles.queueHeading}>
          <div>
            <p className={styles.kicker}>Teaching follow-up</p>
            <h2 id="awaiting-reflection-heading">Awaiting Reflection</h2>
          </div>
          <p>
            Completed Sessions without an active Teaching Reflection. An archived Reflection stays
            the one retained Reflection for its Session and should be reviewed or restored rather
            than duplicated.
          </p>
        </div>
        {view.awaitingReflection.rows.length === 0 ? (
          <p className={styles.clearState}>Every completed Session has an active Reflection.</p>
        ) : (
          <ul className={styles.queueList}>
            {view.awaitingReflection.rows.map((row) => (
              <li
                key={row.sessionOccurrenceId}
                id={reviewFocusElementId(
                  'awaiting-reflection',
                  reviewFocusKey('session', row.sessionOccurrenceId),
                )}
                className={styles.queueItem}
                tabIndex={-1}
              >
                <div className={styles.itemBody}>
                  <div className={styles.itemTitleRow}>
                    <strong>{row.title}</strong>
                    {row.reflectionState === 'archived' ? (
                      <span className="status-badge">Archived Reflection</span>
                    ) : null}
                  </div>
                  <span>
                    {formatLongDate(row.date)} · {row.contextName}
                  </span>
                </div>
                <div className={styles.itemActions}>
                  <SourceLink
                    source={row.sessionSource}
                    href={buildTeachingReviewSourceHref(
                      row.sessionSource,
                      reviewReturnState(
                        'awaiting-reflection',
                        reviewFocusKey('session', row.sessionOccurrenceId),
                      ),
                    )}
                  >
                    Open Session
                  </SourceLink>
                  <a
                    className="button"
                    href={buildTeachingReviewSourceHref(
                      {
                        entityType: 'teaching-reflection',
                        entityId: row.sessionOccurrenceId,
                        label: row.title,
                        href: row.reflectionHref,
                      },
                      reviewReturnState(
                        'awaiting-reflection',
                        reviewFocusKey('session', row.sessionOccurrenceId),
                      ),
                    )}
                  >
                    {row.reflectionState === 'archived' ? 'Review Reflection' : 'Add Reflection'}
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        id="teaching-review-queue-past-still-scheduled"
        className={`card ${styles.queueSection}`}
        aria-labelledby="past-scheduled-heading"
        tabIndex={-1}
      >
        <div className={styles.queueHeading}>
          <div>
            <p className={styles.kicker}>Session state</p>
            <h2 id="past-scheduled-heading">Past still Scheduled</h2>
          </div>
          <p>
            These records are already surfaced by the Teaching Insights integrity rules. Review the
            Session source to decide whether it should be completed, rescheduled, cancelled, or
            otherwise corrected.
          </p>
        </div>
        {view.pastStillScheduled.rows.length === 0 ? (
          <p className={styles.clearState}>No past Sessions remain marked Scheduled.</p>
        ) : (
          <ul className={styles.queueList}>
            {view.pastStillScheduled.rows.map((row) => (
              <li
                key={row.sessionOccurrenceId}
                id={reviewFocusElementId(
                  'past-still-scheduled',
                  reviewFocusKey('session', row.sessionOccurrenceId),
                )}
                className={styles.queueItem}
                tabIndex={-1}
              >
                <div className={styles.itemBody}>
                  <strong>{row.title}</strong>
                  <span>{row.message}</span>
                </div>
                <div className={styles.itemActions}>
                  <SourceLink
                    source={row.source}
                    href={buildTeachingReviewSourceHref(
                      row.source,
                      reviewReturnState(
                        'past-still-scheduled',
                        reviewFocusKey('session', row.sessionOccurrenceId),
                      ),
                    )}
                  >
                    Open Session
                  </SourceLink>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        id="teaching-review-queue-open-next-steps"
        className={`card ${styles.queueSection}`}
        aria-labelledby="open-next-steps-heading"
        tabIndex={-1}
      >
        <div className={styles.queueHeading}>
          <div>
            <p className={styles.kicker}>Teacher actions</p>
            <h2 id="open-next-steps-heading">Open Next Steps</h2>
          </div>
          <p>
            Open Task counts are grouped by their Teaching Reflection source. Task lifecycle and
            editing remain in the existing Task workflow.
          </p>
        </div>
        {view.openNextSteps.rows.length === 0 ? (
          <p className={styles.clearState}>No open Reflection-linked Next Steps are retained.</p>
        ) : (
          <ul className={styles.queueList}>
            {view.openNextSteps.rows.map((row) => (
              <li
                key={row.reflectionId}
                id={reviewFocusElementId(
                  'open-next-steps',
                  reviewFocusKey('teaching-reflection', row.reflectionId),
                )}
                className={styles.queueItem}
                tabIndex={-1}
              >
                <div className={styles.itemBody}>
                  <div className={styles.itemTitleRow}>
                    <strong>{row.lessonPlanTitle}</strong>
                    {row.reflectionStatus === 'archived' ? (
                      <span className="status-badge">Archived Reflection</span>
                    ) : null}
                  </div>
                  <span>
                    {formatLongDate(row.occurredOn)} · {row.contextName} ·{' '}
                    {sessionStateLabels[row.sessionState]}
                  </span>
                  <span>
                    {numberLabel(row.openNextStepCount)} open Next Step
                    {row.openNextStepCount === 1 ? '' : 's'}
                  </span>
                </div>
                <div className={styles.itemActions}>
                  <SourceLink
                    source={row.source}
                    href={buildTeachingReviewSourceHref(
                      row.source,
                      reviewReturnState(
                        'open-next-steps',
                        reviewFocusKey('teaching-reflection', row.reflectionId),
                      ),
                    )}
                  >
                    Open Reflection
                  </SourceLink>
                  <a
                    className="button"
                    href={buildTeachingReviewTasksHref(
                      row.reflectionId,
                      reviewReturnState(
                        'open-next-steps',
                        reviewFocusKey('teaching-reflection', row.reflectionId),
                      ),
                    )}
                  >
                    Open Tasks
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        id="teaching-review-queue-record-issues"
        className={`card ${styles.queueSection}`}
        aria-labelledby="record-issues-heading"
        tabIndex={-1}
      >
        <div className={styles.queueHeading}>
          <div>
            <p className={styles.kicker}>Data and workflow</p>
            <h2 id="record-issues-heading">Record Issues</h2>
          </div>
          <p>
            Integrity issues other than Past still Scheduled remain separate from teacher Reflection
            and Next Step queues. They describe retained source inconsistencies, not teaching
            quality.
          </p>
        </div>
        {view.recordIssues.issues.length === 0 ? (
          <p className={styles.clearState}>No additional record-integrity issues were found.</p>
        ) : (
          <div
            className={styles.tableScroller}
            role="region"
            tabIndex={0}
            aria-label="Teaching Review record issues"
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col">Rule</th>
                  <th scope="col">What the record says</th>
                </tr>
              </thead>
              <tbody>
                {view.recordIssues.issues.map((issue, index) => (
                  <tr
                    key={`${issue.code}:${issue.entityType}:${issue.entityId}:${index}`}
                    id={reviewFocusElementId(
                      'record-issues',
                      reviewFocusKey(issue.entityType, issue.entityId),
                    )}
                    tabIndex={-1}
                  >
                    <th scope="row">
                      <SourceLink
                        source={issue.source}
                        href={buildTeachingReviewSourceHref(
                          issue.source,
                          reviewReturnState(
                            'record-issues',
                            reviewFocusKey(issue.entityType, issue.entityId),
                          ),
                        )}
                      >
                        {issue.source.label}
                      </SourceLink>
                    </th>
                    <td>
                      <code>{issue.code}</code>
                    </td>
                    <td>{issue.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

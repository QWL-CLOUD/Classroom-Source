import type { ChangeEvent, ReactNode } from 'react';

import type { SchoolYear } from '@/domain/models/entities';
import { formatLongDate, formatShortDate } from '@/shared/dates/localDate';

import type {
  TeachingInsightsContextKind,
  TeachingInsightsRatio,
  TeachingInsightsSourceTrace,
} from './teachingInsightsContract';
import type { TeachingInsightsView } from './teachingInsightsReadModel';
import styles from './TeachingInsightsDashboard.module.css';

interface TeachingInsightsDashboardProps {
  schoolYears: readonly SchoolYear[];
  view: TeachingInsightsView;
  onSchoolYearChange: (schoolYearId: string) => void;
}

const contextKindLabels: Record<TeachingInsightsContextKind, string> = {
  class: 'Class',
  group: 'Group',
  individual: 'Individual',
};

const evidenceKindLabels = {
  score: 'Score',
  proficiency: 'Proficiency',
  observation: 'Observation',
} as const;

const reflectionSessionStateLabels = {
  completed: 'Completed',
  reopened: 'Reopened',
  cancelled: 'Cancelled',
  unavailable: 'Source unavailable',
} as const;

const categoryFamilyLabels = {
  'focus-tag': 'Focus tags',
  'purpose-tag': 'Purpose tags',
  'theme-tag': 'Theme tags',
} as const;

function numberLabel(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function percentageLabel(ratio: TeachingInsightsRatio): string {
  return ratio.status === 'available' ? `${Math.round(ratio.value * 100)}%` : 'Not available';
}

function ratioExplanation(ratio: TeachingInsightsRatio): string {
  if (ratio.status === 'available') {
    return `${numberLabel(ratio.numerator)} of ${numberLabel(ratio.denominator)}`;
  }
  if (ratio.reason === 'future-school-year') return 'The selected School Year has not started.';
  if (ratio.reason === 'no-retained-roster-links') {
    return 'No retained roster or linked Individual learner records.';
  }
  return 'No eligible closed-period records.';
}

function scopeLabel(scope: 'plan-root' | 'lesson-flow-step', stepTitle?: string): string {
  if (scope === 'plan-root') return 'Plan';
  return stepTitle ? `Step: ${stepTitle}` : 'Lesson Flow step';
}

function SourceLink({
  source,
  children,
}: {
  source: TeachingInsightsSourceTrace;
  children?: ReactNode;
}) {
  const label = children ?? source.label;
  if (!source.href) return <span>{label}</span>;
  return <a href={source.href}>{label}</a>;
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

function SectionHeader({
  eyebrow,
  title,
  description,
  headingId,
}: {
  eyebrow: string;
  title: string;
  description: string;
  headingId: string;
}) {
  return (
    <header className={styles.sectionHeader}>
      <div>
        <p>{eyebrow}</p>
        <h2 id={headingId}>{title}</h2>
      </div>
      <span>{description}</span>
    </header>
  );
}

export function TeachingInsightsDashboard({
  schoolYears,
  view,
  onSchoolYearChange,
}: TeachingInsightsDashboardProps) {
  const activity = view.teachingActivity;
  const planned = view.plannedVersusTaught;
  const evidence = view.assessmentEvidence;
  const standards = view.standardsUsage;
  const content = view.contentUsage;
  const reflection = view.reflectionAndNextSteps;
  const review = view.needsReview;

  function handleSchoolYearChange(event: ChangeEvent<HTMLSelectElement>): void {
    onSchoolYearChange(event.currentTarget.value);
  }

  return (
    <section className={styles.page} aria-labelledby="teaching-insights-heading">
      <header className={`page-header ${styles.pageHeader}`}>
        <div>
          <p className="page-eyebrow">Reflect</p>
          <h1 className="page-title" id="teaching-insights-heading">
            Teaching Insights
          </h1>
          <p className="page-subtitle">
            Source-linked, descriptive teaching records. Classroom reports what is retained in the
            current database without scoring learners or judging teaching quality.
          </p>
        </div>
        <div className={styles.schoolYearControl}>
          <label htmlFor="teaching-insights-school-year">School Year</label>
          <select
            id="teaching-insights-school-year"
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
      </header>

      <aside className={`card ${styles.contractNote}`} aria-labelledby="insights-contract-heading">
        <div>
          <p className={styles.kicker}>Data contract v{view.contractVersion}</p>
          <h2 id="insights-contract-heading">Read-only and descriptive</h2>
        </div>
        <p>
          Facts come from retained canonical records. Percentages are derived metrics. Reasons,
          instructional quality, mastery, effectiveness, and learner ranking remain teacher
          interpretation or unsupported inference and are not generated here.
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
            <dt>Closed through</dt>
            <dd>
              {view.schoolYear.closedThrough
                ? formatLongDate(view.schoolYear.closedThrough)
                : 'No closed period yet'}
            </dd>
          </div>
        </dl>
      </aside>

      <section className={`card ${styles.section}`} aria-labelledby="teaching-activity-heading">
        <SectionHeader
          eyebrow="Teaching activity"
          title="Completed teaching records"
          description="A completed Session is the teaching fact. Schedule Blocks and Calendar Events are not counted as taught."
          headingId="teaching-activity-heading"
        />
        <div className={styles.metricGrid}>
          <MetricCard
            label="Completed Sessions"
            value={numberLabel(activity.completedSessionCount)}
            detail="Distinct retained Session records"
          />
          <MetricCard
            label="Completed Teaching Minutes"
            value={numberLabel(activity.completedTeachingMinutes)}
            detail="Session end time minus start time"
          />
          <MetricCard
            label="Teaching Days"
            value={numberLabel(activity.teachingDayCount)}
            detail="Distinct completed Session dates"
          />
        </div>

        <details className={styles.disclosure}>
          <summary>Completed Session sources ({numberLabel(activity.sessions.length)})</summary>
          {activity.sessions.length === 0 ? (
            <p className={styles.emptyText}>
              No completed Sessions are retained for this School Year.
            </p>
          ) : (
            <div
              className={styles.tableScroller}
              role="region"
              tabIndex={0}
              aria-label="Completed Session source records"
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">Session</th>
                    <th scope="col">Date</th>
                    <th scope="col">Context</th>
                    <th scope="col">Type</th>
                    <th scope="col">Minutes</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.sessions.map((session) => (
                    <tr key={session.id}>
                      <th scope="row">
                        <SourceLink source={session.source}>{session.title}</SourceLink>
                      </th>
                      <td>{formatLongDate(session.date)}</td>
                      <td>
                        {session.contextName}
                        {session.contextArchived ? (
                          <span className="status-badge">Archived</span>
                        ) : null}
                      </td>
                      <td>{contextKindLabels[session.contextKind]}</td>
                      <td>{numberLabel(session.minutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>
      </section>

      <section className={`card ${styles.section}`} aria-labelledby="planned-taught-heading">
        <SectionHeader
          eyebrow="Planned versus taught"
          title="Session-based completion"
          description="Only dated Sessions in the closed period enter the denominator. Cancelled Sessions are reported separately."
          headingId="planned-taught-heading"
        />
        <div className={styles.ratioPanel}>
          <div>
            <span>Planned-to-taught completion</span>
            <strong>{percentageLabel(planned.completion)}</strong>
            <small>{ratioExplanation(planned.completion)}</small>
          </div>
          <dl>
            <div>
              <dt>Past planned</dt>
              <dd>{numberLabel(planned.pastPlannedSessionCount)}</dd>
            </div>
            <div>
              <dt>Taught</dt>
              <dd>{numberLabel(planned.taughtSessionCount)}</dd>
            </div>
            <div>
              <dt>Past still Scheduled</dt>
              <dd>{numberLabel(planned.unresolvedPastSessionCount)}</dd>
            </div>
            <div>
              <dt>Future Scheduled</dt>
              <dd>{numberLabel(planned.futureScheduledSessionCount)}</dd>
            </div>
            <div>
              <dt>Cancelled</dt>
              <dd>{numberLabel(planned.cancelledSessionCount)}</dd>
            </div>
            <div>
              <dt>Ready and unscheduled Plans</dt>
              <dd>{numberLabel(planned.readyUnscheduledPlanCount)}</dd>
            </div>
          </dl>
        </div>
        <p className={styles.interpretationNote}>
          “Past still Scheduled” is a workflow fact. Classroom does not infer that the teaching did
          not occur.
        </p>
      </section>

      <section className={`card ${styles.section}`} aria-labelledby="evidence-coverage-heading">
        <SectionHeader
          eyebrow="Assessment Evidence"
          title="Current retained roster coverage"
          description="Learners are deduplicated across Class, Group, and linked Individual contexts. Historical roster membership is not reconstructed."
          headingId="evidence-coverage-heading"
        />
        <div className={styles.ratioPanel}>
          <div>
            <span>Roster learners with active Evidence</span>
            <strong>{percentageLabel(evidence.currentRetainedRosterCoverage)}</strong>
            <small>{ratioExplanation(evidence.currentRetainedRosterCoverage)}</small>
          </div>
          <dl>
            <div>
              <dt>Active Evidence records</dt>
              <dd>{numberLabel(evidence.activeEvidenceCount)}</dd>
            </div>
            <div>
              <dt>Learners with Evidence</dt>
              <dd>{numberLabel(evidence.learnerCount)}</dd>
            </div>
            <div>
              <dt>Current retained roster learners</dt>
              <dd>{numberLabel(evidence.currentRetainedRosterLearnerCount)}</dd>
            </div>
            <div>
              <dt>Covered roster learners</dt>
              <dd>{numberLabel(evidence.currentRetainedRosterCoveredLearnerCount)}</dd>
            </div>
          </dl>
        </div>
        <div className={styles.compactGrid} aria-label="Assessment Evidence kinds">
          {Object.entries(evidenceKindLabels).map(([kind, label]) => (
            <article key={kind}>
              <span>{label}</span>
              <strong>{numberLabel(evidence.byKind[kind as keyof typeof evidence.byKind])}</strong>
            </article>
          ))}
        </div>
        <details className={styles.disclosure}>
          <summary>Evidence source-link fields</summary>
          <dl className={styles.inlineDefinitionList}>
            <div>
              <dt>Context</dt>
              <dd>{numberLabel(evidence.sourceLinkage.context)}</dd>
            </div>
            <div>
              <dt>Lesson Plan</dt>
              <dd>{numberLabel(evidence.sourceLinkage.lessonPlan)}</dd>
            </div>
            <div>
              <dt>Session</dt>
              <dd>{numberLabel(evidence.sourceLinkage.session)}</dd>
            </div>
            <div>
              <dt>Library Assessment</dt>
              <dd>{numberLabel(evidence.sourceLinkage.assessment)}</dd>
            </div>
            <div>
              <dt>Standard</dt>
              <dd>{numberLabel(evidence.sourceLinkage.standard)}</dd>
            </div>
          </dl>
        </details>
      </section>

      <section className={`card ${styles.section}`} aria-labelledby="context-distribution-heading">
        <SectionHeader
          eyebrow="Context distribution"
          title="Class, Group, and Individual"
          description="The three planning-context types are peers. Group activity is never rolled into a Class automatically."
          headingId="context-distribution-heading"
        />
        <div className={styles.contextKindGrid}>
          {view.contextDistribution.byKind.map((row) => (
            <article key={row.contextKind}>
              <span>{contextKindLabels[row.contextKind]}</span>
              <strong>{numberLabel(row.completedSessions)} Sessions</strong>
              <small>
                {numberLabel(row.completedMinutes)} minutes · {numberLabel(row.teachingDays)} days
              </small>
            </article>
          ))}
        </div>
        {view.contextDistribution.contexts.length === 0 ? (
          <p className={styles.emptyText}>
            No planning contexts are retained for this School Year.
          </p>
        ) : (
          <div
            className={styles.tableScroller}
            role="region"
            tabIndex={0}
            aria-label="Teaching activity by planning context"
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">Context</th>
                  <th scope="col">Type</th>
                  <th scope="col">Completed</th>
                  <th scope="col">Minutes</th>
                  <th scope="col">Days</th>
                  <th scope="col">Past still Scheduled</th>
                  <th scope="col">Future Scheduled</th>
                </tr>
              </thead>
              <tbody>
                {view.contextDistribution.contexts.map((context) => (
                  <tr key={context.contextId}>
                    <th scope="row">
                      <SourceLink source={context.source}>{context.contextName}</SourceLink>
                      {context.archived ? <span className="status-badge">Archived</span> : null}
                    </th>
                    <td>{contextKindLabels[context.contextKind]}</td>
                    <td>{numberLabel(context.completedSessions)}</td>
                    <td>{numberLabel(context.completedMinutes)}</td>
                    <td>{numberLabel(context.teachingDays)}</td>
                    <td>{numberLabel(context.unresolvedPastSessions)}</td>
                    <td>{numberLabel(context.futureScheduledSessions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className={styles.splitLayout}>
        <section className={`card ${styles.section}`} aria-labelledby="standards-usage-heading">
          <SectionHeader
            eyebrow="Standards"
            title="Explicit planning alignment"
            description="Current active Plan links, not a claim about Standards taught in past Sessions."
            headingId="standards-usage-heading"
          />
          <dl className={styles.summaryList}>
            <div>
              <dt>Active Plans</dt>
              <dd>{numberLabel(standards.activePlanCount)}</dd>
            </div>
            <div>
              <dt>Plans with active alignment</dt>
              <dd>{numberLabel(standards.plansWithActiveAlignmentCount)}</dd>
            </div>
            <div>
              <dt>Plans without active alignment</dt>
              <dd>{numberLabel(standards.plansWithoutActiveAlignmentCount)}</dd>
            </div>
            <div>
              <dt>Unique linked Standards</dt>
              <dd>{numberLabel(standards.uniqueExplicitlyLinkedStandardCount)}</dd>
            </div>
            <div>
              <dt>Alignment placements</dt>
              <dd>{numberLabel(standards.alignmentPlacementCount)}</dd>
            </div>
          </dl>
          <details className={styles.disclosure}>
            <summary>Alignment sources ({numberLabel(standards.placements.length)})</summary>
            {standards.placements.length === 0 ? (
              <p className={styles.emptyText}>No valid active Standard alignments are retained.</p>
            ) : (
              <ul className={styles.sourceList}>
                {standards.placements.map((placement) => (
                  <li key={placement.alignmentId}>
                    <SourceLink source={placement.source}>{placement.planTitle}</SourceLink>
                    <span>
                      {placement.standardCode} · {scopeLabel(placement.scope, placement.stepTitle)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </details>
        </section>

        <section className={`card ${styles.section}`} aria-labelledby="content-usage-heading">
          <SectionHeader
            eyebrow="Content"
            title="Planning content links"
            description="Current explicit Plan and Lesson Flow links, not a historical claim about content used while teaching."
            headingId="content-usage-heading"
          />
          <dl className={styles.summaryList}>
            <div>
              <dt>Plans with links</dt>
              <dd>{numberLabel(content.plansWithContentLinksCount)}</dd>
            </div>
            <div>
              <dt>Unique Library items</dt>
              <dd>{numberLabel(content.uniqueItemCount)}</dd>
            </div>
            <div>
              <dt>Link placements</dt>
              <dd>{numberLabel(content.placementCount)}</dd>
            </div>
            <div>
              <dt>Archived-source placements</dt>
              <dd>{numberLabel(content.archivedSourcePlacementCount)}</dd>
            </div>
          </dl>
          <div className={styles.compactGrid} aria-label="Unique planning content by type">
            {(['activity', 'resource', 'assessment'] as const).map((catalogType) => (
              <article key={catalogType}>
                <span>{catalogType}</span>
                <strong>{numberLabel(content.uniqueItemsByType[catalogType])}</strong>
              </article>
            ))}
          </div>
          <details className={styles.disclosure}>
            <summary>Content link sources ({numberLabel(content.placements.length)})</summary>
            {content.placements.length === 0 ? (
              <p className={styles.emptyText}>No valid planning content links are retained.</p>
            ) : (
              <ul className={styles.sourceList}>
                {content.placements.map((placement) => (
                  <li key={placement.key}>
                    <SourceLink source={placement.source}>{placement.planTitle}</SourceLink>
                    <span>
                      {placement.title} · {scopeLabel(placement.scope, placement.stepTitle)}
                      {placement.archivedSource ? ' · Archived source' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </details>
        </section>
      </div>

      <section className={`card ${styles.section}`} aria-labelledby="reflection-next-steps-heading">
        <SectionHeader
          eyebrow="Teaching Reflection"
          title="Reflection and Next Steps"
          description="Coverage reports retained active Reflections for completed Sessions. Reflection text remains teacher interpretation and is not analyzed or scored."
          headingId="reflection-next-steps-heading"
        />
        <div className={styles.ratioPanel}>
          <div>
            <span>Completed Sessions with an active Reflection</span>
            <strong>{percentageLabel(reflection.reflectionCoverage)}</strong>
            <small>
              {reflection.reflectionCoverage.status === 'available'
                ? ratioExplanation(reflection.reflectionCoverage)
                : reflection.reflectionCoverage.reason === 'future-school-year'
                  ? 'The selected School Year has not started.'
                  : 'No completed Sessions are retained for this School Year.'}
            </small>
          </div>
          <dl>
            <div>
              <dt>Active Reflections</dt>
              <dd>{numberLabel(reflection.activeReflectionCount)}</dd>
            </div>
            <div>
              <dt>Archived Reflections</dt>
              <dd>{numberLabel(reflection.archivedReflectionCount)}</dd>
            </div>
            <div>
              <dt>Reflected completed Sessions</dt>
              <dd>{numberLabel(reflection.reflectedCompletedSessionCount)}</dd>
            </div>
            <div>
              <dt>Completed without active Reflection</dt>
              <dd>{numberLabel(reflection.completedSessionWithoutActiveReflectionCount)}</dd>
            </div>
            <div>
              <dt>Open Next Steps</dt>
              <dd>{numberLabel(reflection.openNextStepCount)}</dd>
            </div>
            <div>
              <dt>Closed Next Steps</dt>
              <dd>{numberLabel(reflection.closedNextStepCount)}</dd>
            </div>
          </dl>
        </div>
        <div className={styles.compactGrid} aria-label="Reflection-linked Next Step statuses">
          <article>
            <span>Active</span>
            <strong>{numberLabel(reflection.activeNextStepCount)}</strong>
          </article>
          <article>
            <span>Waiting</span>
            <strong>{numberLabel(reflection.waitingNextStepCount)}</strong>
          </article>
          <article>
            <span>Completed</span>
            <strong>{numberLabel(reflection.completedNextStepCount)}</strong>
          </article>
          <article>
            <span>Cancelled</span>
            <strong>{numberLabel(reflection.cancelledNextStepCount)}</strong>
          </article>
        </div>
        <p className={styles.interpretationNote}>
          Classroom counts Reflection records and linked Task states. It does not infer teaching
          quality, effectiveness, mastery, or learner progress from Reflection narrative.
        </p>
        <details className={styles.disclosure}>
          <summary>Reflection sources ({numberLabel(reflection.reflections.length)})</summary>
          {reflection.reflections.length === 0 ? (
            <p className={styles.emptyText}>
              No Teaching Reflections are retained for this School Year.
            </p>
          ) : (
            <div
              className={styles.tableScroller}
              role="region"
              tabIndex={0}
              aria-label="Teaching Reflection source records"
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">Reflection</th>
                    <th scope="col">Date</th>
                    <th scope="col">Context</th>
                    <th scope="col">Reflection status</th>
                    <th scope="col">Session source</th>
                    <th scope="col">Next Steps</th>
                  </tr>
                </thead>
                <tbody>
                  {reflection.reflections.map((row) => (
                    <tr key={row.id}>
                      <th scope="row">
                        <SourceLink source={row.source}>{row.lessonPlanTitle}</SourceLink>
                      </th>
                      <td>{formatLongDate(row.occurredOn)}</td>
                      <td>{row.contextName}</td>
                      <td>{row.status === 'archived' ? 'Archived' : 'Active'}</td>
                      <td>{reflectionSessionStateLabels[row.sessionState]}</td>
                      <td>
                        {numberLabel(row.openNextStepCount)} open ·{' '}
                        {numberLabel(row.closedNextStepCount)} closed
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>
      </section>

      <section className={`card ${styles.section}`} aria-labelledby="classification-usage-heading">
        <SectionHeader
          eyebrow="Classification"
          title="Managed Plan category assignments"
          description="Only explicit managed Focus, Purpose, and Theme assignments are counted. Free-text subject fields are not merged into these values."
          headingId="classification-usage-heading"
        />
        <div className={styles.contextKindGrid}>
          {view.classificationUsage.families.map((family) => (
            <article key={family.familyId}>
              <span>{categoryFamilyLabels[family.familyId]}</span>
              <strong>{numberLabel(family.assignmentCount)} assignments</strong>
              <small>
                {numberLabel(family.planCount)} Plans · {numberLabel(family.distinctValueCount)}{' '}
                values
              </small>
            </article>
          ))}
        </div>
      </section>

      <section className={`card ${styles.section}`} aria-labelledby="needs-review-heading">
        <SectionHeader
          eyebrow="Data and workflow"
          title="Needs review"
          description="Transparent record-integrity rules. This is not a quality score and does not rank learners, contexts, or teachers."
          headingId="needs-review-heading"
        />
        <div className={styles.reviewSummary}>
          <MetricCard
            label="Affected records"
            value={numberLabel(review.affectedRecordCount)}
            detail="Distinct source records"
          />
          <MetricCard
            label="Review issues"
            value={numberLabel(review.issueCount)}
            detail="A record can have more than one issue"
          />
        </div>
        {review.issues.length === 0 ? (
          <p className={styles.reviewClear}>No review issues were found for this School Year.</p>
        ) : (
          <div
            className={styles.tableScroller}
            role="region"
            tabIndex={0}
            aria-label="Needs review issues"
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
                {review.issues.map((issue, index) => (
                  <tr key={`${issue.code}:${issue.entityType}:${issue.entityId}:${index}`}>
                    <th scope="row">
                      <SourceLink source={issue.source}>{issue.source.label}</SourceLink>
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

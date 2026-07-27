import { ExternalLink } from 'lucide-react';
import { useMemo, useState } from 'react';

import type {
  StandardCoverageDimension,
  StandardCoverageGroup,
  StandardsCoverageView as CoverageView,
  StandardCoverageEntityType,
} from '@/features/standards/standardCoverageReadModel';
import { standardCoverageEntityLabels } from '@/features/standards/standardCoverageReadModel';

import styles from './StandardsCoverageView.module.css';

const entityTypes = ['lesson-plan', 'lesson-flow-step', 'lesson-template'] as const;

const dimensionLabels: Record<StandardCoverageDimension, string> = {
  framework: 'Framework',
  subject: 'Subject',
  'grade-band': 'Grade band',
  standard: 'Standard',
};

function entityCount(coverage: CoverageView, entityType: StandardCoverageEntityType): number {
  if (entityType === 'lesson-plan') return coverage.entityCounts.lessonPlan;
  if (entityType === 'lesson-template') return coverage.entityCounts.lessonTemplate;
  return coverage.entityCounts.lessonFlowStep;
}

function groupEntityCount(
  group: StandardCoverageGroup,
  entityType: StandardCoverageEntityType,
): number {
  if (entityType === 'lesson-plan') return group.entityCounts.lessonPlan;
  if (entityType === 'lesson-template') return group.entityCounts.lessonTemplate;
  return group.entityCounts.lessonFlowStep;
}

export function StandardsCoverageView({
  coverage,
  loading,
  onOpenGroup,
  onOpenStandard,
}: {
  coverage?: CoverageView;
  loading: boolean;
  onOpenGroup: (dimension: StandardCoverageDimension, group: StandardCoverageGroup) => void;
  onOpenStandard: (standardId: string) => void;
}) {
  const [dimension, setDimension] = useState<StandardCoverageDimension>('framework');
  const unalignedByType = useMemo(
    () =>
      Object.fromEntries(
        entityTypes.map((entityType) => [
          entityType,
          (coverage?.unalignedSources ?? []).filter((source) => source.entityType === entityType),
        ]),
      ) as Record<StandardCoverageEntityType, NonNullable<CoverageView['unalignedSources']>>,
    [coverage?.unalignedSources],
  );

  if (loading || !coverage) {
    return (
      <section className={`card ${styles.loading}`} aria-label="Standards coverage">
        Loading Standards coverage…
      </section>
    );
  }

  const groups = coverage.groups[dimension];

  return (
    <div className={styles.coverage}>
      <section className={`card ${styles.overview}`} aria-labelledby="coverage-overview-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className="page-eyebrow">Explicit active links only</p>
            <h2 id="coverage-overview-heading">Coverage overview</h2>
            <p>
              Counts describe current Standard links. They do not infer mastery, gaps, grades, or
              teacher effectiveness.
            </p>
          </div>
        </div>
        <dl className={styles.metrics}>
          <div>
            <dt>Active Standards</dt>
            <dd>{coverage.activeStandardCount}</dd>
          </div>
          <div>
            <dt>Standards with coverage</dt>
            <dd>{coverage.alignedStandardCount}</dd>
          </div>
          <div>
            <dt>Standards without coverage</dt>
            <dd>{coverage.unalignedStandardCount}</dd>
          </div>
          <div>
            <dt>Explicit active alignments</dt>
            <dd>{coverage.activeAlignmentCount}</dd>
          </div>
        </dl>
      </section>

      <section className={`card ${styles.entitySummary}`} aria-labelledby="entity-summary-heading">
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="entity-summary-heading">Aligned entity types</h2>
            <p>Session occurrences are not counted again; Plan coverage remains one source link.</p>
          </div>
        </div>
        <dl className={styles.entityCards}>
          {entityTypes.map((entityType) => (
            <div key={entityType}>
              <dt>{standardCoverageEntityLabels[entityType]}</dt>
              <dd>{entityCount(coverage, entityType)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={`card ${styles.breakdown}`} aria-labelledby="coverage-breakdown-heading">
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="coverage-breakdown-heading">Coverage breakdown</h2>
            <p>Open a row to inspect the matching source Standards in the catalog.</p>
          </div>
          <div className={styles.dimensionField}>
            <label htmlFor="standard-coverage-dimension">Group by</label>
            <select
              id="standard-coverage-dimension"
              value={dimension}
              onChange={(event) => setDimension(event.target.value as StandardCoverageDimension)}
            >
              {Object.entries(dimensionLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {groups.length === 0 ? (
          <p className={styles.empty}>No active Standards are available for this breakdown.</p>
        ) : (
          <div
            className={styles.tableScroller}
            tabIndex={0}
            aria-label="Scrollable coverage breakdown"
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">{dimensionLabels[dimension]}</th>
                  <th scope="col">Standards</th>
                  <th scope="col">Covered</th>
                  <th scope="col">Alignments</th>
                  <th scope="col">Plans</th>
                  <th scope="col">Steps</th>
                  <th scope="col">Templates</th>
                  <th scope="col">Source</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.key}>
                    <th scope="row">
                      <strong>{group.label}</strong>
                      {group.standardStatement ? <small>{group.standardStatement}</small> : null}
                    </th>
                    <td>{group.standardCount}</td>
                    <td>{group.alignedStandardCount}</td>
                    <td>{group.alignmentCount}</td>
                    <td>{groupEntityCount(group, 'lesson-plan')}</td>
                    <td>{groupEntityCount(group, 'lesson-flow-step')}</td>
                    <td>{groupEntityCount(group, 'lesson-template')}</td>
                    <td>
                      <button
                        className="button button-quiet"
                        type="button"
                        onClick={() =>
                          group.standardId
                            ? onOpenStandard(group.standardId)
                            : onOpenGroup(dimension, group)
                        }
                      >
                        Open {group.standardId ? 'Standard' : 'catalog'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        className={`card ${styles.alignmentRecords}`}
        aria-labelledby="alignment-records-heading"
      >
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="alignment-records-heading">Active alignment records</h2>
            <p>Each row links the independent Standard and its current source record.</p>
          </div>
          <span className={styles.countBadge}>{coverage.alignments.length}</span>
        </div>
        {coverage.alignments.length === 0 ? (
          <p className={styles.empty}>No active explicit alignments.</p>
        ) : (
          <div
            className={styles.tableScroller}
            tabIndex={0}
            aria-label="Scrollable active alignments"
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">Standard</th>
                  <th scope="col">Entity type</th>
                  <th scope="col">Source record</th>
                  <th scope="col">Lesson Flow step</th>
                </tr>
              </thead>
              <tbody>
                {coverage.alignments.map((alignment) => (
                  <tr key={alignment.alignmentId}>
                    <th scope="row">
                      <button
                        className={styles.textButton}
                        type="button"
                        onClick={() => onOpenStandard(alignment.standardId)}
                      >
                        {alignment.standardCode}
                      </button>
                      <small>{alignment.frameworkLabel}</small>
                    </th>
                    <td>{standardCoverageEntityLabels[alignment.entityType]}</td>
                    <td>
                      <a href={alignment.sourceHref}>
                        {alignment.sourceTitle} <ExternalLink size={14} aria-hidden="true" />
                      </a>
                    </td>
                    <td>{alignment.stepTitle ?? 'Plan or Template level'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={`card ${styles.unaligned}`} aria-labelledby="unaligned-sources-heading">
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="unaligned-sources-heading">Active unaligned sources</h2>
            <p>These source scopes currently have no explicit active Standard link.</p>
          </div>
          <span className={styles.countBadge}>{coverage.unalignedSources.length}</span>
        </div>
        <div className={styles.unalignedGrid}>
          {entityTypes.map((entityType) => (
            <section
              key={entityType}
              aria-label={`Unaligned ${standardCoverageEntityLabels[entityType]}`}
            >
              <h3>
                {standardCoverageEntityLabels[entityType]}
                <span>{unalignedByType[entityType].length}</span>
              </h3>
              {unalignedByType[entityType].length === 0 ? (
                <p>Every active source scope is aligned.</p>
              ) : (
                <ul>
                  {unalignedByType[entityType].map((source) => (
                    <li key={`${source.targetType}:${source.targetId}:${source.stepId ?? 'root'}`}>
                      <a href={source.href}>
                        <strong>{source.stepTitle ?? source.title}</strong>
                        {source.stepTitle ? <small>{source.title}</small> : null}
                        <ExternalLink size={14} aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </section>

      <section
        className={`card ${styles.unalignedStandards}`}
        aria-labelledby="unaligned-standards-heading"
      >
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="unaligned-standards-heading">Standards without active alignment</h2>
            <p>Archived Standards are excluded from this active coverage view.</p>
          </div>
          <span className={styles.countBadge}>{coverage.unalignedStandards.length}</span>
        </div>
        {coverage.unalignedStandards.length === 0 ? (
          <p className={styles.empty}>Every active Standard has at least one active alignment.</p>
        ) : (
          <ul className={styles.standardList}>
            {coverage.unalignedStandards.map((standard) => (
              <li key={standard.key}>
                <button
                  type="button"
                  onClick={() => onOpenStandard(standard.standardId ?? standard.key)}
                >
                  <strong>{standard.label}</strong>
                  <span>{standard.standardStatement}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

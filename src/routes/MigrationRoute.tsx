import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileJson,
  ListChecks,
  RotateCcw,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import {
  scanLegacyBackupJson,
  type LegacyBackupScan,
  type LegacyStoreReport,
  type MigrationDecision,
} from '@/features/migration/legacyBackupScanner';
import {
  createReversibleMigrationPlan,
  type ReversibleMigrationPlan,
} from '@/features/migration/migrationPlan';
import styles from './MigrationRoute.module.css';

const decisionLabels: Record<MigrationDecision, string> = {
  ready: 'Ready',
  review: 'Review',
  deferred: 'Deferred',
  quarantine: 'Quarantine',
  invalid: 'Invalid',
};

interface SummaryItem {
  label: string;
  value: number;
  detail: string;
  tone: MigrationDecision | 'neutral';
}

function SummaryCard({ label, value, detail, tone }: SummaryItem) {
  return (
    <div className={styles.summaryCard} data-tone={tone}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function StoreWarnings({ report }: { report: LegacyStoreReport }) {
  if (report.warnings.length === 0) return <span className={styles.noWarnings}>None</span>;

  return (
    <details className={styles.storeWarnings}>
      <summary>{report.warnings.length} warning(s)</summary>
      <ul>
        {report.warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </details>
  );
}

function Notice({
  icon: Icon,
  children,
  tone,
}: {
  icon: LucideIcon;
  children: string;
  tone: string;
}) {
  return (
    <div className={styles.notice} data-tone={tone}>
      <Icon size={20} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

function PlanReport({ plan, onDiscard }: { plan: ReversibleMigrationPlan; onDiscard: () => void }) {
  const summaryItems: SummaryItem[] = [
    {
      label: 'Create',
      value: plan.summary.createRecords,
      detail: 'Validated v20 draft records',
      tone: 'ready',
    },
    {
      label: 'Needs review',
      value: plan.summary.reviewRecords,
      detail: 'Preserved until classification is confirmed',
      tone: 'review',
    },
    {
      label: 'Deferred',
      value: plan.summary.deferredRecords,
      detail: 'Waiting for a future v20 schema',
      tone: 'deferred',
    },
    {
      label: 'Quarantine',
      value: plan.summary.quarantineRecords,
      detail: 'Planned outside active collections',
      tone: 'quarantine',
    },
    {
      label: 'Skipped',
      value: plan.summary.skippedRecords,
      detail: 'Duplicates or records without safe identity',
      tone: 'neutral',
    },
    {
      label: 'Rollback deletes',
      value: plan.summary.rollbackDeletes,
      detail: 'One inverse action for every planned write',
      tone: 'ready',
    },
  ];

  return (
    <section className={styles.planSection} aria-labelledby="migration-plan-heading">
      <div className={styles.planHeader}>
        <div>
          <p className="page-eyebrow">Phase 1C · In-memory only</p>
          <h3 id="migration-plan-heading">Reversible migration plan</h3>
        </div>
        <span className={styles.planStatus}>Draft</span>
      </div>

      <p className={styles.planIntro}>
        The plan contains transformed v20 draft records and matching inverse deletes. It has not
        opened a write transaction and cannot change Today, Week, Calendar, Tasks, or Learners.
      </p>

      <dl className={styles.planMetadata}>
        <div>
          <dt>Plan ID</dt>
          <dd>{plan.planId}</dd>
        </div>
        <div>
          <dt>Source fingerprint</dt>
          <dd>{plan.sourceFingerprint}</dd>
        </div>
        <div>
          <dt>Generated</dt>
          <dd>{new Date(plan.generatedAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt>Source stores used</dt>
          <dd>{plan.summary.sourceStoreCount}</dd>
        </div>
      </dl>

      <div className={styles.summaryGrid} aria-label="Migration plan summary">
        {summaryItems.map((item) => (
          <SummaryCard key={item.label} {...item} />
        ))}
      </div>

      <div
        className={styles.tableScroll}
        role="region"
        aria-label="Reversible migration plan table"
        tabIndex={0}
      >
        <table className={styles.planTable}>
          <caption className="sr-only">
            Planned target tables, forward actions, skipped records, and inverse rollback deletes
          </caption>
          <thead>
            <tr>
              <th scope="col">Target v20 table</th>
              <th scope="col">Create</th>
              <th scope="col">Review</th>
              <th scope="col">Deferred</th>
              <th scope="col">Quarantine</th>
              <th scope="col">Skipped</th>
              <th scope="col">Rollback</th>
            </tr>
          </thead>
          <tbody>
            {plan.tableSummaries.map((summary) => (
              <tr key={summary.targetTable}>
                <th scope="row">{summary.targetTable}</th>
                <td>{summary.createCount}</td>
                <td>{summary.reviewCount}</td>
                <td>{summary.deferredCount}</td>
                <td>{summary.quarantineCount}</td>
                <td>{summary.skippedCount}</td>
                <td>{summary.rollbackDeleteCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {plan.warnings.map((warning) => (
        <Notice icon={AlertTriangle} tone="warning" key={warning}>
          {warning}
        </Notice>
      ))}

      <div className={styles.rollbackNote}>
        <RotateCcw size={20} aria-hidden="true" />
        <div>
          <strong>Rollback manifest is complete.</strong>
          <span>
            {plan.summary.rollbackDeletes} inverse delete operation(s) cover all{' '}
            {plan.summary.plannedWriteOperations} planned write operation(s).
          </span>
        </div>
      </div>

      <div className={styles.noWrite}>
        <ShieldCheck size={20} aria-hidden="true" />
        <div>
          <strong>No data was written to IndexedDB.</strong>
          <span>Plan write operations: {plan.writeOperations}</span>
        </div>
      </div>

      <button className="button" type="button" onClick={onDiscard}>
        Discard generated plan
      </button>
    </section>
  );
}

export function MigrationRoute() {
  const [scan, setScan] = useState<LegacyBackupScan | null>(null);
  const [plan, setPlan] = useState<ReversibleMigrationPlan | null>(null);
  const [rawBackupText, setRawBackupText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function scanFile(file: File | undefined) {
    setScan(null);
    setPlan(null);
    setRawBackupText(null);
    setError(null);
    setFileName(file?.name ?? null);
    if (!file) return;

    try {
      const text = await file.text();
      setScan(scanLegacyBackupJson(text));
      setRawBackupText(text);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The backup could not be scanned.');
    }
  }

  function generatePlan() {
    if (!rawBackupText) return;
    setError(null);

    try {
      setPlan(createReversibleMigrationPlan(rawBackupText));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The reversible migration plan could not be generated.',
      );
    }
  }

  const summaryItems: SummaryItem[] = scan
    ? [
        {
          label: 'Ready to migrate',
          value: scan.summary.readyRecords,
          detail: 'Records with a direct v20 target',
          tone: 'ready',
        },
        {
          label: 'Needs review',
          value: scan.summary.reviewRecords,
          detail: 'Planning records needing classification',
          tone: 'review',
        },
        {
          label: 'Deferred',
          value: scan.summary.deferredRecords,
          detail: 'Preserved for a future schema phase',
          tone: 'deferred',
        },
        {
          label: 'Quarantine',
          value: scan.summary.quarantinedRecords,
          detail: 'Kept outside the active calendar',
          tone: 'quarantine',
        },
        {
          label: 'Skipped',
          value: scan.summary.skippedRecords,
          detail: 'Invalid or duplicate records',
          tone: 'neutral',
        },
        {
          label: 'Invalid stores',
          value: scan.summary.invalidStores,
          detail: 'Stores whose saved JSON could not be parsed',
          tone: 'invalid',
        },
      ]
    : [];

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">System</p>
          <h1 className="page-title">Migration preview</h1>
          <p className="page-subtitle">
            Phase 1C validates legacy stores, then generates an in-memory v20 migration plan with a
            matching rollback manifest. It never writes records or modifies old <code>cos-*</code>{' '}
            storage.
          </p>
        </div>
      </header>

      <div className={styles.grid}>
        <article className={`card ${styles.uploadCard}`}>
          <ShieldCheck size={30} aria-hidden="true" />
          <h2>Read-only scan and plan</h2>
          <p>
            Select your private full backup JSON. The browser reads it locally, validates every
            supported store, and can prepare reversible draft operations.
          </p>
          <label className="button button-primary">
            <FileJson size={18} aria-hidden="true" /> Choose backup
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => scanFile(event.target.files?.[0])}
            />
          </label>
          {fileName && <p className={styles.fileName}>Selected: {fileName}</p>}
          {scan && !plan && (
            <button className="button button-primary" type="button" onClick={generatePlan}>
              <ListChecks size={18} aria-hidden="true" /> Generate reversible plan
            </button>
          )}
          <p className={styles.privateNote}>
            Keep private backups off GitHub. Names and full record content are not rendered in the
            scan or plan report.
          </p>
        </article>

        <article className={`card ${styles.reportCard}`} aria-live="polite">
          <h2>Scan report</h2>
          {!scan && !error && <p>No file has been scanned.</p>}
          {error && (
            <Notice icon={AlertTriangle} tone="error">
              {error}
            </Notice>
          )}
          {scan && (
            <div className={styles.report}>
              <Notice icon={CheckCircle2} tone="success">
                Backup envelope is readable
              </Notice>

              <dl className={styles.metadata}>
                <div>
                  <dt>Format</dt>
                  <dd>{scan.format}</dd>
                </div>
                <div>
                  <dt>App version</dt>
                  <dd>{scan.appVersion ?? 'Not provided'}</dd>
                </div>
                <div>
                  <dt>Encoding</dt>
                  <dd>{scan.storageEncoding ?? 'Not provided'}</dd>
                </div>
                <div>
                  <dt>Store keys</dt>
                  <dd>{scan.storeCount}</dd>
                </div>
                <div>
                  <dt>Recognized stores</dt>
                  <dd>{scan.recognizedStores.length}</dd>
                </div>
                <div>
                  <dt>Outside this preview</dt>
                  <dd>{scan.unrecognizedStoreCount}</dd>
                </div>
              </dl>

              <section aria-labelledby="migration-summary-heading">
                <h3 id="migration-summary-heading">Record summary</h3>
                <div className={styles.summaryGrid}>
                  {summaryItems.map((item) => (
                    <SummaryCard key={item.label} {...item} />
                  ))}
                </div>
                {(scan.summary.duplicateIds > 0 || scan.summary.missingIds > 0) && (
                  <p className={styles.issueSummary}>
                    Duplicate identifiers: <strong>{scan.summary.duplicateIds}</strong> · Missing
                    identifiers: <strong>{scan.summary.missingIds}</strong>
                  </p>
                )}
              </section>

              <section aria-labelledby="store-preview-heading">
                <div className={styles.sectionHeading}>
                  <div>
                    <p className="page-eyebrow">Record-level validation</p>
                    <h3 id="store-preview-heading">Detailed store preview</h3>
                  </div>
                  <span>{scan.storeReports.length} recognized stores</span>
                </div>

                <div
                  className={styles.tableScroll}
                  role="region"
                  aria-label="Detailed store preview table"
                  tabIndex={0}
                >
                  <table className={styles.storeTable}>
                    <caption className="sr-only">
                      Legacy stores, record counts, planned v20 targets, decisions, and warnings
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Legacy store</th>
                        <th scope="col">Raw</th>
                        <th scope="col">Parsed</th>
                        <th scope="col">Valid</th>
                        <th scope="col">Skipped</th>
                        <th scope="col">Target v20 table</th>
                        <th scope="col">Decision</th>
                        <th scope="col">Warnings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scan.storeReports.map((report) => (
                        <tr key={report.storeName}>
                          <th scope="row">
                            <strong>{report.label}</strong>
                            <code>{report.storeName}</code>
                          </th>
                          <td>{report.rawRecordCount}</td>
                          <td>{report.parsedRecordCount}</td>
                          <td>{report.validRecordCount}</td>
                          <td>{report.skippedRecordCount}</td>
                          <td>
                            <strong>{report.target}</strong>
                            <small>{report.note}</small>
                          </td>
                          <td>
                            <span className={styles.decision} data-decision={report.decision}>
                              {decisionLabels[report.decision]}
                            </span>
                          </td>
                          <td>
                            <StoreWarnings report={report} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {scan.warnings.map((warning) => (
                <Notice icon={AlertTriangle} tone="warning" key={warning}>
                  {warning}
                </Notice>
              ))}

              <div className={styles.noWrite}>
                <ShieldCheck size={20} aria-hidden="true" />
                <div>
                  <strong>No data was written to IndexedDB.</strong>
                  <span>Scanner write operations: {scan.writeOperations}</span>
                </div>
              </div>

              {plan && <PlanReport plan={plan} onDiscard={() => setPlan(null)} />}
            </div>
          )}
        </article>
      </div>
    </section>
  );
}

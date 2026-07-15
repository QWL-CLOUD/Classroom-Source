import { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileJson, ShieldCheck, type LucideIcon } from 'lucide-react';
import {
  scanLegacyBackupJson,
  type LegacyBackupScan,
  type LegacyStoreReport,
  type MigrationDecision,
} from '@/features/migration/legacyBackupScanner';
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

export function MigrationRoute() {
  const [scan, setScan] = useState<LegacyBackupScan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function scanFile(file: File | undefined) {
    setScan(null);
    setError(null);
    setFileName(file?.name ?? null);
    if (!file) return;

    try {
      const text = await file.text();
      setScan(scanLegacyBackupJson(text));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The backup could not be scanned.');
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
            Phase 1B inspects each recognized legacy store, counts valid and problematic records,
            and shows the planned v20 destination. It never writes records or modifies old{' '}
            <code>cos-*</code> storage.
          </p>
        </div>
      </header>

      <div className={styles.grid}>
        <article className={`card ${styles.uploadCard}`}>
          <ShieldCheck size={30} aria-hidden="true" />
          <h2>Read-only detailed scan</h2>
          <p>
            Select your private full backup JSON. The browser reads it locally and displays only
            counts, store names, and validation issues.
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
          <p className={styles.privateNote}>
            Keep private backups off GitHub. No record names or full content are shown in this
            report.
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
            </div>
          )}
        </article>
      </div>
    </section>
  );
}

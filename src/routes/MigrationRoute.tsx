import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Download,
  FileJson,
  ListChecks,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import {
  captureLegacyStorageSnapshot,
  generateMigrationAcceptanceReport,
  getLatestMigrationAcceptanceReport,
  migrationAcceptanceJson,
  migrationAcceptanceMarkdown,
  saveMigrationAcceptanceReport,
  type LegacyStorageSnapshot,
  type MigrationAcceptanceCheckStatus,
  type MigrationAcceptanceReport,
} from '@/features/migration/migrationAcceptance';
import {
  commitMigrationPlan,
  getLatestMigrationExecution,
  MigrationExecutionConflictError,
  rollbackMigrationRun,
  type MigrationExecutionResult,
} from '@/features/migration/migrationExecutor';
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

function PlanReport({
  plan,
  onDiscard,
  onCommit,
  commitConfirmed,
  onCommitConfirmed,
  committing,
  alreadyCommitted,
}: {
  plan: ReversibleMigrationPlan;
  onDiscard: () => void;
  onCommit: () => void;
  commitConfirmed: boolean;
  onCommitConfirmed: (value: boolean) => void;
  committing: boolean;
  alreadyCommitted: boolean;
}) {
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
      detail: 'Not supported by the current import format',
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
          <p className="page-eyebrow">Migration plan</p>
          <h3 id="migration-plan-heading">Reversible migration plan</h3>
        </div>
        <span className={styles.planStatus}>{alreadyCommitted ? 'Committed' : 'Draft'}</span>
      </div>

      <p className={styles.planIntro}>
        The plan contains transformed Classroom records and matching inverse deletes. Review,
        deferred, and skipped records remain outside active Classroom tables.
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

      {!alreadyCommitted && (
        <div className={styles.commitPanel}>
          <div className={styles.commitHeading}>
            <LockKeyhole size={22} aria-hidden="true" />
            <div>
              <h4>Confirm safe migration</h4>
              <p>
                Commit uses one IndexedDB transaction, saves a recovery manifest, verifies every
                inserted record, and leaves all legacy <code>cos-*</code> data unchanged.
              </p>
            </div>
          </div>

          <label className={styles.confirmation}>
            <input
              type="checkbox"
              checked={commitConfirmed}
              onChange={(event) => onCommitConfirmed(event.target.checked)}
            />
            <span>
              I have reviewed the counts and understand that active v20 records will now be written
              locally in this browser.
            </span>
          </label>

          <div className={styles.actionRow}>
            <button
              className="button button-primary"
              type="button"
              onClick={onCommit}
              disabled={!commitConfirmed || committing}
            >
              <Database size={18} aria-hidden="true" />
              {committing ? 'Committing migration…' : 'Commit migration safely'}
            </button>
            <button className="button" type="button" onClick={onDiscard} disabled={committing}>
              Discard generated plan
            </button>
          </div>
        </div>
      )}

      {alreadyCommitted && (
        <Notice icon={CheckCircle2} tone="success">
          This backup fingerprint is already committed. Use the recovery panel below to roll it
          back.
        </Notice>
      )}
    </section>
  );
}

function ExecutionReport({
  execution,
  rollbackConfirmed,
  onRollbackConfirmed,
  onRollback,
  rollingBack,
  canGenerateAcceptance,
  generatingAcceptance,
  acceptanceReady,
  onGenerateAcceptance,
}: {
  execution: MigrationExecutionResult;
  rollbackConfirmed: boolean;
  onRollbackConfirmed: (value: boolean) => void;
  onRollback: () => void;
  rollingBack: boolean;
  canGenerateAcceptance: boolean;
  generatingAcceptance: boolean;
  acceptanceReady: boolean;
  onGenerateAcceptance: () => void;
}) {
  const committed = execution.status === 'committed';

  return (
    <section className={`card ${styles.executionCard}`} aria-labelledby="execution-heading">
      <div className={styles.planHeader}>
        <div>
          <p className="page-eyebrow">Recovery center</p>
          <h2 id="execution-heading">
            {committed ? 'Migration committed safely' : 'Migration rolled back safely'}
          </h2>
        </div>
        <span className={styles.executionStatus} data-status={execution.status}>
          {execution.status}
        </span>
      </div>

      <Notice icon={committed ? CheckCircle2 : RotateCcw} tone={committed ? 'success' : 'warning'}>
        {committed
          ? 'The transaction completed and every inserted record passed post-write verification.'
          : 'All unchanged records inserted by this migration were removed; reused records were preserved.'}
      </Notice>

      <dl className={styles.executionMetadata}>
        <div>
          <dt>Migration run</dt>
          <dd>{execution.runId}</dd>
        </div>
        <div>
          <dt>Inserted records</dt>
          <dd>{execution.insertedRecords}</dd>
        </div>
        <div>
          <dt>Existing identical records reused</dt>
          <dd>{execution.reusedRecords}</dd>
        </div>
        <div>
          <dt>Restore-point entries</dt>
          <dd>{execution.restorePointEntries}</dd>
        </div>
        <div>
          <dt>Rollback deletions</dt>
          <dd>{execution.deletedRecords}</dd>
        </div>
        <div>
          <dt>{committed ? 'Committed' : 'Rolled back'}</dt>
          <dd>
            {new Date(
              committed ? execution.committedAt : (execution.rolledBackAt ?? execution.committedAt),
            ).toLocaleString()}
          </dd>
        </div>
      </dl>

      {committed && (
        <div className={styles.acceptanceActionPanel}>
          <div className={styles.acceptanceActionHeading}>
            <ClipboardCheck size={22} aria-hidden="true" />
            <div>
              <h3>Complete real-backup acceptance</h3>
              <p>
                Re-check the committed records against the recovery manifest, confirm legacy storage
                was unchanged, and create a privacy-safe completion report.
              </p>
            </div>
          </div>
          <button
            className="button button-primary"
            type="button"
            onClick={onGenerateAcceptance}
            disabled={!canGenerateAcceptance || generatingAcceptance}
          >
            <RefreshCw size={18} aria-hidden="true" />
            {generatingAcceptance
              ? 'Running acceptance…'
              : acceptanceReady
                ? 'Re-run acceptance checks'
                : 'Generate completion report'}
          </button>
          {!canGenerateAcceptance && (
            <small>
              Choose the same private backup and generate its reversible plan to enable the full
              source-to-commit comparison.
            </small>
          )}
        </div>
      )}

      {committed && (
        <div className={styles.rollbackPanel}>
          <h3>Rollback this migration</h3>
          <p>
            Rollback removes only records inserted by this migration. It stops without deleting
            anything when one of those records has been edited after commit.
          </p>
          <label className={styles.confirmation}>
            <input
              type="checkbox"
              checked={rollbackConfirmed}
              onChange={(event) => onRollbackConfirmed(event.target.checked)}
            />
            <span>
              I understand rollback removes the unchanged v20 records created by this run.
            </span>
          </label>
          <button
            className="button"
            type="button"
            onClick={onRollback}
            disabled={!rollbackConfirmed || rollingBack}
          >
            <RotateCcw size={18} aria-hidden="true" />
            {rollingBack ? 'Rolling back migration…' : 'Rollback migration'}
          </button>
        </div>
      )}
    </section>
  );
}

function checkStatusLabel(status: MigrationAcceptanceCheckStatus): string {
  if (status === 'pass') return 'Pass';
  if (status === 'follow-up') return 'Follow-up';
  return 'Fail';
}

function downloadTextFile(fileName: string, content: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function AcceptanceReportCard({ report }: { report: MigrationAcceptanceReport }) {
  const statusLabel =
    report.status === 'passed'
      ? 'Passed'
      : report.status === 'passed-with-follow-up'
        ? 'Passed with follow-up'
        : 'Failed';
  const statusTone =
    report.status === 'failed' ? 'error' : report.status === 'passed' ? 'success' : 'warning';

  return (
    <section className={`card ${styles.acceptanceCard}`} aria-labelledby="acceptance-heading">
      <div className={styles.planHeader}>
        <div>
          <p className="page-eyebrow">Completion evidence</p>
          <h2 id="acceptance-heading">Migration completion report</h2>
        </div>
        <span className={styles.acceptanceStatus} data-status={report.status}>
          {statusLabel}
        </span>
      </div>

      <Notice icon={report.status === 'failed' ? AlertTriangle : ClipboardCheck} tone={statusTone}>
        {report.status === 'failed'
          ? 'The migration remains committed, but one or more independent acceptance checks failed.'
          : report.status === 'passed'
            ? 'The committed migration passed every source, database, rollback, and privacy check.'
            : 'The committed migration passed integrity checks; deferred and review items remain for follow-up.'}
      </Notice>

      <dl className={styles.acceptanceSummary}>
        <div>
          <dt>Verified records</dt>
          <dd>{report.summary.verifiedRecords}</dd>
        </div>
        <div>
          <dt>Planned writes</dt>
          <dd>{report.summary.plannedWrites}</dd>
        </div>
        <div>
          <dt>Restore-point entries</dt>
          <dd>{report.summary.restorePointEntries}</dd>
        </div>
        <div>
          <dt>Follow-up items</dt>
          <dd>{report.summary.followUpItems}</dd>
        </div>
        <div>
          <dt>Legacy keys checked</dt>
          <dd>{report.summary.legacyStorageKeyCount}</dd>
        </div>
        <div>
          <dt>Integrity hash</dt>
          <dd>{report.integrityHash}</dd>
        </div>
      </dl>

      <section aria-labelledby="acceptance-checks-heading">
        <h3 id="acceptance-checks-heading">Acceptance checks</h3>
        <ul className={styles.acceptanceChecks}>
          {report.checks.map((check) => (
            <li key={check.id} data-status={check.status}>
              {check.status === 'pass' ? (
                <CheckCircle2 size={19} aria-hidden="true" />
              ) : (
                <AlertTriangle size={19} aria-hidden="true" />
              )}
              <div>
                <strong>
                  {checkStatusLabel(check.status)} · {check.label}
                </strong>
                <span>{check.detail}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="acceptance-tables-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className="page-eyebrow">Independent table verification</p>
            <h3 id="acceptance-tables-heading">Target table results</h3>
          </div>
          <span>{report.tables.length} planned target group(s)</span>
        </div>
        <div
          className={styles.tableScroll}
          role="region"
          aria-label="Migration completion table"
          tabIndex={0}
        >
          <table className={styles.acceptanceTable}>
            <caption className="sr-only">
              Planned, inserted, reused, verified, and current record counts by target table
            </caption>
            <thead>
              <tr>
                <th scope="col">Target</th>
                <th scope="col">Planned</th>
                <th scope="col">Inserted</th>
                <th scope="col">Reused</th>
                <th scope="col">Verified</th>
                <th scope="col">Current total</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {report.tables.map((table) => (
                <tr key={table.targetTable}>
                  <th scope="row">{table.targetTable}</th>
                  <td>{table.plannedWrites}</td>
                  <td>{table.inserted}</td>
                  <td>{table.reused}</td>
                  <td>{table.verified}</td>
                  <td>{table.currentTableCount ?? '—'}</td>
                  <td>
                    <span className={styles.acceptanceResult} data-status={table.status}>
                      {checkStatusLabel(table.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.followUpPanel} aria-labelledby="follow-up-heading">
        <h3 id="follow-up-heading">Follow-up queue</h3>
        {report.followUp.length > 0 ? (
          <ul>
            {report.followUp.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p>No follow-up items remain.</p>
        )}
      </section>

      <div className={styles.privacyPanel}>
        <ShieldCheck size={20} aria-hidden="true" />
        <div>
          <strong>Privacy-safe report</strong>
          <span>No names, record content, or private backup file are stored in this report.</span>
        </div>
      </div>

      <div className={styles.actionRow}>
        <button
          className="button button-primary"
          type="button"
          onClick={() =>
            downloadTextFile(
              `Classroom-v20-migration-completion-${report.sourceFingerprint}.json`,
              migrationAcceptanceJson(report),
              'application/json',
            )
          }
        >
          <Download size={18} aria-hidden="true" /> Download JSON report
        </button>
        <button
          className="button"
          type="button"
          onClick={() =>
            downloadTextFile(
              `Classroom-v20-migration-completion-${report.sourceFingerprint}.md`,
              migrationAcceptanceMarkdown(report),
              'text/markdown',
            )
          }
        >
          <Download size={18} aria-hidden="true" /> Download Markdown report
        </button>
      </div>
    </section>
  );
}

function formatExecutionError(reason: unknown): string {
  if (reason instanceof MigrationExecutionConflictError) {
    return `${reason.message} ${reason.conflicts.length} conflict(s) require review.`;
  }
  return reason instanceof Error ? reason.message : 'The migration action could not be completed.';
}

export function MigrationRoute() {
  const [scan, setScan] = useState<LegacyBackupScan | null>(null);
  const [plan, setPlan] = useState<ReversibleMigrationPlan | null>(null);
  const [rawBackupText, setRawBackupText] = useState<string | null>(null);
  const [execution, setExecution] = useState<MigrationExecutionResult | null>(null);
  const [acceptance, setAcceptance] = useState<MigrationAcceptanceReport | null>(null);
  const [legacySnapshotAtScan, setLegacySnapshotAtScan] = useState<LegacyStorageSnapshot | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [acceptanceError, setAcceptanceError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [commitConfirmed, setCommitConfirmed] = useState(false);
  const [rollbackConfirmed, setRollbackConfirmed] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [generatingAcceptance, setGeneratingAcceptance] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([getLatestMigrationExecution(), getLatestMigrationAcceptanceReport()])
      .then(([latestExecution, latestAcceptance]) => {
        if (!active) return;
        setExecution(latestExecution);
        if (
          latestExecution?.status === 'committed' &&
          latestAcceptance?.runId === latestExecution.runId
        ) {
          setAcceptance(latestAcceptance);
        }
      })
      .catch((reason) => {
        if (active) setError(formatExecutionError(reason));
      });
    return () => {
      active = false;
    };
  }, []);

  async function scanFile(file: File | undefined) {
    setScan(null);
    setPlan(null);
    setRawBackupText(null);
    setAcceptance(null);
    setError(null);
    setAcceptanceError(null);
    setFileName(file?.name ?? null);
    setCommitConfirmed(false);
    setLegacySnapshotAtScan(captureLegacyStorageSnapshot());
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
    setCommitConfirmed(false);

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

  async function runAcceptance(targetExecution: MigrationExecutionResult | null = execution) {
    if (!scan || !plan || !targetExecution || targetExecution.status !== 'committed') {
      setAcceptanceError(
        'Choose the same private backup and generate its reversible plan before running acceptance.',
      );
      return;
    }
    if (targetExecution.sourceFingerprint !== plan.sourceFingerprint) {
      setAcceptanceError('The selected backup does not match the committed migration run.');
      return;
    }

    setAcceptanceError(null);
    setGeneratingAcceptance(true);
    try {
      const report = await generateMigrationAcceptanceReport(
        scan,
        plan,
        targetExecution,
        undefined,
        {
          legacyStorageBefore: legacySnapshotAtScan ?? undefined,
          legacyStorageAfter: captureLegacyStorageSnapshot(),
        },
      );
      await saveMigrationAcceptanceReport(report);
      setAcceptance(report);
    } catch (reason) {
      setAcceptanceError(formatExecutionError(reason));
    } finally {
      setGeneratingAcceptance(false);
    }
  }

  async function commitPlan() {
    if (!plan || !commitConfirmed) return;
    setError(null);
    setAcceptanceError(null);
    setCommitting(true);

    try {
      const result = await commitMigrationPlan(plan);
      setExecution(result);
      setCommitConfirmed(false);
      setRollbackConfirmed(false);
      await runAcceptance(result);
    } catch (reason) {
      setError(formatExecutionError(reason));
    } finally {
      setCommitting(false);
    }
  }

  async function rollbackExecution() {
    if (!execution || execution.status !== 'committed' || !rollbackConfirmed) return;
    setError(null);
    setRollingBack(true);

    try {
      const result = await rollbackMigrationRun(execution.runId);
      setExecution(result);
      setAcceptance(null);
      setAcceptanceError(null);
      setRollbackConfirmed(false);
    } catch (reason) {
      setError(formatExecutionError(reason));
    } finally {
      setRollingBack(false);
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

  const alreadyCommitted = Boolean(
    plan &&
    execution?.status === 'committed' &&
    execution.sourceFingerprint === plan.sourceFingerprint,
  );
  const canGenerateAcceptance = Boolean(scan && plan && alreadyCommitted);
  const activeAcceptance =
    execution?.status === 'committed' && acceptance?.runId === execution.runId ? acceptance : null;

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">System</p>
          <h1 className="page-title">Migration center</h1>
          <p className="page-subtitle">
            Review a private backup locally, create a reversible migration plan, and keep completion
            evidence in privacy-safe JSON and Markdown reports. Legacy <code>cos-*</code> storage
            remains read-only.
          </p>
        </div>
      </header>

      <div className={styles.grid}>
        <article className={`card ${styles.uploadCard}`}>
          <ShieldCheck size={30} aria-hidden="true" />
          <h2>Scan, plan, and confirm</h2>
          <p>
            Select your private full backup JSON. The browser reads it locally, validates supported
            stores, and prepares reversible operations before any write is enabled.
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
            scan, plan, or execution report.
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
                  <strong>No data was written during scan or planning.</strong>
                  <span>Scanner write operations: {scan.writeOperations}</span>
                </div>
              </div>

              {plan && (
                <PlanReport
                  plan={plan}
                  onDiscard={() => {
                    setPlan(null);
                    setCommitConfirmed(false);
                  }}
                  onCommit={commitPlan}
                  commitConfirmed={commitConfirmed}
                  onCommitConfirmed={setCommitConfirmed}
                  committing={committing}
                  alreadyCommitted={alreadyCommitted}
                />
              )}
            </div>
          )}
        </article>
      </div>

      {execution && (
        <ExecutionReport
          execution={execution}
          rollbackConfirmed={rollbackConfirmed}
          onRollbackConfirmed={setRollbackConfirmed}
          onRollback={rollbackExecution}
          rollingBack={rollingBack}
          canGenerateAcceptance={canGenerateAcceptance}
          generatingAcceptance={generatingAcceptance}
          acceptanceReady={Boolean(activeAcceptance)}
          onGenerateAcceptance={() => runAcceptance()}
        />
      )}

      {acceptanceError && (
        <section className={`card ${styles.acceptanceError}`} aria-live="polite">
          <Notice icon={AlertTriangle} tone="error">
            {acceptanceError}
          </Notice>
        </section>
      )}

      {activeAcceptance && <AcceptanceReportCard report={activeAcceptance} />}
    </section>
  );
}

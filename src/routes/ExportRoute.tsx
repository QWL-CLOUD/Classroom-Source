import {
  AlertTriangle,
  Download,
  FileCheck2,
  HardDriveDownload,
  History,
  RotateCcw,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';

import type { BackupSnapshot } from '@/domain/models/entities';
import {
  backupFileName,
  buildRestorePreview,
  MAX_BACKUP_FILE_BYTES,
  serializeBackupEnvelope,
  type RestorePreview,
} from '@/features/backupRecovery/backupFormat';
import {
  backupRecoveryService,
  type RestoreCommitResult,
} from '@/features/backupRecovery/backupService';

import styles from './ExportRoute.module.css';

function downloadTextFile(fileName: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function readableTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'The backup operation could not be completed.';
}

export function ExportRoute() {
  const safetySnapshots = useLiveQuery(() => backupRecoveryService.listSafetySnapshots(), []);
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [busy, setBusy] = useState<'export' | 'restore' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lastRestore, setLastRestore] = useState<RestoreCommitResult | null>(null);

  function resetPreview(nextPreview: RestorePreview, label: string): void {
    setPreview(nextPreview);
    setSourceLabel(label);
    setReviewConfirmed(false);
    setReplaceConfirmed(false);
    setLastRestore(null);
    setError(null);
    setMessage(null);
  }

  async function exportBackup(): Promise<void> {
    if (busy) return;
    setBusy('export');
    setError(null);
    setMessage(null);
    try {
      const envelope = await backupRecoveryService.createBackup();
      downloadTextFile(backupFileName(envelope.exportedAt), serializeBackupEnvelope(envelope));
      setMessage(
        `Downloaded a complete local backup with ${Object.values(envelope.tableCounts).reduce(
          (total, count) => total + count,
          0,
        )} records.`,
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function chooseFile(file: File | undefined): Promise<void> {
    if (!file) return;
    setError(null);
    setMessage(null);
    if (file.size > MAX_BACKUP_FILE_BYTES) {
      setError('This backup is larger than the 100 MB local restore limit.');
      return;
    }
    try {
      resetPreview(buildRestorePreview(await file.text()), file.name);
    } catch (cause) {
      setPreview(null);
      setSourceLabel(null);
      setError(errorMessage(cause));
    }
  }

  function previewSafetySnapshot(snapshot: BackupSnapshot): void {
    try {
      resetPreview(
        buildRestorePreview(snapshot.payloadJson),
        `Safety backup from ${readableTimestamp(snapshot.createdAt)}`,
      );
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  function downloadSafetySnapshot(snapshot: BackupSnapshot): void {
    const previewed = buildRestorePreview(snapshot.payloadJson);
    downloadTextFile(backupFileName(previewed.exportedAt), snapshot.payloadJson);
  }

  async function commitRestore(): Promise<void> {
    if (!preview || busy || !reviewConfirmed || !replaceConfirmed) return;
    if (
      !window.confirm(
        `Replace the current Classroom data with ${preview.validRecordCount} validated records?\n\nA safety backup of the current database will be saved automatically before any records are replaced.`,
      )
    ) {
      return;
    }
    setBusy('restore');
    setError(null);
    setMessage(null);
    try {
      const result = await backupRecoveryService.restore(preview);
      setLastRestore(result);
      setMessage(
        `Restored ${result.restoredRecordCount} records atomically. ${result.quarantineCount} record${
          result.quarantineCount === 1 ? '' : 's'
        } were isolated for review.`,
      );
      setPreview(null);
      setSourceLabel(null);
      setReviewConfirmed(false);
      setReplaceConfirmed(false);
    } catch (cause) {
      setError(
        `${errorMessage(cause)} The restore transaction was rolled back, so the current Classroom data was not partially replaced.`,
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Settings &amp; Data</p>
          <h1 className="page-title">Backup &amp; Recovery</h1>
          <p className="page-subtitle">
            Download a versioned local backup, validate every restore before writing, and preserve
            an automatic safety copy before current data is replaced.
          </p>
        </div>
        <button
          className="button button-primary"
          type="button"
          onClick={() => void exportBackup()}
          disabled={busy !== null}
        >
          <HardDriveDownload size={18} aria-hidden="true" />
          {busy === 'export' ? 'Preparing backup…' : 'Download full backup'}
        </button>
      </header>

      <div className={styles.privacyNote}>
        <ShieldCheck size={20} aria-hidden="true" />
        <div>
          <strong>Local and explicit</strong>
          <span>
            Backup files contain your Classroom content. They are generated and read in this
            browser; local file paths, temporary workbook data, and internal safety snapshots are
            not exported.
          </span>
        </div>
      </div>

      {error ? (
        <div className={styles.error} role="alert">
          <AlertTriangle size={18} aria-hidden="true" /> {error}
        </div>
      ) : null}
      {message ? (
        <div className={styles.success} role="status">
          <FileCheck2 size={18} aria-hidden="true" /> {message}
        </div>
      ) : null}

      <div className={styles.topGrid}>
        <section className={`card ${styles.infoCard}`} aria-labelledby="backup-export-heading">
          <div className={styles.cardHeading}>
            <Download size={20} aria-hidden="true" />
            <div>
              <h2 id="backup-export-heading">Portable full backup</h2>
              <p>
                All current Classroom user records, edit history, migration records, and settings.
              </p>
            </div>
          </div>
          <dl className={styles.definitionList}>
            <div>
              <dt>Format</dt>
              <dd>Classroom v20 JSON</dd>
            </div>
            <div>
              <dt>Integrity</dt>
              <dd>Record counts and content hash</dd>
            </div>
            <div>
              <dt>Storage</dt>
              <dd>Downloaded only when you choose</dd>
            </div>
          </dl>
        </section>

        <section className={`card ${styles.infoCard}`} aria-labelledby="safety-heading">
          <div className={styles.cardHeading}>
            <History size={20} aria-hidden="true" />
            <div>
              <h2 id="safety-heading">Automatic safety backups</h2>
              <p>The five most recent pre-restore snapshots stay in this browser.</p>
            </div>
          </div>
          {safetySnapshots === undefined ? (
            <p className={styles.muted} role="status">
              Reading safety backups…
            </p>
          ) : safetySnapshots.length === 0 ? (
            <p className={styles.muted}>No restore has created a safety backup yet.</p>
          ) : (
            <div className={styles.snapshotList}>
              {safetySnapshots.map((snapshot) => (
                <article key={snapshot.id} className={styles.snapshotRow}>
                  <div>
                    <strong>{readableTimestamp(snapshot.createdAt)}</strong>
                    <span>{snapshot.recordCount} records</span>
                  </div>
                  <div className={styles.inlineActions}>
                    <button
                      className="button"
                      type="button"
                      onClick={() => downloadSafetySnapshot(snapshot)}
                    >
                      <Download size={15} aria-hidden="true" /> Download
                    </button>
                    <button
                      className="button"
                      type="button"
                      onClick={() => previewSafetySnapshot(snapshot)}
                    >
                      <RotateCcw size={15} aria-hidden="true" /> Preview restore
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className={`card ${styles.restoreCard}`} aria-labelledby="restore-heading">
        <div className={styles.restoreHeader}>
          <div>
            <p className="page-eyebrow">Reviewed restore</p>
            <h2 id="restore-heading">Validate before replacing data</h2>
            <p>
              Selecting a file only builds a preview. No database records are written until both
              confirmations are checked and the final restore is approved.
            </p>
          </div>
          <label className={styles.filePicker}>
            <Upload size={18} aria-hidden="true" />
            <span>Choose Classroom backup</span>
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => void chooseFile(event.target.files?.[0])}
            />
          </label>
        </div>

        {preview ? (
          <div className={styles.preview}>
            <div className={styles.previewTitle}>
              <div>
                <h3>Restore preview</h3>
                <p>{sourceLabel}</p>
              </div>
              <span className={styles.schemaBadge}>Schema {preview.databaseSchemaVersion}</span>
            </div>

            <div className={styles.summaryGrid} aria-label="Restore preview summary">
              <article>
                <strong>{preview.validRecordCount}</strong>
                <span>Validated records</span>
              </article>
              <article>
                <strong>{preview.quarantineCount}</strong>
                <span>Quarantined records</span>
              </article>
              <article>
                <strong>
                  {preview.tableSummaries.filter((table) => table.sourceCount > 0).length}
                </strong>
                <span>Populated tables</span>
              </article>
            </div>

            {preview.warnings.length > 0 ? (
              <div className={styles.warning} role="status">
                <AlertTriangle size={18} aria-hidden="true" />
                <div>
                  {preview.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              </div>
            ) : null}

            <div
              className={styles.tableScroller}
              tabIndex={0}
              aria-label="Scrollable restore table preview"
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">Table</th>
                    <th scope="col">Source</th>
                    <th scope="col">Valid</th>
                    <th scope="col">Quarantine</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.tableSummaries.map((table) => (
                    <tr key={table.tableName}>
                      <th scope="row">{table.tableName}</th>
                      <td>{table.sourceCount}</td>
                      <td>{table.validCount}</td>
                      <td>{table.quarantinedCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {preview.quarantined.length > 0 ? (
              <details className={styles.quarantineDetails}>
                <summary>Review {preview.quarantineCount} isolated record(s)</summary>
                <div className={styles.quarantineList}>
                  {preview.quarantined.map((item, index) => (
                    <article key={`${item.tableName}:${item.recordKey ?? index}`}>
                      <strong>
                        {item.tableName}
                        {item.recordKey ? ` · ${item.recordKey}` : ''}
                      </strong>
                      <span>{item.reason}</span>
                    </article>
                  ))}
                </div>
              </details>
            ) : null}

            <div className={styles.confirmations}>
              <label>
                <input
                  type="checkbox"
                  checked={reviewConfirmed}
                  onChange={(event) => setReviewConfirmed(event.target.checked)}
                />
                <span>I reviewed the table counts, warnings, and quarantined records.</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={replaceConfirmed}
                  onChange={(event) => setReplaceConfirmed(event.target.checked)}
                />
                <span>
                  Replace the current Classroom user data with this validated backup after creating
                  a safety backup.
                </span>
              </label>
            </div>

            <button
              className="button button-primary"
              type="button"
              disabled={!reviewConfirmed || !replaceConfirmed || busy !== null}
              onClick={() => void commitRestore()}
            >
              <RotateCcw size={17} aria-hidden="true" />
              {busy === 'restore' ? 'Restoring atomically…' : 'Restore validated backup'}
            </button>
          </div>
        ) : (
          <div className={styles.emptyPreview}>
            <Upload size={24} aria-hidden="true" />
            <strong>No restore preview yet</strong>
            <span>Choose a Classroom v20 JSON backup or load a saved safety backup.</span>
          </div>
        )}
      </section>

      {lastRestore ? (
        <section className={`card ${styles.completionCard}`} aria-label="Restore completed safely">
          <FileCheck2 size={22} aria-hidden="true" />
          <div>
            <h2>Restore completed safely</h2>
            <p>
              The pre-restore state is retained as a safety backup from{' '}
              {readableTimestamp(lastRestore.safetySnapshot.createdAt)}.
            </p>
          </div>
          <button
            className="button"
            type="button"
            onClick={() => downloadSafetySnapshot(lastRestore.safetySnapshot)}
          >
            <Download size={16} aria-hidden="true" /> Download safety backup
          </button>
        </section>
      ) : null}
    </section>
  );
}

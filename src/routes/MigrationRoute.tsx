import { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileJson, ShieldCheck } from 'lucide-react';
import {
  scanLegacyBackupJson,
  type LegacyBackupScan,
} from '@/features/migration/legacyBackupScanner';
import styles from './MigrationRoute.module.css';

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

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">System</p>
          <h1 className="page-title">Migration preview</h1>
          <p className="page-subtitle">
            Phase 0 can inspect the outer structure of a legacy backup. It does not write any
            records and never modifies old <code>cos-*</code> storage.
          </p>
        </div>
      </header>

      <div className={styles.grid}>
        <article className={`card ${styles.uploadCard}`}>
          <ShieldCheck size={30} />
          <h2>Read-only scan</h2>
          <p>Select your private full backup JSON. The browser reads it locally.</p>
          <label className="button button-primary">
            <FileJson size={18} /> Choose backup
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => scanFile(event.target.files?.[0])}
            />
          </label>
          {fileName && <p className={styles.fileName}>Selected: {fileName}</p>}
        </article>

        <article className={`card ${styles.reportCard}`} aria-live="polite">
          <h2>Scan report</h2>
          {!scan && !error && <p>No file has been scanned.</p>}
          {error && (
            <div className={styles.error}>
              <AlertTriangle size={20} />
              <span>{error}</span>
            </div>
          )}
          {scan && (
            <div className={styles.report}>
              <div className={styles.success}>
                <CheckCircle2 size={20} /> Backup envelope is readable
              </div>
              <dl>
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
              </dl>
              {scan.recognizedStores.length > 0 && (
                <details>
                  <summary>Recognized legacy stores</summary>
                  <ul>
                    {scan.recognizedStores.map((store) => (
                      <li key={store}>{store}</li>
                    ))}
                  </ul>
                </details>
              )}
              {scan.warnings.map((warning) => (
                <div className={styles.warning} key={warning}>
                  <AlertTriangle size={18} /> {warning}
                </div>
              ))}
              <p className={styles.noWrite}>No data was written to IndexedDB.</p>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}

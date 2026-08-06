import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Database,
  Download,
  HardDrive,
  HeartPulse,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { classroomDb } from '@/data/db/ClassroomDatabase';
import type { CoreRecordCounts } from '@/domain/readModels/workspaceReadModels';
import {
  CLASSROOM_APP_VERSION,
  CLASSROOM_DATABASE_SCHEMA_VERSION,
} from '@/features/backupRecovery/backupFormat';
import {
  createSystemHealthReport,
  inspectBrowserStorage,
  requestBrowserStoragePersistence,
  serializeSystemHealthReport,
  systemHealthReportFileName,
  type BrowserStorageSnapshot,
} from '@/features/systemHealth/systemHealthReport';
import { useWorkspaceDataSummary } from '@/features/workspace/useWorkspaceReadModel';

import {
  buildLiveHealthChecks,
  EXPECTED_SCHEMA_VERSION,
  type HealthCheckTone,
} from './systemHealthPresentation';
import styles from './SystemHealthRoute.module.css';

const countLabels: ReadonlyArray<[keyof CoreRecordCounts, string]> = [
  ['schoolYears', 'School years'],
  ['learnerContexts', 'Learner contexts'],
  ['learnerNotices', 'Learner notices'],
  ['scheduleBlocks', 'Schedule blocks'],
  ['calendarEvents', 'Calendar events'],
  ['lessonPlans', 'Lesson plans'],
  ['sessions', 'Sessions'],
  ['tasks', 'Tasks'],
  ['reminders', 'Reminders'],
  ['migrationRuns', 'Migration runs'],
  ['quarantine', 'Quarantine records'],
];

const configuredSafeguards = [
  { name: 'React source application', detail: 'Native React route and component tree' },
  { name: 'Hash route registry', detail: 'Workspace and editor routes are registered explicitly' },
  { name: 'IndexedDB namespace isolation', detail: 'Database name: classroom-v20' },
  { name: 'Repository-backed read models', detail: 'Typed v20 queries with explicit read states' },
  {
    name: 'Root recovery boundary',
    detail: 'Unexpected render failures open a safe recovery view',
  },
  { name: 'Read-only legacy scan', detail: 'No automatic cos-* writes or deletions' },
  {
    name: 'Privacy source scan',
    detail: 'Known backup files and private-data signatures are blocked from source commits',
  },
];

type StorageViewState = { status: 'checking' } | BrowserStorageSnapshot;

function CheckIcon({ tone }: { tone: HealthCheckTone }) {
  if (tone === 'ready') return <CheckCircle2 size={20} aria-hidden="true" />;
  if (tone === 'checking') return <CircleDashed size={20} aria-hidden="true" />;
  return <AlertTriangle size={20} aria-hidden="true" />;
}

function storageTone(storage: StorageViewState): HealthCheckTone {
  if (storage.status === 'checking') return 'checking';
  if (storage.status === 'persistent') return 'ready';
  if (storage.status === 'best-effort' || storage.status === 'unsupported') return 'attention';
  return 'error';
}

function storageLabel(storage: StorageViewState): string {
  if (storage.status === 'checking') return 'Checking';
  if (storage.status === 'persistent') return 'Persistent';
  if (storage.status === 'best-effort') return 'Best effort';
  if (storage.status === 'unsupported') return 'Unsupported';
  return 'Unavailable';
}

function readableBytes(value: number | undefined): string | null {
  if (value === undefined) return null;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function downloadTextFile(fileName: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'The diagnostic could not be completed.';
}

export function SystemHealthRoute() {
  const summaryState = useWorkspaceDataSummary();
  const liveChecks = buildLiveHealthChecks(summaryState, classroomDb.verno);
  const databaseCheck = liveChecks.find((check) => check.id === 'database')!;
  const schoolYearCheck = liveChecks.find((check) => check.id === 'active-school-year')!;
  const [storage, setStorage] = useState<StorageViewState>({ status: 'checking' });
  const [busy, setBusy] = useState<'report' | 'persistence' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void inspectBrowserStorage().then((snapshot) => {
      if (active) setStorage(snapshot);
    });
    return () => {
      active = false;
    };
  }, []);

  async function downloadDiagnostic(): Promise<void> {
    if (busy) return;
    setBusy('report');
    setError(null);
    setMessage(null);
    try {
      const storageSnapshot =
        storage.status === 'checking' ? await inspectBrowserStorage() : storage;
      const report = await createSystemHealthReport(classroomDb, { storage: storageSnapshot });
      downloadTextFile(
        systemHealthReportFileName(report.generatedAt),
        serializeSystemHealthReport(report),
      );
      setMessage('Downloaded a privacy-safe System Health report with counts and statuses only.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function requestPersistence(): Promise<void> {
    if (busy) return;
    setBusy('persistence');
    setError(null);
    setMessage(null);
    const next = await requestBrowserStoragePersistence();
    setStorage(next);
    setBusy(null);
    setMessage(
      next.status === 'persistent'
        ? 'The browser now reports persistent storage.'
        : 'The browser kept best-effort storage. Continue making portable backups.',
    );
  }

  const storageUsage =
    storage.status === 'checking'
      ? null
      : [readableBytes(storage.usageBytes), readableBytes(storage.quotaBytes)].every(Boolean)
        ? `${readableBytes(storage.usageBytes)} used of ${readableBytes(storage.quotaBytes)}`
        : null;

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Settings &amp; Data</p>
          <h1 className="page-title">System Health</h1>
          <p className="page-subtitle">
            Verify the local repository, browser storage, schema, and release version. Download a
            privacy-safe diagnostic report without exporting record content.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            className="button button-primary"
            type="button"
            disabled={busy !== null}
            onClick={() => void downloadDiagnostic()}
          >
            <Download size={18} aria-hidden="true" />
            {busy === 'report' ? 'Preparing report…' : 'Download diagnostic report'}
          </button>
          <Link className="button" to="/export">
            <ShieldCheck size={18} aria-hidden="true" /> Backup &amp; Recovery
          </Link>
        </div>
      </header>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className={styles.success} role="status">
          {message}
        </p>
      ) : null}

      <div className={styles.summaryGrid}>
        <article className="card" data-tone={databaseCheck.tone}>
          <Database size={25} aria-hidden="true" />
          <span>Database</span>
          <strong>{databaseCheck.statusLabel}</strong>
        </article>
        <article className="card" data-tone={schoolYearCheck.tone}>
          <CheckIcon tone={schoolYearCheck.tone} />
          <span>Active school year</span>
          <strong>{schoolYearCheck.statusLabel}</strong>
        </article>
        <article
          className="card"
          data-tone={classroomDb.verno === EXPECTED_SCHEMA_VERSION ? 'ready' : 'attention'}
        >
          <ShieldCheck size={25} aria-hidden="true" />
          <span>Schema version</span>
          <strong>{classroomDb.verno}</strong>
        </article>
        <article className="card" data-tone="ready">
          <HeartPulse size={25} aria-hidden="true" />
          <span>App version</span>
          <strong>{CLASSROOM_APP_VERSION}</strong>
        </article>
        <article className="card" data-tone={storageTone(storage)}>
          <HardDrive size={25} aria-hidden="true" />
          <span>Browser storage</span>
          <strong>{storageLabel(storage)}</strong>
        </article>
      </div>

      <section className={`card ${styles.healthCard}`} aria-labelledby="live-checks-heading">
        <h2 id="live-checks-heading">Live checks</h2>
        <ul>
          {liveChecks.map((check) => (
            <li key={check.id} data-tone={check.tone}>
              <CheckIcon tone={check.tone} />
              <div>
                <strong>{check.name}</strong>
                <span>{check.detail}</span>
              </div>
              <em>{check.statusLabel}</em>
            </li>
          ))}
          <li data-tone={storageTone(storage)}>
            <CheckIcon tone={storageTone(storage)} />
            <div>
              <strong>Browser storage policy</strong>
              <span>
                {storage.status === 'checking'
                  ? 'Reading browser storage capabilities.'
                  : storage.detail}
                {storageUsage ? ` ${storageUsage}.` : ''}
              </span>
            </div>
            <em>{storageLabel(storage)}</em>
          </li>
        </ul>
        {storage.status !== 'checking' && storage.canRequestPersistence ? (
          <button
            className="button"
            type="button"
            disabled={busy !== null}
            onClick={() => void requestPersistence()}
          >
            <HardDrive size={17} aria-hidden="true" />
            {busy === 'persistence' ? 'Requesting…' : 'Request persistent storage'}
          </button>
        ) : null}
      </section>

      <section
        className={`card ${styles.healthCard}`}
        aria-labelledby="configured-safeguards-heading"
      >
        <h2 id="configured-safeguards-heading">Configured safeguards</h2>
        <p className={styles.sectionIntro}>
          These safeguards are part of the application architecture. “Configured” does not claim
          that a fresh diagnostic test was run on this screen.
        </p>
        <ul>
          {configuredSafeguards.map((safeguard) => (
            <li key={safeguard.name} data-tone="configured">
              <ShieldCheck size={20} aria-hidden="true" />
              <div>
                <strong>{safeguard.name}</strong>
                <span>{safeguard.detail}</span>
              </div>
              <em>Configured</em>
            </li>
          ))}
        </ul>
      </section>

      <section className={`card ${styles.healthCard}`} aria-labelledby="record-counts-heading">
        <h2 id="record-counts-heading">Current v20 record counts</h2>
        <p className={styles.sectionIntro}>
          This compact view shows core counts. The downloaded diagnostic includes counts for all
          portable and recovery tables without names, IDs, or record content.
        </p>
        {summaryState.status === 'loading' ? (
          <p aria-live="polite">Reading IndexedDB…</p>
        ) : summaryState.status === 'error' ? (
          <p className={styles.error} role="alert">
            Unable to read IndexedDB: {summaryState.message}
          </p>
        ) : (
          <>
            <div
              className={styles.activeSchoolYear}
              data-tone={schoolYearCheck.tone}
              role={schoolYearCheck.tone === 'attention' ? 'status' : undefined}
            >
              <div>
                <span>Active school year</span>
                <strong>{summaryState.data.activeSchoolYear?.label ?? 'None configured'}</strong>
                {summaryState.data.activeSchoolYear ? (
                  <small>
                    {summaryState.data.activeSchoolYear.startsOn} through{' '}
                    {summaryState.data.activeSchoolYear.endsOn}
                  </small>
                ) : (
                  <small>Classroom expects exactly one active school year.</small>
                )}
              </div>
              {summaryState.data.activeSchoolYearCount !== 1 ? (
                <Link className="button button-secondary" to="/settings#school-years">
                  Manage school years
                </Link>
              ) : null}
            </div>
            <dl className={styles.counts}>
              {countLabels.map(([name, label]) => (
                <div key={name}>
                  <dt>{label}</dt>
                  <dd>{summaryState.data.counts[name]}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </section>

      <p className={styles.versionNote}>
        Classroom {CLASSROOM_APP_VERSION} · Database schema {CLASSROOM_DATABASE_SCHEMA_VERSION}
      </p>
    </section>
  );
}

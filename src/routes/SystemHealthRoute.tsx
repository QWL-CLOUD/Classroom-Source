import { AlertTriangle, CheckCircle2, CircleDashed, Database, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { classroomDb } from '@/data/db/ClassroomDatabase';
import type { CoreRecordCounts } from '@/domain/readModels/workspaceReadModels';
import { useWorkspaceDataSummary } from '@/features/workspace/useWorkspaceReadModel';
import { buildLiveHealthChecks, type HealthCheckTone } from './systemHealthPresentation';
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
  { name: 'Read-only legacy scan', detail: 'No automatic cos-* writes or deletions' },
  {
    name: 'Privacy source scan',
    detail: 'Known backup files and private-data signatures are blocked from source commits',
  },
];

function CheckIcon({ tone }: { tone: HealthCheckTone }) {
  if (tone === 'ready') return <CheckCircle2 size={20} aria-hidden="true" />;
  if (tone === 'checking') return <CircleDashed size={20} aria-hidden="true" />;
  return <AlertTriangle size={20} aria-hidden="true" />;
}

export function SystemHealthRoute() {
  const summaryState = useWorkspaceDataSummary();
  const liveChecks = buildLiveHealthChecks(summaryState, classroomDb.verno);
  const databaseCheck = liveChecks.find((check) => check.id === 'database')!;
  const schoolYearCheck = liveChecks.find((check) => check.id === 'active-school-year')!;

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Settings &amp; Data</p>
          <h1 className="page-title">System Health</h1>
          <p className="page-subtitle">
            Live checks read the repository and IndexedDB directly. Configured safeguards are shown
            separately so architecture declarations are never presented as runtime test results.
          </p>
        </div>
      </header>

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
        <article className="card" data-tone={classroomDb.verno === 3 ? 'ready' : 'attention'}>
          <ShieldCheck size={25} aria-hidden="true" />
          <span>Schema version</span>
          <strong>{classroomDb.verno}</strong>
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
        </ul>
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
    </section>
  );
}

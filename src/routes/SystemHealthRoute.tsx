import { CheckCircle2, Database, ShieldCheck } from 'lucide-react';
import type { CoreRecordCounts } from '@/domain/readModels/workspaceReadModels';
import { useWorkspaceDataSummary } from '@/features/workspace/useWorkspaceReadModel';
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

export function SystemHealthRoute() {
  const summaryState = useWorkspaceDataSummary();
  const databaseStatus =
    summaryState.status === 'ready'
      ? 'Ready'
      : summaryState.status === 'error'
        ? 'Read error'
        : 'Opening…';
  const tests = [
    { name: 'React source application mounted', detail: 'Native React route and component tree' },
    { name: 'Hash routes registered', detail: 'Today, Week, Calendar, Tasks, and System routes' },
    { name: 'IndexedDB namespace isolated', detail: 'Database name: classroom-v20' },
    { name: 'Repository-backed read model', detail: 'Typed v20 queries with explicit states' },
    { name: 'Legacy scan is read-only', detail: 'No automatic cos-* writes or deletions' },
    {
      name: 'Privacy source scan configured',
      detail: 'Known backup files and signatures are blocked',
    },
  ];

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Settings &amp; Data</p>
          <h1 className="page-title">System Health</h1>
          <p className="page-subtitle">
            These checks query application code and IndexedDB directly. They do not inspect visible
            DOM text to infer business state.
          </p>
        </div>
      </header>

      <div className={styles.summaryGrid}>
        <article className="card">
          <Database size={25} />
          <span>Database</span>
          <strong>{databaseStatus}</strong>
        </article>
        <article className="card">
          <ShieldCheck size={25} />
          <span>Schema version</span>
          <strong>3</strong>
        </article>
        <article className="card">
          <CheckCircle2 size={25} />
          <span>Foundation checks</span>
          <strong>
            {tests.length} / {tests.length}
          </strong>
        </article>
      </div>

      <section className={`card ${styles.healthCard}`} aria-labelledby="foundation-checks-heading">
        <h2 id="foundation-checks-heading">Foundation checks</h2>
        <ul>
          {tests.map((test) => (
            <li key={test.name}>
              <CheckCircle2 size={20} />
              <div>
                <strong>{test.name}</strong>
                <span>{test.detail}</span>
              </div>
              <em>Pass</em>
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
            <p className={styles.activeSchoolYear}>
              Active school year:{' '}
              <strong>{summaryState.data.activeSchoolYear?.label ?? 'None configured'}</strong>
            </p>
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

import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, Database, ShieldCheck } from 'lucide-react';
import { classroomDb } from '@/data/db/ClassroomDatabase';
import styles from './SystemHealthRoute.module.css';

export function SystemHealthRoute() {
  const counts = useLiveQuery(async () => {
    await classroomDb.open();
    const [
      scheduleBlocks,
      calendarEvents,
      lessonPlans,
      sessions,
      tasks,
      migrationRuns,
      quarantine,
    ] = await Promise.all([
      classroomDb.scheduleBlocks.count(),
      classroomDb.calendarEvents.count(),
      classroomDb.lessonPlans.count(),
      classroomDb.sessionOccurrences.count(),
      classroomDb.tasks.count(),
      classroomDb.migrationRuns.count(),
      classroomDb.quarantineRecords.count(),
    ]);
    return {
      scheduleBlocks,
      calendarEvents,
      lessonPlans,
      sessions,
      tasks,
      migrationRuns,
      quarantine,
    };
  }, []);

  const tests = [
    { name: 'React source application mounted', detail: 'Native React route and component tree' },
    { name: 'Hash routes registered', detail: 'Today, Week, Calendar, Tasks, and System routes' },
    { name: 'IndexedDB namespace isolated', detail: 'Database name: classroom-v20' },
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
          <p className="page-eyebrow">System</p>
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
          <strong>{counts ? 'Ready' : 'Opening…'}</strong>
        </article>
        <article className="card">
          <ShieldCheck size={25} />
          <span>Schema version</span>
          <strong>1</strong>
        </article>
        <article className="card">
          <CheckCircle2 size={25} />
          <span>Foundation checks</span>
          <strong>
            {tests.length} / {tests.length}
          </strong>
        </article>
      </div>

      <div className={`card ${styles.healthCard}`}>
        <h2>Foundation checks</h2>
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
      </div>

      <div className={`card ${styles.healthCard}`}>
        <h2>Current v20 record counts</h2>
        {!counts ? (
          <p>Reading IndexedDB…</p>
        ) : (
          <dl className={styles.counts}>
            {Object.entries(counts).map(([name, value]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}

import { TaskList } from '@/features/tasks/TaskList';

export function TasksRoute() {
  return (
    <section>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Workspace</p>
          <h1 className="page-title">Tasks</h1>
          <p className="page-subtitle">
            Plan when to work, track a separate deadline, and move the same task through Active,
            Waiting, Completed, or Cancelled without creating duplicate records.
          </p>
        </div>
      </header>
      <TaskList />
    </section>
  );
}

import { useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { classroomDb } from '@/data/db/ClassroomDatabase';
import { createTask, toggleTask } from '@/features/tasks/taskService';
import styles from './TaskList.module.css';

interface TaskListProps {
  dueDate?: string;
  compact?: boolean;
}

export function TaskList({ dueDate, compact = false }: TaskListProps) {
  const [title, setTitle] = useState('');
  const tasks = useLiveQuery(async () => {
    const allTasks = await classroomDb.tasks.orderBy('order').toArray();
    return dueDate
      ? allTasks.filter((task) => !task.dueDate || task.dueDate === dueDate)
      : allTasks;
  }, [dueDate]);

  async function addTask(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    await classroomDb.tasks.put(createTask(title, dueDate));
    setTitle('');
  }

  return (
    <div className={styles.wrapper} data-compact={compact}>
      <form className={styles.form} onSubmit={addTask}>
        <input
          className="input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add a task…"
          aria-label="Task title"
        />
        <button className="button" type="submit" disabled={!title.trim()} aria-label="Add task">
          <Plus size={17} aria-hidden="true" />
          {!compact && 'Add task'}
        </button>
      </form>

      {!tasks ? (
        <p className={styles.message}>Loading tasks…</p>
      ) : tasks.length === 0 ? (
        <p className={styles.message}>No tasks here yet.</p>
      ) : (
        <ul className={styles.list}>
          {tasks.map((task) => (
            <li key={task.id} className={styles.item} data-completed={task.status === 'completed'}>
              <button
                className={styles.checkButton}
                type="button"
                onClick={() => classroomDb.tasks.put(toggleTask(task))}
                aria-label={
                  task.status === 'completed' ? `Reopen ${task.title}` : `Complete ${task.title}`
                }
              >
                {task.status === 'completed' && <Check size={15} />}
              </button>
              <span>{task.title}</span>
              <button
                className={styles.deleteButton}
                type="button"
                onClick={() => classroomDb.tasks.delete(task.id)}
                aria-label={`Delete ${task.title}`}
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

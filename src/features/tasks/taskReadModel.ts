import { taskSchema, type Task, type TaskStatus } from '@/domain/models/entities';

export interface TaskSection {
  status: TaskStatus;
  label: string;
  tasks: Task[];
}

export interface TaskWorkspaceReadModel {
  sections: TaskSection[];
  total: number;
}

const statusLabels: Record<TaskStatus, string> = {
  active: 'Active',
  waiting: 'Waiting',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function compareOptionalDate(first: string | undefined, second: string | undefined): number {
  if (first && second) return first.localeCompare(second);
  if (first) return -1;
  if (second) return 1;
  return 0;
}

function compareOptionalMinute(first: number | undefined, second: number | undefined): number {
  if (first !== undefined && second !== undefined) return first - second;
  if (first !== undefined) return -1;
  if (second !== undefined) return 1;
  return 0;
}

export function compareOpenTasks(first: Task, second: Task): number {
  return (
    compareOptionalDate(first.scheduledDate, second.scheduledDate) ||
    compareOptionalMinute(first.scheduledMinute, second.scheduledMinute) ||
    compareOptionalDate(first.dueDate, second.dueDate) ||
    compareOptionalMinute(first.dueMinute, second.dueMinute) ||
    first.order - second.order ||
    first.title.localeCompare(second.title) ||
    first.id.localeCompare(second.id)
  );
}

export function compareClosedTasks(first: Task, second: Task): number {
  return (
    second.updatedAt.localeCompare(first.updatedAt) ||
    first.order - second.order ||
    first.title.localeCompare(second.title) ||
    first.id.localeCompare(second.id)
  );
}

export function buildTaskWorkspaceReadModel(values: readonly Task[]): TaskWorkspaceReadModel {
  const tasks = values.map((value) => taskSchema.parse(value));
  const statuses: TaskStatus[] = ['active', 'waiting', 'completed', 'cancelled'];
  const sections = statuses.map((status): TaskSection => {
    const matching = tasks.filter((task) => task.status === status);
    matching.sort(
      status === 'active' || status === 'waiting' ? compareOpenTasks : compareClosedTasks,
    );
    return { status, label: statusLabels[status], tasks: matching };
  });
  return { sections, total: tasks.length };
}

export function selectTodayTasks(values: readonly Task[], selectedDate: string): Task[] {
  return values
    .map((value) => taskSchema.parse(value))
    .filter((task) => task.status === 'active' && task.scheduledDate === selectedDate)
    .sort(compareOpenTasks);
}

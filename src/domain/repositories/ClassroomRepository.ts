import type { Task } from '@/domain/models/entities';

export interface ClassroomRepository {
  listTasks(): Promise<Task[]>;
  putTask(task: Task): Promise<void>;
  deleteTask(id: string): Promise<void>;
  countCoreRecords(): Promise<Record<string, number>>;
}

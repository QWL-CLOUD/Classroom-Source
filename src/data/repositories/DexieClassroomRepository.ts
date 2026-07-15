import { classroomDb } from '@/data/db/ClassroomDatabase';
import type { ClassroomRepository } from '@/domain/repositories/ClassroomRepository';
import { taskSchema, type Task } from '@/domain/models/entities';

export class DexieClassroomRepository implements ClassroomRepository {
  async listTasks(): Promise<Task[]> {
    return classroomDb.tasks.orderBy('order').toArray();
  }

  async putTask(task: Task): Promise<void> {
    await classroomDb.tasks.put(taskSchema.parse(task));
  }

  async deleteTask(id: string): Promise<void> {
    await classroomDb.tasks.delete(id);
  }

  async countCoreRecords(): Promise<Record<string, number>> {
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
  }
}

export const classroomRepository = new DexieClassroomRepository();

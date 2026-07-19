import { useLiveQuery } from 'dexie-react-hooks';

import { classroomDb } from '@/data/db/ClassroomDatabase';

import { buildAgendaReadModel, type AgendaReadModel } from './agendaReadModel';

export function useAgendaReadModel(selectedDate: string): AgendaReadModel | undefined {
  return useLiveQuery(async () => {
    const [
      tasks,
      reminders,
      calendarEvents,
      learnerNotices,
      learnerContexts,
      sessions,
      lessonPlans,
    ] = await Promise.all([
      classroomDb.tasks.toArray(),
      classroomDb.reminders.toArray(),
      classroomDb.calendarEvents.toArray(),
      classroomDb.learnerNotices.toArray(),
      classroomDb.learnerContexts.toArray(),
      classroomDb.sessionOccurrences.toArray(),
      classroomDb.lessonPlans.toArray(),
    ]);
    return buildAgendaReadModel(
      {
        tasks,
        reminders,
        calendarEvents,
        learnerNotices,
        learnerContexts,
        sessions,
        lessonPlans,
      },
      selectedDate,
    );
  }, [selectedDate]);
}

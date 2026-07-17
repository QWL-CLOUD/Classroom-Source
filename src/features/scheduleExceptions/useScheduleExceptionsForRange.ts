import { useLiveQuery } from 'dexie-react-hooks';

import { classroomRepository } from '@/data/repositories/DexieClassroomRepository';

export function useScheduleExceptionsForRange(startDate: string, endDate: string) {
  return useLiveQuery(
    () =>
      classroomRepository.listScheduleExceptionsForRange({
        startDate,
        endDate,
      }),
    [startDate, endDate],
  );
}

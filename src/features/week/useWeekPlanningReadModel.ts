import { useLiveQuery } from 'dexie-react-hooks';

import { classroomRepository } from '@/data/repositories/DexieClassroomRepository';
import type { LocalDateRange, WorkspaceReadState } from '@/domain/readModels/workspaceReadModels';
import type { ClassroomRepository } from '@/domain/repositories/ClassroomRepository';
import { toReadErrorMessage } from '@/features/workspace/workspaceReadService';

import { loadWeekPlanningSnapshot, type WeekPlanningSnapshot } from './weekPlanningReadService';

export function useWeekPlanningReadModel(
  range: LocalDateRange,
  repository: ClassroomRepository = classroomRepository,
): WorkspaceReadState<WeekPlanningSnapshot> {
  const state = useLiveQuery(async (): Promise<WorkspaceReadState<WeekPlanningSnapshot>> => {
    try {
      return {
        status: 'ready',
        data: await loadWeekPlanningSnapshot(repository, range),
      };
    } catch (error) {
      return { status: 'error', message: toReadErrorMessage(error) };
    }
  }, [repository, range.startDate, range.endDate]);

  return state ?? { status: 'loading' };
}

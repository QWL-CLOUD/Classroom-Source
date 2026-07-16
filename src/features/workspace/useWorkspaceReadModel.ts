import { useLiveQuery } from 'dexie-react-hooks';
import { classroomRepository } from '@/data/repositories/DexieClassroomRepository';
import type {
  LearnerContextQuery,
  LocalDateRange,
  WorkspaceDataSummary,
  WorkspaceReadSnapshot,
  WorkspaceReadState,
} from '@/domain/readModels/workspaceReadModels';
import type { ClassroomRepository } from '@/domain/repositories/ClassroomRepository';
import { loadWorkspaceReadSnapshot, toReadErrorMessage } from './workspaceReadService';

export function useWorkspaceReadModel(
  range: LocalDateRange,
  learnerQuery: LearnerContextQuery = {},
  repository: ClassroomRepository = classroomRepository,
): WorkspaceReadState<WorkspaceReadSnapshot> {
  const state = useLiveQuery(async (): Promise<WorkspaceReadState<WorkspaceReadSnapshot>> => {
    try {
      return {
        status: 'ready',
        data: await loadWorkspaceReadSnapshot(repository, range, learnerQuery),
      };
    } catch (error) {
      return { status: 'error', message: toReadErrorMessage(error) };
    }
  }, [
    repository,
    range.startDate,
    range.endDate,
    learnerQuery.schoolYearId,
    learnerQuery.kind,
    learnerQuery.status,
  ]);

  return state ?? { status: 'loading' };
}

export function useWorkspaceDataSummary(
  repository: ClassroomRepository = classroomRepository,
): WorkspaceReadState<WorkspaceDataSummary> {
  const state = useLiveQuery(async (): Promise<WorkspaceReadState<WorkspaceDataSummary>> => {
    try {
      return { status: 'ready', data: await repository.getWorkspaceDataSummary() };
    } catch (error) {
      return { status: 'error', message: toReadErrorMessage(error) };
    }
  }, [repository]);

  return state ?? { status: 'loading' };
}

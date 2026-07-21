import { useLiveQuery } from 'dexie-react-hooks';
import { classroomRepository } from '@/data/repositories/DexieClassroomRepository';
import type { SchoolYear } from '@/domain/models/entities';
import type { ClassroomRepository } from '@/domain/repositories/ClassroomRepository';
import { toReadErrorMessage } from '@/features/workspace/workspaceReadService';

export type ActiveSchoolYearState =
  | { status: 'loading' }
  | { status: 'ready'; data: SchoolYear | null }
  | { status: 'error'; message: string };

export function useActiveSchoolYear(
  repository: ClassroomRepository = classroomRepository,
): ActiveSchoolYearState {
  const state = useLiveQuery(async (): Promise<ActiveSchoolYearState> => {
    try {
      return { status: 'ready', data: await repository.getActiveSchoolYear() };
    } catch (error) {
      return { status: 'error', message: toReadErrorMessage(error) };
    }
  }, [repository]);

  return state ?? { status: 'loading' };
}

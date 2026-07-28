import { useLiveQuery } from 'dexie-react-hooks';

import type { WorkspaceReadState } from '@/domain/readModels/workspaceReadModels';
import { toReadErrorMessage } from '@/features/workspace/workspaceReadService';

import {
  studentDirectoryReadService,
  type StudentDirectorySnapshot,
} from './studentDirectoryReadService';

export function useStudentDirectory(
  selectedStudentId?: string,
): WorkspaceReadState<StudentDirectorySnapshot> {
  const state = useLiveQuery(async (): Promise<WorkspaceReadState<StudentDirectorySnapshot>> => {
    try {
      return {
        status: 'ready',
        data: await studentDirectoryReadService.load(selectedStudentId),
      };
    } catch (error) {
      return { status: 'error', message: toReadErrorMessage(error) };
    }
  }, [selectedStudentId]);

  return state ?? { status: 'loading' };
}

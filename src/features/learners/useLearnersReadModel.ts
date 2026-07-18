import { useLiveQuery } from 'dexie-react-hooks';

import { classroomRepository } from '@/data/repositories/DexieClassroomRepository';
import type { LearnerContext } from '@/domain/models/entities';
import type { LearnersReadSnapshot } from '@/domain/readModels/learnerReadModels';
import type { WorkspaceReadState } from '@/domain/readModels/workspaceReadModels';
import type { ClassroomRepository } from '@/domain/repositories/ClassroomRepository';
import { toReadErrorMessage } from '@/features/workspace/workspaceReadService';

import { loadLearnersReadSnapshot } from './learnersReadService';

export function useLearnersReadModel(
  requestedContextId?: string,
  preferredStatus: LearnerContext['status'] = 'active',
  repository: ClassroomRepository = classroomRepository,
): WorkspaceReadState<LearnersReadSnapshot> {
  const state = useLiveQuery(async (): Promise<WorkspaceReadState<LearnersReadSnapshot>> => {
    try {
      return {
        status: 'ready',
        data: await loadLearnersReadSnapshot(repository, requestedContextId, preferredStatus),
      };
    } catch (error) {
      return { status: 'error', message: toReadErrorMessage(error) };
    }
  }, [repository, requestedContextId, preferredStatus]);

  return state ?? { status: 'loading' };
}

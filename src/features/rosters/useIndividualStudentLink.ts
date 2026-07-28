import { useLiveQuery } from 'dexie-react-hooks';

import type { LearnerContext, StudentRecord } from '@/domain/models/entities';
import type { WorkspaceReadState } from '@/domain/readModels/workspaceReadModels';
import { toReadErrorMessage } from '@/features/workspace/workspaceReadService';

import { rosterReadService } from './rosterReadService';

export interface IndividualStudentLinkData {
  context: LearnerContext;
  linkedStudent?: StudentRecord;
  activeStudents: StudentRecord[];
}

export function useIndividualStudentLink(
  contextId: string,
): WorkspaceReadState<IndividualStudentLinkData> {
  const state = useLiveQuery(async (): Promise<WorkspaceReadState<IndividualStudentLinkData>> => {
    try {
      const [snapshot, activeStudents] = await Promise.all([
        rosterReadService.loadContextRoster(contextId),
        rosterReadService.listStudents('active'),
      ]);

      if (snapshot.context.kind !== 'individual') {
        throw new Error('Only an Individual context can use a Student link.');
      }

      return {
        status: 'ready',
        data: {
          context: snapshot.context,
          linkedStudent: snapshot.linkedStudent,
          activeStudents,
        },
      };
    } catch (error) {
      return { status: 'error', message: toReadErrorMessage(error) };
    }
  }, [contextId]);

  return state ?? { status: 'loading' };
}

import { useLiveQuery } from 'dexie-react-hooks';

import type { StudentRecord } from '@/domain/models/entities';
import type { WorkspaceReadState } from '@/domain/readModels/workspaceReadModels';
import { toReadErrorMessage } from '@/features/workspace/workspaceReadService';

import { rosterReadService, type ContextRosterSnapshot } from './rosterReadService';

export interface RosterWorkspaceData {
  snapshot: ContextRosterSnapshot;
  activeStudents: StudentRecord[];
}

export function useRosterWorkspace(contextId: string): WorkspaceReadState<RosterWorkspaceData> {
  const state = useLiveQuery(async (): Promise<WorkspaceReadState<RosterWorkspaceData>> => {
    try {
      const [snapshot, activeStudents] = await Promise.all([
        rosterReadService.loadContextRoster(contextId),
        rosterReadService.listStudents('active'),
      ]);
      return {
        status: 'ready',
        data: { snapshot, activeStudents },
      };
    } catch (error) {
      return { status: 'error', message: toReadErrorMessage(error) };
    }
  }, [contextId]);

  return state ?? { status: 'loading' };
}

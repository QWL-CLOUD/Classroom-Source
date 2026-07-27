import { useLiveQuery } from 'dexie-react-hooks';

import type { StudentRecord } from '@/domain/models/entities';
import type { WorkspaceReadState } from '@/domain/readModels/workspaceReadModels';
import { toReadErrorMessage } from '@/features/workspace/workspaceReadService';

import { rosterReadService, type ContextRosterSnapshot } from './rosterReadService';

export interface RosterWorkspaceData {
  snapshot: ContextRosterSnapshot;
  activeStudents: StudentRecord[];
  allStudents: StudentRecord[];
}

function compareStudents(first: StudentRecord, second: StudentRecord): number {
  return (
    (first.preferredName ?? first.name).localeCompare(second.preferredName ?? second.name) ||
    first.name.localeCompare(second.name) ||
    first.id.localeCompare(second.id)
  );
}

export function useRosterWorkspace(contextId: string): WorkspaceReadState<RosterWorkspaceData> {
  const state = useLiveQuery(async (): Promise<WorkspaceReadState<RosterWorkspaceData>> => {
    try {
      const [snapshot, activeStudents, archivedStudents] = await Promise.all([
        rosterReadService.loadContextRoster(contextId),
        rosterReadService.listStudents('active'),
        rosterReadService.listStudents('archived'),
      ]);
      return {
        status: 'ready',
        data: {
          snapshot,
          activeStudents,
          allStudents: [...activeStudents, ...archivedStudents].sort(compareStudents),
        },
      };
    } catch (error) {
      return { status: 'error', message: toReadErrorMessage(error) };
    }
  }, [contextId]);

  return state ?? { status: 'loading' };
}

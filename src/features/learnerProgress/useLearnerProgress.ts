import { useLiveQuery } from 'dexie-react-hooks';

import { toReadErrorMessage } from '@/features/workspace/workspaceReadService';
import { todayLocalDate } from '@/shared/dates/localDate';

import {
  learnerProgressReadService,
  type LearnerProgressReadResult,
  type LearnerProgressReadService,
} from './learnerProgressReadService';

export type LearnerProgressState =
  | { status: 'loading' }
  | { status: 'ready'; data: LearnerProgressReadResult }
  | { status: 'error'; message: string };

export function useLearnerProgress(
  schoolYearId?: string,
  asOfDate = todayLocalDate(),
  service: LearnerProgressReadService = learnerProgressReadService,
): LearnerProgressState {
  const state = useLiveQuery(async (): Promise<LearnerProgressState> => {
    try {
      return { status: 'ready', data: await service.load({ schoolYearId, asOfDate }) };
    } catch (error) {
      return { status: 'error', message: toReadErrorMessage(error) };
    }
  }, [service, schoolYearId, asOfDate]);

  return state ?? { status: 'loading' };
}

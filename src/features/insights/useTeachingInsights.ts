import { useLiveQuery } from 'dexie-react-hooks';

import { todayLocalDate } from '@/shared/dates/localDate';
import { toReadErrorMessage } from '@/features/workspace/workspaceReadService';

import {
  teachingInsightsReadService,
  type TeachingInsightsReadResult,
  type TeachingInsightsReadService,
} from './teachingInsightsReadService';

export type TeachingInsightsState =
  | { status: 'loading' }
  | { status: 'ready'; data: TeachingInsightsReadResult }
  | { status: 'error'; message: string };

export function useTeachingInsights(
  schoolYearId?: string,
  asOfDate = todayLocalDate(),
  service: TeachingInsightsReadService = teachingInsightsReadService,
): TeachingInsightsState {
  const state = useLiveQuery(async (): Promise<TeachingInsightsState> => {
    try {
      return {
        status: 'ready',
        data: await service.load({ schoolYearId, asOfDate }),
      };
    } catch (error) {
      return { status: 'error', message: toReadErrorMessage(error) };
    }
  }, [service, schoolYearId, asOfDate]);

  return state ?? { status: 'loading' };
}

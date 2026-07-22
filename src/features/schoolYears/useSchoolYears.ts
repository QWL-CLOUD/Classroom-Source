import { useLiveQuery } from 'dexie-react-hooks';

import {
  schoolYearReadService,
  type SchoolYearReadModel,
  type SchoolYearReadService,
} from '@/features/schoolYears/schoolYearReadService';
import { toReadErrorMessage } from '@/features/workspace/workspaceReadService';

export type SchoolYearsState =
  | { status: 'loading' }
  | { status: 'ready'; data: SchoolYearReadModel }
  | { status: 'error'; message: string };

export function useSchoolYears(
  service: SchoolYearReadService = schoolYearReadService,
): SchoolYearsState {
  const state = useLiveQuery(async (): Promise<SchoolYearsState> => {
    try {
      return { status: 'ready', data: await service.load() };
    } catch (error) {
      return { status: 'error', message: toReadErrorMessage(error) };
    }
  }, [service]);

  return state ?? { status: 'loading' };
}

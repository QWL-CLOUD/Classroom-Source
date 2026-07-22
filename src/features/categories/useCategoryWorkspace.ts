import { useLiveQuery } from 'dexie-react-hooks';

import type { CategoryFamilyId } from '@/domain/models/entities';
import { toReadErrorMessage } from '@/features/workspace/workspaceReadService';

import { categoryReadService, type CategoryReadService } from './categoryReadService';
import type { CategoryWorkspaceItem } from './categoryWorkspacePresentation';

export type CategoryWorkspaceState =
  | { status: 'loading' }
  | { status: 'ready'; items: CategoryWorkspaceItem[] }
  | { status: 'error'; message: string };

export function useCategoryWorkspace(
  familyId: CategoryFamilyId,
  service: CategoryReadService = categoryReadService,
): CategoryWorkspaceState {
  const state = useLiveQuery(async (): Promise<CategoryWorkspaceState> => {
    try {
      const values = await service.listValues(familyId, {
        includeArchived: true,
        includeMerged: true,
      });
      const items = await Promise.all(
        values.map(async (value): Promise<CategoryWorkspaceItem> => ({
          value,
          usage: await service.getUsageSummary(value.id),
        })),
      );
      return { status: 'ready', items };
    } catch (error) {
      return { status: 'error', message: toReadErrorMessage(error) };
    }
  }, [familyId, service]);

  return state ?? { status: 'loading' };
}

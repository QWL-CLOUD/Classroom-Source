import { describe, expect, it, vi } from 'vitest';

import type { LearnerContext, SchoolYear } from '@/domain/models/entities';
import type { ClassroomRepository } from '@/domain/repositories/ClassroomRepository';

import { loadLearnersReadSnapshot } from './learnersReadService';

function createRepository(overrides: Partial<ClassroomRepository> = {}): ClassroomRepository {
  return {
    listTasks: vi.fn().mockResolvedValue([]),
    putTask: vi.fn().mockResolvedValue(undefined),
    deleteTask: vi.fn().mockResolvedValue(undefined),
    getActiveSchoolYear: vi.fn().mockResolvedValue(null),
    listScheduleBlocksForRange: vi.fn().mockResolvedValue([]),
    listCalendarEventsForRange: vi.fn().mockResolvedValue([]),
    listLearnerContexts: vi.fn().mockResolvedValue([]),
    listLessonPlans: vi.fn().mockResolvedValue([]),
    listSessionOccurrences: vi.fn().mockResolvedValue([]),
    countQuarantineRecords: vi.fn().mockResolvedValue(0),
    countCoreRecords: vi.fn().mockResolvedValue({
      schoolYears: 0,
      learnerContexts: 0,
      scheduleBlocks: 0,
      calendarEvents: 0,
      lessonPlans: 0,
      sessions: 0,
      tasks: 0,
      migrationRuns: 0,
      quarantine: 0,
    }),
    getWorkspaceDataSummary: vi.fn().mockResolvedValue({
      activeSchoolYear: null,
      counts: {
        schoolYears: 0,
        learnerContexts: 0,
        scheduleBlocks: 0,
        calendarEvents: 0,
        lessonPlans: 0,
        sessions: 0,
        tasks: 0,
        migrationRuns: 0,
        quarantine: 0,
      },
    }),
    ...overrides,
  };
}

describe('loadLearnersReadSnapshot', () => {
  it('scopes active contexts to the active school year and loads the requested context', async () => {
    const schoolYear: SchoolYear = {
      id: 'school-year-current',
      label: '2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      active: true,
    };
    const contexts: LearnerContext[] = [
      {
        id: 'class-context',
        kind: 'class',
        name: 'Synthetic class',
        schoolYearId: schoolYear.id,
        status: 'active',
      },
      {
        id: 'group-context',
        kind: 'group',
        name: 'Synthetic group',
        schoolYearId: schoolYear.id,
        status: 'active',
      },
    ];
    const listLearnerContexts = vi.fn().mockResolvedValue(contexts);
    const listLessonPlans = vi.fn().mockResolvedValue([]);
    const listSessionOccurrences = vi.fn().mockResolvedValue([]);
    const repository = createRepository({
      getActiveSchoolYear: vi.fn().mockResolvedValue(schoolYear),
      listLearnerContexts,
      listLessonPlans,
      listSessionOccurrences,
    });

    const result = await loadLearnersReadSnapshot(repository, 'group-context');

    expect(listLearnerContexts).toHaveBeenCalledWith({
      schoolYearId: 'school-year-current',
    });
    expect(result.selectedContext?.id).toBe('group-context');
    expect(listLessonPlans).toHaveBeenCalledWith({
      contextId: 'group-context',
    });
    expect(listSessionOccurrences).toHaveBeenCalledWith({
      contextId: 'group-context',
    });
  });

  it('falls back to the first active context and avoids planning queries when none exist', async () => {
    const firstContext: LearnerContext = {
      id: 'first-context',
      kind: 'class',
      name: 'First context',
      schoolYearId: 'school-year-current',
      status: 'active',
    };
    const repositoryWithContext = createRepository({
      listLearnerContexts: vi.fn().mockResolvedValue([firstContext]),
    });
    const repositoryWithoutContexts = createRepository();

    const fallback = await loadLearnersReadSnapshot(repositoryWithContext, 'missing-context');
    const empty = await loadLearnersReadSnapshot(repositoryWithoutContexts);

    expect(fallback.selectedContext?.id).toBe('first-context');
    expect(empty).toMatchObject({
      selectedContext: null,
      lessonPlans: [],
      sessions: [],
    });
  });
});

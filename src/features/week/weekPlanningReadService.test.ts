import { describe, expect, it, vi } from 'vitest';

import type { ClassroomRepository } from '@/domain/repositories/ClassroomRepository';

import { loadWeekPlanningSnapshot } from './weekPlanningReadService';

function repositoryStub(): ClassroomRepository {
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
  };
}

describe('weekPlanningReadService', () => {
  it('loads plans and only the sessions inside the requested week', async () => {
    const repository = repositoryStub();
    const range = { startDate: '2026-07-13', endDate: '2026-07-19' };

    await expect(loadWeekPlanningSnapshot(repository, range)).resolves.toEqual({
      lessonPlans: [],
      sessionOccurrences: [],
    });
    expect(repository.listLessonPlans).toHaveBeenCalledWith();
    expect(repository.listSessionOccurrences).toHaveBeenCalledWith(range);
  });
});

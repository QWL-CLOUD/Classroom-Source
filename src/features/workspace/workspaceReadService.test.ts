import { describe, expect, it, vi } from 'vitest';
import type {
  CalendarEvent,
  LearnerContext,
  ScheduleBlock,
  SchoolYear,
} from '@/domain/models/entities';
import type { ClassroomRepository } from '@/domain/repositories/ClassroomRepository';
import { loadWorkspaceReadSnapshot, toReadErrorMessage } from './workspaceReadService';

function createRepository(overrides: Partial<ClassroomRepository> = {}): ClassroomRepository {
  return {
    listTasks: vi.fn().mockResolvedValue([]),
    putTask: vi.fn().mockResolvedValue(undefined),
    deleteTask: vi.fn().mockResolvedValue(undefined),
    getActiveSchoolYear: vi.fn().mockResolvedValue(null),
    listScheduleBlocks: vi.fn().mockResolvedValue([]),
    listScheduleBlocksForRange: vi.fn().mockResolvedValue([]),
    listCalendarEventsForRange: vi.fn().mockResolvedValue([]),
    listLearnerContexts: vi.fn().mockResolvedValue([]),
    listLessonSeries: vi.fn().mockResolvedValue([]),
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

describe('workspaceReadService', () => {
  it('loads one snapshot and scopes learners to the active school year', async () => {
    const schoolYear: SchoolYear = {
      id: 'school-year-current',
      label: '2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      active: true,
    };
    const scheduleBlocks: ScheduleBlock[] = [];
    const calendarEvents: CalendarEvent[] = [];
    const learnerContexts: LearnerContext[] = [];
    const listLearnerContexts = vi.fn().mockResolvedValue(learnerContexts);
    const repository = createRepository({
      getActiveSchoolYear: vi.fn().mockResolvedValue(schoolYear),
      listScheduleBlocksForRange: vi.fn().mockResolvedValue(scheduleBlocks),
      listCalendarEventsForRange: vi.fn().mockResolvedValue(calendarEvents),
      listLearnerContexts,
      countQuarantineRecords: vi.fn().mockResolvedValue(17),
    });
    const range = { startDate: '2026-07-13', endDate: '2026-07-19' };

    const snapshot = await loadWorkspaceReadSnapshot(repository, range, {
      kind: 'class',
    });

    expect(listLearnerContexts).toHaveBeenCalledWith({
      kind: 'class',
      schoolYearId: 'school-year-current',
    });
    expect(snapshot).toEqual({
      activeSchoolYear: schoolYear,
      scheduleBlocks,
      calendarEvents,
      learnerContexts,
      quarantineCount: 17,
    });
  });

  it('preserves an explicit learner school-year scope', async () => {
    const listLearnerContexts = vi.fn().mockResolvedValue([]);
    const repository = createRepository({
      getActiveSchoolYear: vi.fn().mockResolvedValue({
        id: 'school-year-current',
        label: '2026–2027',
        startsOn: '2026-07-01',
        endsOn: '2027-06-30',
        active: true,
      }),
      listLearnerContexts,
    });

    await loadWorkspaceReadSnapshot(
      repository,
      { startDate: '2026-07-13', endDate: '2026-07-19' },
      { schoolYearId: 'school-year-archive' },
    );

    expect(listLearnerContexts).toHaveBeenCalledWith({
      schoolYearId: 'school-year-archive',
    });
  });

  it('normalizes unknown read errors without hiding Error messages', () => {
    expect(toReadErrorMessage(new Error('IndexedDB unavailable'))).toBe('IndexedDB unavailable');
    expect(toReadErrorMessage('failed')).toBe('Unable to read Classroom data.');
  });
});

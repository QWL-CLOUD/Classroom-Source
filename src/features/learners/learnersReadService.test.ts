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
    listSchoolYears: vi.fn().mockResolvedValue([]),
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
      activeSchoolYearCount: 0,
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
    const archivedContext: LearnerContext = {
      id: 'archived-context',
      kind: 'individual',
      name: 'Archived learner',
      schoolYearId: schoolYear.id,
      status: 'archived',
    };
    const listLearnerContexts = vi
      .fn()
      .mockImplementation((query) =>
        Promise.resolve(query?.status === 'archived' ? [archivedContext] : contexts),
      );
    const listLessonSeries = vi.fn().mockResolvedValue([]);
    const listLessonPlans = vi.fn().mockResolvedValue([]);
    const listSessionOccurrences = vi.fn().mockResolvedValue([]);
    const repository = createRepository({
      getActiveSchoolYear: vi.fn().mockResolvedValue(schoolYear),
      listSchoolYears: vi.fn().mockResolvedValue([schoolYear]),
      listLearnerContexts,
      listLessonSeries,
      listLessonPlans,
      listSessionOccurrences,
    });

    const result = await loadLearnersReadSnapshot(repository, 'group-context');

    expect(listLearnerContexts).toHaveBeenNthCalledWith(1, {
      schoolYearId: 'school-year-current',
      status: 'active',
    });
    expect(listLearnerContexts).toHaveBeenNthCalledWith(2, {
      schoolYearId: 'school-year-current',
      status: 'archived',
    });
    expect(result.contexts.map((context) => context.id)).toEqual([
      'class-context',
      'group-context',
      'archived-context',
    ]);
    expect(result.selectedContext?.id).toBe('group-context');
    expect(listLessonSeries).toHaveBeenCalledWith({
      contextId: 'group-context',
    });
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
      lessonSeries: [],
      lessonPlans: [],
      sessions: [],
    });
  });

  it('loads an archived context when requested and prefers archived contexts for that view', async () => {
    const activeContext: LearnerContext = {
      id: 'active-context',
      kind: 'class',
      name: 'Active context',
      schoolYearId: 'school-year-current',
      status: 'active',
    };
    const archivedContext: LearnerContext = {
      id: 'archived-context',
      kind: 'group',
      name: 'Archived context',
      schoolYearId: 'school-year-current',
      status: 'archived',
    };
    const repository = createRepository({
      listLearnerContexts: vi
        .fn()
        .mockImplementation((query) =>
          Promise.resolve(query?.status === 'archived' ? [archivedContext] : [activeContext]),
        ),
    });

    const preferred = await loadLearnersReadSnapshot(repository, undefined, 'archived');
    const requested = await loadLearnersReadSnapshot(repository, 'archived-context');

    expect(preferred.selectedContext?.id).toBe('archived-context');
    expect(requested.selectedContext?.id).toBe('archived-context');
  });
  it('loads a requested historical school year without changing the active year', async () => {
    const activeYear: SchoolYear = {
      id: 'school-year-current',
      label: '2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      active: true,
    };
    const historicalYear: SchoolYear = {
      id: 'school-year-history',
      label: '2025–2026',
      startsOn: '2025-07-01',
      endsOn: '2026-06-30',
      active: false,
      lifecycleState: 'archived',
    };
    const listLearnerContexts = vi.fn().mockResolvedValue([]);
    const repository = createRepository({
      getActiveSchoolYear: vi.fn().mockResolvedValue(activeYear),
      listSchoolYears: vi.fn().mockResolvedValue([activeYear, historicalYear]),
      listLearnerContexts,
    });

    const result = await loadLearnersReadSnapshot(
      repository,
      undefined,
      'active',
      historicalYear.id,
    );

    expect(result.activeSchoolYear?.id).toBe(historicalYear.id);
    expect(listLearnerContexts).toHaveBeenNthCalledWith(1, {
      schoolYearId: historicalYear.id,
      status: 'active',
    });
  });
});

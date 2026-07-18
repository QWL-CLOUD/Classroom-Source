import { describe, expect, it } from 'vitest';

import type {
  LessonPlan,
  LessonSeries,
  ScheduleBlock,
  SessionOccurrence,
} from '@/domain/models/entities';

import { buildSeriesBumpPreview } from './seriesBumpPlanner';

const series: LessonSeries = {
  id: 'series',
  contextId: 'context',
  title: 'Synthetic unit',
  subject: 'Language',
};

const block: ScheduleBlock = {
  id: 'block',
  contextId: 'context',
  title: 'Language block',
  subject: 'Language',
  category: 'Teaching',
  kind: 'teachable',
  weekdays: [5],
  startMinute: 540,
  endMinute: 600,
  effectiveFrom: '2026-07-01',
  effectiveTo: '2026-08-31',
  planningEnabled: true,
  bumpEnabled: true,
  showInWeek: true,
  sortOrder: 0,
};

function plan(id: string, title: string, sequence: number): LessonPlan {
  return {
    id,
    contextId: 'context',
    title,
    subject: 'Language',
    workflowState: 'ready',
    seriesId: 'series',
    sequence,
    preferredScheduleBlockId: 'block',
    createdAt: `2026-07-01T00:00:0${sequence}.000Z`,
    updatedAt: `2026-07-01T00:00:0${sequence}.000Z`,
  };
}

function session(id: string, lessonPlanId: string, date: string): SessionOccurrence {
  return {
    id,
    lessonPlanId,
    contextId: 'context',
    scheduleBlockId: 'block',
    date,
    startMinute: 540,
    endMinute: 600,
    deliveryState: 'scheduled',
  };
}

describe('series bump planner', () => {
  it('skips a cancelled Friday and uses an added Saturday occurrence', () => {
    const firstPlan = plan('plan-1', 'Lesson one', 0);
    const secondPlan = plan('plan-2', 'Lesson two', 1);
    const firstSession = session('session-1', firstPlan.id, '2026-07-17');
    const secondSession = session('session-2', secondPlan.id, '2026-07-31');

    const preview = buildSeriesBumpPreview({
      selectedSession: firstSession,
      selectedPlan: firstPlan,
      series,
      seriesPlans: [firstPlan, secondPlan],
      sessions: [firstSession, secondSession],
      scheduleBlock: block,
      scheduleExceptions: [
        {
          id: 'cancel-friday',
          date: '2026-07-24',
          scheduleBlockId: 'block',
          action: 'cancel',
        },
        {
          id: 'add-saturday',
          date: '2026-07-25',
          scheduleBlockId: 'block',
          action: 'add',
          replacementStartMinute: 600,
          replacementEndMinute: 660,
        },
      ],
    });

    expect(preview.canCommit).toBe(true);
    expect(preview.items).toMatchObject([
      {
        planTitle: 'Lesson one',
        fromDate: '2026-07-17',
        toDate: '2026-07-25',
        toStartMinute: 600,
        toEndMinute: 660,
        adjustedOccurrence: true,
      },
      {
        planTitle: 'Lesson two',
        fromDate: '2026-07-31',
        toDate: '2026-08-07',
        toStartMinute: 540,
        toEndMinute: 600,
      },
    ]);
  });

  it('blocks a target occupied by a session outside the affected series range', () => {
    const firstPlan = plan('plan-1', 'Lesson one', 0);
    const firstSession = session('session-1', firstPlan.id, '2026-07-17');
    const collision = session('collision', 'another-plan', '2026-07-24');

    const preview = buildSeriesBumpPreview({
      selectedSession: firstSession,
      selectedPlan: firstPlan,
      series,
      seriesPlans: [firstPlan],
      sessions: [firstSession, collision],
      scheduleBlock: block,
      scheduleExceptions: [],
    });

    expect(preview.canCommit).toBe(false);
    expect(preview.blockingIssues).toContain(
      '2026-07-24 is already occupied by another session in Language block.',
    );
  });
});

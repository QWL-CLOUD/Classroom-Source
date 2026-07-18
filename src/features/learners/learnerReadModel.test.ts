import { describe, expect, it } from 'vitest';

import type {
  LearnerContext,
  LessonPlan,
  SchoolYear,
  SessionOccurrence,
} from '@/domain/models/entities';
import type { LearnersReadSnapshot } from '@/domain/readModels/learnerReadModels';

import { buildLearnersPageReadModel } from './learnerReadModel';

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
    name: 'Synthetic Grade 3',
    schoolYearId: schoolYear.id,
    status: 'active',
  },
  {
    id: 'group-context',
    kind: 'group',
    name: 'Synthetic reading group',
    schoolYearId: schoolYear.id,
    status: 'active',
  },
  {
    id: 'individual-context',
    kind: 'individual',
    name: 'Synthetic learner',
    schoolYearId: schoolYear.id,
    status: 'active',
  },
];

function lessonPlan(
  id: string,
  title: string,
  workflowState: LessonPlan['workflowState'],
  updatedAt: string,
): LessonPlan {
  return {
    id,
    contextId: 'class-context',
    title,
    subject: 'Synthetic subject',
    workflowState,
    createdAt: '2026-07-01T12:00:00.000Z',
    updatedAt,
  };
}

function session(
  id: string,
  lessonPlanId: string,
  date: string,
  deliveryState: SessionOccurrence['deliveryState'],
): SessionOccurrence {
  return {
    id,
    lessonPlanId,
    contextId: 'class-context',
    date,
    startMinute: 540,
    endMinute: 600,
    deliveryState,
  };
}

function snapshot(
  lessonPlans: LessonPlan[],
  sessions: SessionOccurrence[],
  lessonSeries: LearnersReadSnapshot['lessonSeries'] = [],
): LearnersReadSnapshot {
  return {
    activeSchoolYear: schoolYear,
    contexts,
    selectedContext: contexts[0]!,
    lessonSeries,
    lessonPlans,
    sessions,
  };
}

describe('buildLearnersPageReadModel', () => {
  it('groups Classes, Groups, and Individuals in a stable order', () => {
    const model = buildLearnersPageReadModel(snapshot([], []), '2026-07-15');

    expect(model.contextGroups.map((group) => group.label)).toEqual([
      'Classes',
      'Groups',
      'Individuals',
    ]);
    expect(model.contextCounts).toEqual({ class: 1, group: 1, individual: 1 });
    expect(model.selectedContext?.id).toBe('class-context');
    expect(model.activeSchoolYearLabel).toBe('2026–2027');
  });

  it('shows future scheduled sessions in Upcoming and sorts them chronologically', () => {
    const plans = [
      lessonPlan('plan-later', 'Later lesson', 'ready', '2026-07-10T12:00:00.000Z'),
      lessonPlan('plan-first', 'First lesson', 'ready', '2026-07-10T12:00:00.000Z'),
      lessonPlan('plan-past', 'Past scheduled lesson', 'ready', '2026-07-10T12:00:00.000Z'),
    ];
    const sessions = [
      session('session-later', 'plan-later', '2026-07-22', 'scheduled'),
      session('session-first', 'plan-first', '2026-07-20', 'scheduled'),
      session('session-past', 'plan-past', '2026-07-10', 'scheduled'),
    ];

    const model = buildLearnersPageReadModel(snapshot(plans, sessions), '2026-07-15');

    expect(model.upcomingItems.map((item) => item.title)).toEqual(['First lesson', 'Later lesson']);
    expect(model.upcomingItems[0]).toMatchObject({
      date: '2026-07-20',
      dateLabel: 'Monday, July 20, 2026',
      timeLabel: '9:00 AM–10:00 AM',
      weekHref: '#/week?date=2026-07-20&view=everything&focus=session-occurrence%3Asession-first',
      calendarHref: '#/calendar?date=2026-07-20',
      stateLabel: 'Scheduled',
    });
  });

  it('keeps a visible scheduled lesson series intact across the From boundary', () => {
    const series = {
      id: 'series-boundary',
      contextId: 'class-context',
      title: 'Boundary Unit',
      subject: 'Synthetic subject',
      lifecycleState: 'active' as const,
    };
    const first = {
      ...lessonPlan('plan-before', 'Before From lesson', 'ready', '2026-07-10T12:00:00.000Z'),
      seriesId: series.id,
      sequence: 0,
    };
    const second = {
      ...lessonPlan('plan-after', 'After From lesson', 'ready', '2026-07-10T12:00:00.000Z'),
      seriesId: series.id,
      sequence: 1,
    };

    const model = buildLearnersPageReadModel(
      snapshot(
        [first, second],
        [
          session('session-before', first.id, '2026-07-17', 'scheduled'),
          session('session-after', second.id, '2026-07-24', 'scheduled'),
        ],
        [series],
      ),
      '2026-07-18',
    );

    expect(model.upcomingItems.map((item) => item.title)).toEqual([
      'Before From lesson',
      'After From lesson',
    ]);
  });

  it('summarizes inherited and customized lesson flow on planning cards', () => {
    const plan = {
      ...lessonPlan('plan-flow', 'Flow lesson', 'ready', '2026-07-10T12:00:00.000Z'),
      lessonFlow: [
        {
          id: 'step-one',
          title: 'Opening',
          phase: 'opening' as const,
          durationMinutes: 5,
        },
        {
          id: 'step-two',
          title: 'Practice',
          phase: 'guided-practice' as const,
          durationMinutes: 15,
        },
      ],
    };
    const scheduled = {
      ...session('session-flow', plan.id, '2026-07-20', 'scheduled'),
      contentOverride: {
        lessonFlow: [
          {
            id: 'custom-step',
            title: 'Custom practice',
            phase: 'guided-practice' as const,
            durationMinutes: 12,
          },
        ],
      },
    };

    const model = buildLearnersPageReadModel(snapshot([plan], [scheduled]), '2026-07-15');

    expect(model.upcomingItems[0]).toMatchObject({
      contentSummary: '1 step · 12 min',
      contentSourceLabel: 'Customized session',
    });
  });

  it('shows lesson-series names and stable positions across planning states', () => {
    const series = {
      id: 'series-one',
      contextId: 'class-context',
      title: 'Fractions Unit',
      subject: 'Math',
      lifecycleState: 'active' as const,
    };
    const first = {
      ...lessonPlan('plan-first', 'Equivalent fractions', 'ready', '2026-07-12T12:00:00.000Z'),
      seriesId: series.id,
      sequence: 0,
    };
    const second = {
      ...lessonPlan('plan-second', 'Compare fractions', 'ready', '2026-07-13T12:00:00.000Z'),
      seriesId: series.id,
      sequence: 1,
    };

    const model = buildLearnersPageReadModel(
      snapshot(
        [second, first],
        [session('session-first', first.id, '2026-07-20', 'scheduled')],
        [series],
      ),
      '2026-07-15',
    );

    expect(model.upcomingItems[0]).toMatchObject({
      seriesTitle: 'Fractions Unit',
      seriesPositionLabel: 'Lesson 1 of 2',
    });
    expect(model.unscheduledItems[0]).toMatchObject({
      title: 'Compare fractions',
      seriesTitle: 'Fractions Unit',
      seriesPositionLabel: 'Lesson 2 of 2',
    });
  });

  it('summarizes active and archived series with linked plan and session counts', () => {
    const activeSeries = {
      id: 'series-active',
      contextId: 'class-context',
      title: 'Active Unit',
      subject: 'Math',
      lifecycleState: 'active' as const,
    };
    const archivedSeries = {
      id: 'series-archived',
      contextId: 'class-context',
      title: 'Archived Unit',
      subject: 'Language',
      lifecycleState: 'archived' as const,
      archivedAt: '2026-07-20T12:00:00.000Z',
    };
    const activeFirst = {
      ...lessonPlan('active-first', 'Active first', 'ready', '2026-07-10T12:00:00.000Z'),
      seriesId: activeSeries.id,
      sequence: 0,
    };
    const activeSecond = {
      ...lessonPlan('active-second', 'Active second', 'ready', '2026-07-11T12:00:00.000Z'),
      seriesId: activeSeries.id,
      sequence: 1,
    };
    const archivedPlan = {
      ...lessonPlan('archived-plan', 'Archived lesson', 'ready', '2026-07-12T12:00:00.000Z'),
      seriesId: archivedSeries.id,
      sequence: 0,
    };

    const model = buildLearnersPageReadModel(
      snapshot(
        [activeFirst, activeSecond, archivedPlan],
        [
          session('active-session', activeFirst.id, '2026-07-20', 'scheduled'),
          session('archived-session', archivedPlan.id, '2026-07-10', 'completed'),
        ],
        [archivedSeries, activeSeries],
      ),
      '2026-07-15',
    );

    expect(model.seriesItems).toEqual([
      {
        id: activeSeries.id,
        title: 'Active Unit',
        subject: 'Math',
        lifecycleState: 'active',
        linkedPlanCount: 2,
        unscheduledPlanCount: 1,
        scheduledSessionCount: 1,
        completedSessionCount: 0,
      },
      {
        id: archivedSeries.id,
        title: 'Archived Unit',
        subject: 'Language',
        lifecycleState: 'archived',
        linkedPlanCount: 1,
        unscheduledPlanCount: 0,
        scheduledSessionCount: 0,
        completedSessionCount: 1,
      },
    ]);
  });

  it('keeps plans unscheduled until they have a scheduled or completed occurrence', () => {
    const plans = [
      lessonPlan('plan-ready', 'Ready plan', 'ready', '2026-07-12T12:00:00.000Z'),
      lessonPlan('plan-draft', 'Draft plan', 'draft', '2026-07-13T12:00:00.000Z'),
      lessonPlan('plan-cancelled', 'Cancelled-only plan', 'draft', '2026-07-14T12:00:00.000Z'),
      lessonPlan('plan-scheduled', 'Scheduled plan', 'ready', '2026-07-15T12:00:00.000Z'),
      lessonPlan('plan-archived', 'Archived plan', 'archived', '2026-07-16T12:00:00.000Z'),
    ];
    const sessions = [
      session('cancelled-session', 'plan-cancelled', '2026-07-18', 'cancelled'),
      session('scheduled-session', 'plan-scheduled', '2026-07-19', 'scheduled'),
    ];

    const model = buildLearnersPageReadModel(snapshot(plans, sessions), '2026-07-15');

    expect(model.unscheduledItems.map((item) => item.title)).toEqual([
      'Ready plan',
      'Cancelled-only plan',
      'Draft plan',
    ]);
    expect(model.unscheduledItems.map((item) => item.stateLabel)).toEqual([
      'Ready',
      'Draft',
      'Draft',
    ]);
  });

  it('shows completed sessions newest first and preserves View in Week links', () => {
    const plans = [
      lessonPlan('plan-old', 'Older completed lesson', 'ready', '2026-07-01T12:00:00.000Z'),
      lessonPlan('plan-new', 'Newest completed lesson', 'ready', '2026-07-01T12:00:00.000Z'),
    ];
    const sessions = [
      session('session-old', 'plan-old', '2026-07-10', 'completed'),
      session('session-new', 'plan-new', '2026-07-14', 'completed'),
    ];

    const model = buildLearnersPageReadModel(snapshot(plans, sessions), '2026-07-15');

    expect(model.completedItems.map((item) => item.title)).toEqual([
      'Newest completed lesson',
      'Older completed lesson',
    ]);
    expect(model.completedItems[0]?.weekHref).toBe(
      '#/week?date=2026-07-14&view=everything&focus=session-occurrence%3Asession-new',
    );
  });

  it('keeps orphaned sessions visible with a safe fallback title', () => {
    const model = buildLearnersPageReadModel(
      snapshot([], [session('orphan-session', 'missing-plan', '2026-07-20', 'scheduled')]),
      '2026-07-15',
    );

    expect(model.upcomingItems).toEqual([
      expect.objectContaining({
        title: 'Plan unavailable',
        stateLabel: 'Scheduled',
      }),
    ]);
  });
});

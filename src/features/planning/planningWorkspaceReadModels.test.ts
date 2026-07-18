import { describe, expect, it } from 'vitest';

import type { LearnerContext, LessonPlan, SessionOccurrence } from '@/domain/models/entities';
import { buildCalendarMonthReadModel } from '@/features/calendar/calendarReadModel';
import { buildLearnersPageReadModel } from '@/features/learners/learnerReadModel';
import { buildTodayReadModel } from '@/features/today/todayReadModel';

const context: LearnerContext = {
  id: 'context',
  kind: 'class',
  name: 'Synthetic class',
  schoolYearId: 'year',
  status: 'active',
};

const plan: LessonPlan = {
  id: 'plan',
  contextId: context.id,
  title: 'Shared planning lesson',
  subject: 'Language',
  workflowState: 'ready',
  createdAt: '2026-07-17T12:00:00.000Z',
  updatedAt: '2026-07-17T12:00:00.000Z',
};

const session: SessionOccurrence = {
  id: 'session',
  lessonPlanId: plan.id,
  contextId: context.id,
  date: '2026-07-17',
  startMinute: 600,
  endMinute: 660,
  deliveryState: 'scheduled',
};

describe('planning sessions across workspace read models', () => {
  it('renders the same session in Learners, Today, and Calendar', () => {
    const learners = buildLearnersPageReadModel(
      {
        activeSchoolYear: null,
        contexts: [context],
        selectedContext: context,
        lessonSeries: [],
        lessonPlans: [plan],
        sessions: [session],
      },
      '2026-07-17',
    );
    const today = buildTodayReadModel(
      '2026-07-17',
      [],
      [],
      '2026-07-17',
      500,
      [],
      [plan],
      [session],
    );
    const calendar = buildCalendarMonthReadModel(
      '2026-07-17',
      [],
      [],
      '2026-07-17',
      [],
      [plan],
      [session],
    );

    expect(learners.upcomingItems[0]).toMatchObject({
      title: plan.title,
      sessionHref: '#/planning/session?session=session',
    });
    expect(today.timelineItems[0]).toMatchObject({
      sourceType: 'session-occurrence',
      title: plan.title,
    });
    expect(calendar.days.find((day) => day.date === session.date)?.items[0]).toMatchObject({
      sourceType: 'session-occurrence',
      title: plan.title,
    });
  });
});

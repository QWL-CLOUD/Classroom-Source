import { describe, expect, it } from 'vitest';

import type { LessonPlan, SessionOccurrence } from '@/domain/models/entities';

import { buildWeekReadModel } from './weekReadModel';

const plan: LessonPlan = {
  id: 'phase-21-plan',
  contextId: 'phase-21-context',
  title: 'Synthetic learner conference',
  subject: 'Conference',
  workflowState: 'ready',
  createdAt: '2026-07-01T12:00:00.000Z',
  updatedAt: '2026-07-15T12:00:00.000Z',
};

function session(id: string, deliveryState: SessionOccurrence['deliveryState']): SessionOccurrence {
  return {
    id,
    lessonPlanId: plan.id,
    contextId: plan.contextId,
    date: '2026-07-15',
    startMinute: 660,
    endMinute: 690,
    deliveryState,
  };
}

describe('Phase 2.1 Week session composition', () => {
  it('shows scheduled and completed sessions only in Everything', () => {
    const sessions = [session('scheduled', 'scheduled'), session('completed', 'completed')];

    const everything = buildWeekReadModel(
      '2026-07-15',
      [],
      [],
      'everything',
      '2026-07-15',
      [plan],
      sessions,
    );
    const schedule = buildWeekReadModel(
      '2026-07-15',
      [],
      [],
      'teaching',
      '2026-07-15',
      [plan],
      sessions,
    );

    const wednesday = everything.days.find((day) => day.date === '2026-07-15');
    expect(wednesday?.items).toEqual([
      expect.objectContaining({
        occurrenceId: 'session-occurrence:completed',
        title: 'Synthetic learner conference',
        sourceType: 'session-occurrence',
      }),
      expect.objectContaining({
        occurrenceId: 'session-occurrence:scheduled',
        title: 'Synthetic learner conference',
        sourceType: 'session-occurrence',
      }),
    ]);
    expect(everything.sourceSessionOccurrenceCount).toBe(2);
    expect(schedule.visibleItemCount).toBe(0);
  });

  it('keeps cancelled sessions out of the Week read model', () => {
    const model = buildWeekReadModel(
      '2026-07-15',
      [],
      [],
      'everything',
      '2026-07-15',
      [plan],
      [session('cancelled', 'cancelled')],
    );

    expect(model.visibleItemCount).toBe(0);
    expect(model.sourceSessionOccurrenceCount).toBe(0);
  });
});

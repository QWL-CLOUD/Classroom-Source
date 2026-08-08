import { describe, expect, it } from 'vitest';

import {
  buildPlanningEntryHref,
  buildPlanningSurfaceHref,
  buildSessionEditorHref,
  parsePlanningReturnTarget,
} from './planningNavigation';

describe('planning navigation', () => {
  it('builds dated planning entry links for Today, Week, and Calendar', () => {
    expect(buildPlanningEntryHref({ date: '2026-07-17', returnTo: 'today' })).toBe(
      '#/planning/edit?date=2026-07-17&return=today',
    );
    expect(
      buildPlanningEntryHref({
        date: '2026-07-18',
        returnTo: 'week',
        contextId: 'context',
      }),
    ).toBe('#/planning/edit?date=2026-07-18&return=week&context=context');
    expect(
      buildPlanningEntryHref({
        date: '2026-07-17',
        returnTo: 'today',
        scheduleBlockId: 'block',
      }),
    ).toBe('#/planning/edit?date=2026-07-17&return=today&block=block');
  });

  it('preserves the selected date when scheduling and returning to a source surface', () => {
    expect(
      buildSessionEditorHref({
        planId: 'plan',
        date: '2026-07-17',
        returnTo: 'calendar',
      }),
    ).toBe('#/planning/session?plan=plan&date=2026-07-17&return=calendar');
    expect(
      buildPlanningSurfaceHref({
        returnTo: 'week',
        date: '2026-07-17',
        contextId: 'context',
        focusSessionId: 'session',
      }),
    ).toContain('#/week?');
    expect(
      buildPlanningSurfaceHref({
        returnTo: 'week',
        date: '2026-07-17',
        contextId: 'context',
        focusSessionId: 'session',
      }),
    ).toContain('focus=session-occurrence%3Asession');
    expect(
      buildPlanningSurfaceHref({
        returnTo: 'week',
        date: '2026-07-17',
        contextId: 'context',
        focusSessionId: 'session',
        focusOccurrenceId: 'schedule-block:block:2026-07-17',
      }),
    ).toContain('focus=schedule-block%3Ablock%3A2026-07-17');
  });

  it('rejects unknown return targets by falling back to Learners', () => {
    expect(parsePlanningReturnTarget('today')).toBe('today');
    expect(parsePlanningReturnTarget('progress')).toBe('progress');
    expect(parsePlanningReturnTarget('unknown')).toBe('learners');
    expect(parsePlanningReturnTarget(null)).toBe('learners');
  });

  it('returns review-origin planning workflows to the exact Review period and queue', () => {
    const reviewReturn = {
      schoolYearId: 'year-1',
      queue: 'awaiting-reflection' as const,
      focus: 'session:session-1',
      period: { preset: 'this-week' as const },
    };
    expect(parsePlanningReturnTarget('review')).toBe('review');
    expect(
      buildPlanningSurfaceHref({
        returnTo: 'review',
        date: '2026-07-17',
        contextId: 'context',
        reviewReturn,
      }),
    ).toBe(
      '#/teaching-review?schoolYear=year-1&queue=awaiting-reflection&focus=session%3Asession-1&period=this-week',
    );
    expect(
      buildSessionEditorHref({
        planId: 'plan',
        returnTo: 'review',
        reviewReturn: {
          schoolYearId: 'year-1',
          queue: 'record-issues',
          focus: 'lesson-plan:plan',
          period: { preset: 'custom', from: '2026-08-01', to: '2026-08-07' },
        },
      }),
    ).toBe(
      '#/planning/session?plan=plan&return=review&schoolYear=year-1&reviewQueue=record-issues&reviewFocus=lesson-plan%3Aplan&reviewPeriod=custom&reviewFrom=2026-08-01&reviewTo=2026-08-07',
    );
  });

  it('returns Progress-origin planning workflows to the exact learner Evidence scope', () => {
    const progressReturn = {
      schoolYearId: 'year-1',
      mode: 'learners' as const,
      selectedId: 'student-1',
      evidenceId: 'evidence-1',
      status: 'all' as const,
      kind: 'observation' as const,
      period: { preset: 'last-week' as const },
    };
    expect(
      buildPlanningSurfaceHref({
        returnTo: 'progress',
        date: '2026-09-01',
        contextId: 'context-1',
        progressReturn,
      }),
    ).toBe(
      '#/learner-progress?schoolYear=year-1&student=student-1&evidence=evidence-1&status=all&kind=observation&period=last-week',
    );
    expect(
      buildSessionEditorHref({
        planId: 'plan-1',
        returnTo: 'progress',
        progressReturn,
      }),
    ).toContain('return=progress');
  });
});

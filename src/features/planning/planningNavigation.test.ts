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
  });

  it('rejects unknown return targets by falling back to Learners', () => {
    expect(parsePlanningReturnTarget('today')).toBe('today');
    expect(parsePlanningReturnTarget('unknown')).toBe('learners');
    expect(parsePlanningReturnTarget(null)).toBe('learners');
  });
});

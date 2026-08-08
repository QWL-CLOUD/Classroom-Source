import { describe, expect, it } from 'vitest';

import {
  buildTeachingReviewHref,
  buildTeachingReviewSourceHref,
  buildTeachingReviewTasksHref,
  parseTeachingReviewReturnState,
  preserveTeachingReviewReturnParams,
  reviewFocusElementId,
} from './teachingReviewNavigation';

describe('Teaching Review navigation', () => {
  it('parses and preserves explicit Review return state', () => {
    const current = new URLSearchParams(
      'return=review&schoolYear=year-1&reviewQueue=open-next-steps&reviewFocus=teaching-reflection%3Aref-1',
    );
    expect(parseTeachingReviewReturnState(current)).toEqual({
      schoolYearId: 'year-1',
      queue: 'open-next-steps',
      focus: 'teaching-reflection:ref-1',
      period: { preset: 'school-year' },
    });

    expect(
      preserveTeachingReviewReturnParams(current, new URLSearchParams('tab=resources')).toString(),
    ).toBe(
      'tab=resources&return=review&schoolYear=year-1&reviewQueue=open-next-steps&reviewFocus=teaching-reflection%3Aref-1',
    );
  });

  it('builds exact source links and a focused Review return target', () => {
    const state = {
      schoolYearId: 'year-1',
      queue: 'record-issues' as const,
      focus: 'standard:standard-1',
    };
    expect(
      buildTeachingReviewSourceHref(
        { entityType: 'standard', entityId: 'standard-1', label: '4.NF.1' },
        state,
      ),
    ).toBe(
      '#/standards?standard=standard-1&return=review&schoolYear=year-1&reviewQueue=record-issues&reviewFocus=standard%3Astandard-1',
    );
    expect(buildTeachingReviewHref(state)).toBe(
      '#/teaching-review?schoolYear=year-1&queue=record-issues&focus=standard%3Astandard-1',
    );
  });

  it('preserves a non-default review period through source and return links', () => {
    const state = {
      schoolYearId: 'year-1',
      queue: 'awaiting-reflection' as const,
      focus: 'session:session-1',
      period: { preset: 'custom' as const, from: '2026-08-03', to: '2026-08-07' },
    };
    expect(
      buildTeachingReviewSourceHref(
        {
          entityType: 'session',
          entityId: 'session-1',
          label: 'Session 1',
          href: '#/planning/session?session=session-1',
        },
        state,
      ),
    ).toBe(
      '#/planning/session?session=session-1&return=review&schoolYear=year-1&reviewQueue=awaiting-reflection&reviewFocus=session%3Asession-1&reviewPeriod=custom&reviewFrom=2026-08-03&reviewTo=2026-08-07',
    );
    expect(buildTeachingReviewHref(state)).toBe(
      '#/teaching-review?schoolYear=year-1&queue=awaiting-reflection&focus=session%3Asession-1&period=custom&from=2026-08-03&to=2026-08-07',
    );
  });

  it('opens Assessment Evidence issues at the exact Learner Progress record', () => {
    expect(
      buildTeachingReviewSourceHref(
        {
          entityType: 'assessment-evidence',
          entityId: 'evidence-1',
          label: 'Reading check',
        },
        {
          schoolYearId: 'year-1',
          queue: 'record-issues',
          focus: 'assessment-evidence:evidence-1',
        },
      ),
    ).toBe(
      '#/learner-progress?evidence=evidence-1&schoolYear=year-1&return=review&reviewQueue=record-issues&reviewFocus=assessment-evidence%3Aevidence-1',
    );
  });

  it('opens only Tasks linked to the selected Reflection', () => {
    expect(
      buildTeachingReviewTasksHref('reflection-1', {
        schoolYearId: 'year-1',
        queue: 'open-next-steps',
        focus: 'teaching-reflection:reflection-1',
      }),
    ).toBe(
      '#/tasks?reflection=reflection-1&return=review&schoolYear=year-1&reviewQueue=open-next-steps&reviewFocus=teaching-reflection%3Areflection-1',
    );
  });

  it('creates stable focus element ids without relying on CSS escaping', () => {
    expect(reviewFocusElementId('awaiting-reflection', 'session:session/1')).toBe(
      'teaching-review-focus-awaiting-reflection-session-session-1',
    );
  });
});

import { describe, expect, it } from 'vitest';

import {
  appendLearnerProgressReturnParams,
  buildLearnerProgressHref,
  decorateLearnerProgressSourceHref,
  parseLearnerProgressReturnState,
} from './learnerProgressNavigation';

describe('Learner Progress return navigation', () => {
  it('round-trips exact Learner Progress scope through source routes', () => {
    const state = {
      schoolYearId: 'year-1',
      mode: 'standards' as const,
      selectedId: 'standard-1',
      evidenceId: 'evidence-1',
      status: 'all' as const,
      kind: 'score' as const,
      period: { preset: 'custom' as const, from: '2026-08-01', to: '2026-08-07' },
    };
    const source = appendLearnerProgressReturnParams(new URLSearchParams(), state);
    expect(parseLearnerProgressReturnState(source)).toMatchObject(state);
    expect(buildLearnerProgressHref(state)).toBe(
      '#/learner-progress?schoolYear=year-1&view=standards&standard=standard-1&evidence=evidence-1&status=all&kind=score&period=custom&from=2026-08-01&to=2026-08-07',
    );
  });

  it('decorates exact source links without replacing their own query state', () => {
    const href = decorateLearnerProgressSourceHref('#/planning/session?session=session-1', {
      schoolYearId: 'year-1',
      mode: 'learners',
      selectedId: 'student-1',
      evidenceId: 'evidence-1',
      period: { preset: 'this-week' },
    });
    expect(href).toContain('#/planning/session?session=session-1&return=progress');
    expect(href).toContain('progressSelected=student-1');
    expect(href).toContain('progressEvidence=evidence-1');
    expect(href).toContain('progressPeriod=this-week');
  });

  it('preserves a parent Teaching Review return when Progress opens a deeper source', () => {
    const sourceHref = decorateLearnerProgressSourceHref('#/standards?standard=standard-1', {
      schoolYearId: 'year-1',
      mode: 'standards',
      selectedId: 'standard-1',
      evidenceId: 'evidence-1',
      parentReview: {
        schoolYearId: 'year-1',
        queue: 'record-issues',
        focus: 'assessment-evidence:evidence-1',
        period: { preset: 'this-week' },
      },
    });
    const sourceSearch = new URLSearchParams(sourceHref.split('?')[1]);
    const returnState = parseLearnerProgressReturnState(sourceSearch);
    expect(returnState?.parentReview).toMatchObject({
      queue: 'record-issues',
      focus: 'assessment-evidence:evidence-1',
      period: { preset: 'this-week' },
    });
    expect(buildLearnerProgressHref(returnState ?? {})).toContain('return=review');
  });

  it('ignores non-progress return contracts', () => {
    expect(parseLearnerProgressReturnState(new URLSearchParams('return=review'))).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';

import {
  appendLearnerProgressReturnParams,
  buildLearnerProgressEntryHref,
  buildLearnerProgressHref,
  decorateLearnerProgressSourceHref,
  parseLearnerProgressCloseoutReturnState,
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
      assessmentId: 'assessment-1',
      standardFilterId: 'standard-filter-1',
      sessionId: 'session-1',
      order: 'oldest' as const,
      period: { preset: 'custom' as const, from: '2026-08-01', to: '2026-08-07' },
    };
    const source = appendLearnerProgressReturnParams(new URLSearchParams(), state);
    expect(parseLearnerProgressReturnState(source)).toMatchObject(state);
    expect(buildLearnerProgressHref(state)).toBe(
      '#/learner-progress?schoolYear=year-1&view=standards&standard=standard-1&evidence=evidence-1&status=all&kind=score&assessment=assessment-1&standardFilter=standard-filter-1&session=session-1&order=oldest&period=custom&from=2026-08-01&to=2026-08-07',
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

  it('builds concise entry links for Student, Context, Standard, Assessment, and Session review', () => {
    expect(
      buildLearnerProgressEntryHref({
        schoolYearId: 'year-1',
        mode: 'learners',
        selectedId: 'student-1',
      }),
    ).toBe('#/learner-progress?schoolYear=year-1&student=student-1');
    expect(
      buildLearnerProgressEntryHref({
        schoolYearId: 'year-1',
        mode: 'contexts',
        selectedId: 'context-1',
      }),
    ).toBe('#/learner-progress?schoolYear=year-1&view=contexts&context=context-1');
    expect(
      buildLearnerProgressEntryHref({
        mode: 'standards',
        selectedId: 'standard-1',
      }),
    ).toBe('#/learner-progress?view=standards&standard=standard-1');
    expect(buildLearnerProgressEntryHref({ assessmentId: 'assessment-1' })).toBe(
      '#/learner-progress?assessment=assessment-1',
    );
    expect(buildLearnerProgressEntryHref({ schoolYearId: 'year-1', sessionId: 'session-1' })).toBe(
      '#/learner-progress?schoolYear=year-1&session=session-1',
    );
  });

  it('carries a validated Session closeout return through Learner Progress and nested source return', () => {
    const closeoutReturn = {
      source: 'session' as const,
      href: '#/planning/session?session=session-1&return=calendar',
    };
    const entry = buildLearnerProgressEntryHref({
      schoolYearId: 'year-1',
      sessionId: 'session-1',
      closeoutReturn,
    });
    expect(entry).toContain('closeoutSource=session');
    expect(entry).toContain('closeoutHref=');

    const directSearch = new URLSearchParams(entry.split('?')[1]);
    expect(parseLearnerProgressCloseoutReturnState(directSearch)).toEqual(closeoutReturn);

    const decorated = decorateLearnerProgressSourceHref('#/planning/session?session=session-2', {
      schoolYearId: 'year-1',
      sessionId: 'session-1',
      closeoutReturn,
    });
    const sourceSearch = new URLSearchParams(decorated.split('?')[1]);
    const returnState = parseLearnerProgressReturnState(sourceSearch);
    expect(returnState?.closeoutReturn).toEqual(closeoutReturn);
    expect(buildLearnerProgressHref(returnState ?? {})).toContain('closeoutSource=session');
  });

  it('rejects malformed or external closeout return targets', () => {
    expect(
      parseLearnerProgressCloseoutReturnState(
        new URLSearchParams('closeoutSource=session&closeoutHref=https%3A%2F%2Fexample.com'),
      ),
    ).toBeUndefined();
    expect(
      parseLearnerProgressCloseoutReturnState(
        new URLSearchParams(
          'closeoutSource=reflection&closeoutHref=%23%2Fplanning%2Fsession%3Fsession%3Dsession-1',
        ),
      ),
    ).toBeUndefined();
  });
});

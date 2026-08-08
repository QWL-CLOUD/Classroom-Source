import { describe, expect, it } from 'vitest';

import {
  appendLearnerProgressEditor,
  appendLearnerProgressFilters,
  appendLearnerProgressMode,
  appendLearnerProgressSourceFilters,
  parseLearnerProgressRouteState,
} from './learnerProgressRouteState';

describe('Learner Progress route state', () => {
  it('uses learners, active Evidence, and all kinds as compact defaults', () => {
    expect(parseLearnerProgressRouteState(new URLSearchParams())).toEqual({
      mode: 'learners',
      selectedId: undefined,
      evidenceId: undefined,
      status: 'active',
      kind: 'all',
      assessmentId: undefined,
      standardFilterId: undefined,
      sessionId: undefined,
      order: 'newest',
      editor: null,
    });
  });

  it('parses only the selection owned by the active view', () => {
    expect(
      parseLearnerProgressRouteState(
        new URLSearchParams(
          'view=contexts&student=student-1&context=group-1&standard=standard-1&evidence=evidence-1&status=all&kind=observation&assessment=assessment-1&standardFilter=standard-2&session=session-1&order=oldest',
        ),
      ),
    ).toEqual({
      mode: 'contexts',
      selectedId: 'group-1',
      evidenceId: 'evidence-1',
      status: 'all',
      kind: 'observation',
      assessmentId: 'assessment-1',
      standardFilterId: 'standard-2',
      sessionId: 'session-1',
      order: 'oldest',
      editor: null,
    });
  });

  it('switches modes without retaining incompatible scope or exact Evidence state', () => {
    const params = new URLSearchParams('student=student-1&evidence=evidence-1');
    appendLearnerProgressMode(params, 'standards', 'standard-1');
    expect(params.toString()).toBe('view=standards&standard=standard-1');
  });

  it('stores editor state independently from exact Evidence selection', () => {
    const params = new URLSearchParams('evidence=evidence-1');
    appendLearnerProgressEditor(params, 'evidence-1');
    expect(params.toString()).toBe('evidence=evidence-1&edit=evidence-1');
    appendLearnerProgressEditor(params, null);
    expect(params.toString()).toBe('evidence=evidence-1');
  });

  it('keeps default filters out of the URL', () => {
    const params = new URLSearchParams('status=archived&kind=score');
    appendLearnerProgressFilters(params, 'active', 'all');
    expect(params.toString()).toBe('');
  });

  it('stores optional Assessment, Standard, Session, and timeline-order filters compactly', () => {
    const params = new URLSearchParams();
    appendLearnerProgressSourceFilters(params, {
      assessmentId: 'assessment-1',
      standardFilterId: 'standard-1',
      sessionId: 'session-1',
      order: 'oldest',
    });
    expect(params.toString()).toBe(
      'assessment=assessment-1&standardFilter=standard-1&session=session-1&order=oldest',
    );

    appendLearnerProgressSourceFilters(params, { order: 'newest' });
    expect(params.toString()).toBe('');
  });
});

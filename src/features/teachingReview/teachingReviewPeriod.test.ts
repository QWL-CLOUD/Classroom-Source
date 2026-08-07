import { describe, expect, it } from 'vitest';

import type { TeachingReviewView } from './teachingReviewReadModel';
import {
  appendTeachingReviewPeriodParams,
  clampTeachingReviewPeriodToSchoolYear,
  filterTeachingReviewViewByPeriod,
  parseTeachingReviewPeriodState,
  resolveTeachingReviewPeriod,
} from './teachingReviewPeriod';

function createView(): TeachingReviewView {
  return {
    contractVersion: 1,
    schoolYear: {
      id: 'year-1',
      label: '2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      asOfDate: '2026-08-07',
      closedThrough: '2026-08-06',
      status: 'current',
      source: { entityType: 'school-year', entityId: 'year-1', label: '2026–2027' },
    },
    awaitingReflection: {
      count: 2,
      rows: [
        {
          sessionOccurrenceId: 'session-this-week',
          title: 'This week',
          date: '2026-08-04',
          contextName: 'Class A',
          reflectionState: 'missing',
          sessionSource: {
            entityType: 'session',
            entityId: 'session-this-week',
            label: 'This week',
          },
          reflectionHref: '#/planning/session/reflection?session=session-this-week',
        },
        {
          sessionOccurrenceId: 'session-last-week',
          title: 'Last week',
          date: '2026-08-01',
          contextName: 'Class A',
          reflectionState: 'missing',
          sessionSource: {
            entityType: 'session',
            entityId: 'session-last-week',
            label: 'Last week',
          },
          reflectionHref: '#/planning/session/reflection?session=session-last-week',
        },
      ],
    },
    pastStillScheduled: {
      count: 2,
      rows: [
        {
          sessionOccurrenceId: 'scheduled-this-week',
          title: 'This week scheduled',
          message: 'Past Session is still marked Scheduled.',
          source: {
            entityType: 'session',
            entityId: 'scheduled-this-week',
            label: 'This week scheduled',
          },
        },
        {
          sessionOccurrenceId: 'scheduled-last-week',
          title: 'Last week scheduled',
          message: 'Past Session is still marked Scheduled.',
          source: {
            entityType: 'session',
            entityId: 'scheduled-last-week',
            label: 'Last week scheduled',
          },
        },
      ],
    },
    openNextSteps: {
      reflectionCount: 2,
      taskCount: 3,
      rows: [
        {
          reflectionId: 'reflection-this-week',
          sessionOccurrenceId: 'session-this-week',
          lessonPlanTitle: 'This week',
          contextName: 'Class A',
          occurredOn: '2026-08-03',
          reflectionStatus: 'active',
          sessionState: 'completed',
          openNextStepCount: 2,
          source: {
            entityType: 'teaching-reflection',
            entityId: 'reflection-this-week',
            label: 'This week',
          },
        },
        {
          reflectionId: 'reflection-last-week',
          sessionOccurrenceId: 'session-last-week',
          lessonPlanTitle: 'Last week',
          contextName: 'Class A',
          occurredOn: '2026-07-31',
          reflectionStatus: 'active',
          sessionState: 'completed',
          openNextStepCount: 1,
          source: {
            entityType: 'teaching-reflection',
            entityId: 'reflection-last-week',
            label: 'Last week',
          },
        },
      ],
    },
    recordIssues: {
      affectedRecordCount: 1,
      issueCount: 1,
      issues: [
        {
          code: 'standard-alignment-missing-source',
          entityType: 'lesson-plan',
          entityId: 'plan-1',
          message: 'Standard alignment has a missing, archived, or invalid source.',
          source: { entityType: 'lesson-plan', entityId: 'plan-1', label: 'Plan 1' },
        },
      ],
    },
  };
}

describe('Teaching Review period state', () => {
  it('parses defaults and valid custom ranges while rejecting malformed custom state', () => {
    expect(parseTeachingReviewPeriodState(new URLSearchParams())).toEqual({
      preset: 'school-year',
    });
    expect(parseTeachingReviewPeriodState(new URLSearchParams('period=this-week'))).toEqual({
      preset: 'this-week',
    });
    expect(
      parseTeachingReviewPeriodState(
        new URLSearchParams('period=custom&from=2026-08-03&to=2026-08-07'),
      ),
    ).toEqual({ preset: 'custom', from: '2026-08-03', to: '2026-08-07' });
    expect(
      parseTeachingReviewPeriodState(
        new URLSearchParams('period=custom&from=2026-08-08&to=2026-08-01'),
      ),
    ).toEqual({ preset: 'school-year' });
  });

  it('serializes review-prefixed return parameters without bloating the default period', () => {
    expect(
      appendTeachingReviewPeriodParams(
        new URLSearchParams('return=review'),
        { preset: 'this-week' },
        'review',
      ).toString(),
    ).toBe('return=review&reviewPeriod=this-week');
    expect(
      appendTeachingReviewPeriodParams(
        new URLSearchParams('return=review&reviewPeriod=this-week'),
        { preset: 'school-year' },
        'review',
      ).toString(),
    ).toBe('return=review');
  });

  it('resolves Monday-based week presets and clips custom periods to a School Year', () => {
    const view = createView();
    expect(resolveTeachingReviewPeriod({ preset: 'this-week' }, view.schoolYear)).toMatchObject({
      startsOn: '2026-08-03',
      endsOn: '2026-08-09',
      overlapsSchoolYear: true,
    });
    expect(resolveTeachingReviewPeriod({ preset: 'last-week' }, view.schoolYear)).toMatchObject({
      startsOn: '2026-07-27',
      endsOn: '2026-08-02',
    });
    expect(
      clampTeachingReviewPeriodToSchoolYear(
        { preset: 'custom', from: '2026-06-20', to: '2026-07-10' },
        view.schoolYear,
      ),
    ).toEqual({ preset: 'custom', from: '2026-07-01', to: '2026-07-10' });
  });

  it('filters date-bound teaching queues while retaining School Year-wide Record Issues', () => {
    const view = createView();
    const period = resolveTeachingReviewPeriod({ preset: 'this-week' }, view.schoolYear);
    const filtered = filterTeachingReviewViewByPeriod(
      view,
      {
        'scheduled-this-week': '2026-08-05',
        'scheduled-last-week': '2026-08-02',
      },
      period,
    );

    expect(filtered.awaitingReflection.rows.map((row) => row.sessionOccurrenceId)).toEqual([
      'session-this-week',
    ]);
    expect(filtered.pastStillScheduled.rows.map((row) => row.sessionOccurrenceId)).toEqual([
      'scheduled-this-week',
    ]);
    expect(filtered.openNextSteps.reflectionCount).toBe(1);
    expect(filtered.openNextSteps.taskCount).toBe(2);
    expect(filtered.recordIssues.issueCount).toBe(1);
  });
});

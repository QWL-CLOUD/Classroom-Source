import { describe, expect, it } from 'vitest';

import {
  appendLearnerProgressPeriodParams,
  clampLearnerProgressPeriodToSchoolYear,
  parseLearnerProgressPeriodState,
  resolveLearnerProgressPeriod,
} from './learnerProgressPeriod';

const schoolYear = { startsOn: '2026-07-01', endsOn: '2027-06-30' };

describe('Learner Progress period state', () => {
  it('parses defaults and valid custom ranges without accepting malformed ranges', () => {
    expect(parseLearnerProgressPeriodState(new URLSearchParams())).toEqual({
      preset: 'school-year',
    });
    expect(parseLearnerProgressPeriodState(new URLSearchParams('period=this-week'))).toEqual({
      preset: 'this-week',
    });
    expect(
      parseLearnerProgressPeriodState(
        new URLSearchParams('period=custom&from=2026-08-03&to=2026-08-07'),
      ),
    ).toEqual({ preset: 'custom', from: '2026-08-03', to: '2026-08-07' });
    expect(
      parseLearnerProgressPeriodState(
        new URLSearchParams('period=custom&from=2026-08-08&to=2026-08-01'),
      ),
    ).toEqual({ preset: 'school-year' });
  });

  it('serializes compact URL state and clips custom periods to the School Year', () => {
    expect(
      appendLearnerProgressPeriodParams(new URLSearchParams(), { preset: 'last-week' }).toString(),
    ).toBe('period=last-week');
    expect(
      appendLearnerProgressPeriodParams(new URLSearchParams('period=last-week'), {
        preset: 'school-year',
      }).toString(),
    ).toBe('');
    expect(
      clampLearnerProgressPeriodToSchoolYear(
        { preset: 'custom', from: '2026-06-20', to: '2026-07-10' },
        schoolYear,
      ),
    ).toEqual({ preset: 'custom', from: '2026-07-01', to: '2026-07-10' });
  });

  it('uses Monday-based week presets and clips them to the selected School Year', () => {
    expect(
      resolveLearnerProgressPeriod({ preset: 'this-week' }, schoolYear, '2026-08-07'),
    ).toMatchObject({
      startsOn: '2026-08-03',
      endsOn: '2026-08-09',
      overlapsSchoolYear: true,
    });
    expect(
      resolveLearnerProgressPeriod({ preset: 'last-week' }, schoolYear, '2026-08-07'),
    ).toMatchObject({
      startsOn: '2026-07-27',
      endsOn: '2026-08-02',
    });
  });
});

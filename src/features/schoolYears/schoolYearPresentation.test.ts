import { describe, expect, it } from 'vitest';
import { presentActiveSchoolYear } from './schoolYearPresentation';

describe('active school year presentation', () => {
  it('shows the repository-backed active school year and date range', () => {
    expect(
      presentActiveSchoolYear({
        status: 'ready',
        data: {
          id: 'school-year-current',
          label: '2027–2028',
          startsOn: '2027-07-01',
          endsOn: '2028-06-30',
          active: true,
        },
      }),
    ).toEqual({
      label: '2027–2028',
      detail: '2027-07-01 through 2028-06-30',
      tone: 'ready',
    });
  });

  it('makes a missing active school year explicit', () => {
    expect(presentActiveSchoolYear({ status: 'ready', data: null })).toMatchObject({
      label: 'No active school year',
      tone: 'missing',
    });
  });

  it('keeps loading and read failures distinct', () => {
    expect(presentActiveSchoolYear({ status: 'loading' }).tone).toBe('loading');
    expect(presentActiveSchoolYear({ status: 'error', message: 'IndexedDB failed' })).toMatchObject(
      {
        label: 'School year unavailable',
        detail: 'IndexedDB failed',
        tone: 'error',
      },
    );
  });
});

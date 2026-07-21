import { describe, expect, it } from 'vitest';
import { buildLiveHealthChecks } from './systemHealthPresentation';

const emptyCounts = {
  schoolYears: 0,
  learnerContexts: 0,
  learnerNotices: 0,
  scheduleBlocks: 0,
  calendarEvents: 0,
  lessonPlans: 0,
  sessions: 0,
  tasks: 0,
  reminders: 0,
  migrationRuns: 0,
  quarantine: 0,
};

describe('System Health live checks', () => {
  it('requires exactly one active school year', () => {
    const checks = buildLiveHealthChecks(
      {
        status: 'ready',
        data: { activeSchoolYear: null, activeSchoolYearCount: 0, counts: emptyCounts },
      },
      3,
    );

    expect(checks.find((check) => check.id === 'active-school-year')).toMatchObject({
      statusLabel: 'Needs setup',
      tone: 'attention',
    });
  });

  it('reports the real active year label and boundaries', () => {
    const checks = buildLiveHealthChecks(
      {
        status: 'ready',
        data: {
          activeSchoolYear: {
            id: 'year-1',
            label: '2027–2028',
            startsOn: '2027-07-01',
            endsOn: '2028-06-30',
            active: true,
          },
          activeSchoolYearCount: 1,
          counts: emptyCounts,
        },
      },
      3,
    );

    expect(checks.find((check) => check.id === 'active-school-year')).toMatchObject({
      statusLabel: '2027–2028',
      tone: 'ready',
    });
    expect(checks.find((check) => check.id === 'active-school-year')?.detail).toContain(
      '2027-07-01 through 2028-06-30',
    );
  });

  it('does not present an unexpected schema as passing', () => {
    expect(buildLiveHealthChecks({ status: 'loading' }, 4)[1]).toMatchObject({
      statusLabel: 'Needs review',
      tone: 'attention',
    });
  });
});

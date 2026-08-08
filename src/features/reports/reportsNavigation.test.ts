import { describe, expect, it } from 'vitest';

import {
  buildLearnerEvidenceReportHref,
  parseLearnerEvidenceReportRouteState,
} from './reportsNavigation';

describe('Reports navigation', () => {
  it('builds an explicit learner report route with shared School Year and period semantics', () => {
    const href = buildLearnerEvidenceReportHref({
      schoolYearId: 'year 1',
      studentId: 'student/1',
      period: { preset: 'custom', from: '2026-08-01', to: '2026-08-07' },
      status: 'all',
      kind: 'observation',
    });

    expect(href).toBe(
      '#/reports?schoolYear=year+1&student=student%2F1&period=custom&from=2026-08-01&to=2026-08-07&status=all&kind=observation',
    );
  });

  it('parses invalid filters back to safe active/all defaults', () => {
    expect(
      parseLearnerEvidenceReportRouteState(
        new URLSearchParams('schoolYear=year-1&student=student-1&status=bad&kind=bad&period=bad'),
      ),
    ).toEqual({
      schoolYearId: 'year-1',
      studentId: 'student-1',
      period: { preset: 'school-year' },
      status: 'active',
      kind: 'all',
    });
  });
});

import { describe, expect, it } from 'vitest';

import type { LearnerEvidenceReport } from './learnerEvidenceReport';
import {
  escapeCsvCell,
  learnerEvidenceReportCsvFileName,
  serializeLearnerEvidenceReportCsv,
} from './learnerEvidenceReportCsv';

const report: LearnerEvidenceReport = {
  contractVersion: 1,
  audience: 'teacher-internal',
  schoolYearId: 'year-1',
  schoolYearLabel: '2026–2027',
  learnerId: 'student-1',
  learnerLabel: '陈艾丽, Alice',
  learnerStatus: 'current',
  asOfDate: '2026-08-07',
  period: { label: 'Aug 1–Aug 7', startsOn: '2026-08-01', endsOn: '2026-08-07' },
  filters: { status: 'all', kind: 'all' },
  summary: { evidenceCount: 1, scoreCount: 0, proficiencyCount: 0, observationCount: 1 },
  rows: [
    {
      id: 'evidence-1',
      occurredOn: '2026-08-05',
      title: '=HYPERLINK("bad")',
      kind: 'observation',
      status: 'active',
      valueLabel: 'Teacher observation',
      observationText: 'First line, with comma\nSecond "quoted" line',
      notes: '@unsafe-start',
      context: { label: 'Group · Historical group', status: 'snapshot' },
      assessment: { label: 'Reading Check', status: 'archived' },
      standards: [{ label: 'ELA.4.R.1 · Use evidence', status: 'snapshot' }],
    },
  ],
};

describe('Learner Evidence CSV', () => {
  it('uses UTF-8 BOM, RFC-style quoting, source provenance labels, and spreadsheet-formula protection', () => {
    const csv = serializeLearnerEvidenceReportCsv(report);

    expect(csv.startsWith('\uFEFFSchool Year,Learner,')).toBe(true);
    expect(csv).toContain('"陈艾丽, Alice"');
    expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
    expect(csv).toContain('"First line, with comma\nSecond ""quoted"" line"');
    expect(csv).toContain("'@unsafe-start");
    expect(csv).toContain('Historical snapshot');
    expect(csv).toContain('Archived');
    expect(csv).toContain('ELA.4.R.1 · Use evidence [Historical snapshot]');
  });

  it('escapes ordinary CSV cells without changing safe text', () => {
    expect(escapeCsvCell('plain')).toBe('plain');
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('+SUM(A1:A2)')).toBe("'+SUM(A1:A2)");
  });

  it('creates a readable Unicode-safe filename', () => {
    expect(learnerEvidenceReportCsvFileName(report)).toBe(
      'Classroom-Learner-Evidence-陈艾丽-Alice-2026-2027.csv',
    );
  });
});

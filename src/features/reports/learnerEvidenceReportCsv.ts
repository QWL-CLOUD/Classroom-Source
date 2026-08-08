import type { LearnerEvidenceReport, LearnerEvidenceReportSource } from './learnerEvidenceReport';
import { learnerEvidenceReportSourceStatusLabel } from './learnerEvidenceReport';

const CSV_HEADERS = [
  'School Year',
  'Learner',
  'Period Start',
  'Period End',
  'Evidence Date',
  'Evidence Title',
  'Evidence Kind',
  'Evidence Status',
  'Recorded Value',
  'Observation',
  'Notes',
  'Context',
  'Context Status',
  'Assessment',
  'Assessment Status',
  'Session',
  'Session Status',
  'Standards',
] as const;

function displayStatus(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function sourceLabel(source: LearnerEvidenceReportSource | undefined): string {
  return source?.label ?? '';
}

function sourceStatus(source: LearnerEvidenceReportSource | undefined): string {
  if (!source) return '';
  return learnerEvidenceReportSourceStatusLabel(source.status) ?? 'Current';
}

function standardsLabel(standards: readonly LearnerEvidenceReportSource[]): string {
  return standards
    .map((standard) => {
      const status = learnerEvidenceReportSourceStatusLabel(standard.status);
      return status ? `${standard.label} [${status}]` : standard.label;
    })
    .join(' | ');
}

function protectSpreadsheetFormula(value: string): string {
  const trimmedStart = value.trimStart();
  return /^[=+\-@]/.test(trimmedStart) ? `'${value}` : value;
}

export function escapeCsvCell(value: string | number | undefined): string {
  const text = protectSpreadsheetFormula(value === undefined ? '' : String(value));
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function serializeLearnerEvidenceReportCsv(report: LearnerEvidenceReport): string {
  const lines = [CSV_HEADERS.map((header) => escapeCsvCell(header)).join(',')];
  for (const row of report.rows) {
    lines.push(
      [
        report.schoolYearLabel,
        report.learnerLabel,
        report.period.startsOn,
        report.period.endsOn,
        row.occurredOn,
        row.title,
        displayStatus(row.kind),
        displayStatus(row.status),
        row.valueLabel,
        row.observationText,
        row.notes,
        sourceLabel(row.context),
        sourceStatus(row.context),
        sourceLabel(row.assessment),
        sourceStatus(row.assessment),
        sourceLabel(row.session),
        sourceStatus(row.session),
        standardsLabel(row.standards),
      ]
        .map((value) => escapeCsvCell(value))
        .join(','),
    );
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function safeFilePart(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

export function learnerEvidenceReportCsvFileName(report: LearnerEvidenceReport): string {
  return `Classroom-Learner-Evidence-${safeFilePart(report.learnerLabel, 'Learner')}-${safeFilePart(
    report.schoolYearLabel,
    'School-Year',
  )}.csv`;
}

export function downloadLearnerEvidenceReportCsv(report: LearnerEvidenceReport): void {
  const blob = new Blob([serializeLearnerEvidenceReportCsv(report)], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = learnerEvidenceReportCsvFileName(report);
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

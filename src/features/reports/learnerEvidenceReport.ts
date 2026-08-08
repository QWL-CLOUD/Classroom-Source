import type {
  LearnerProgressEvidenceItem,
  LearnerProgressKindFilter,
  LearnerProgressSource,
  LearnerProgressSourceStatus,
  LearnerProgressStatusFilter,
  LearnerProgressView,
} from '@/features/learnerProgress/learnerProgressReadModel';
import type { LearnerProgressResolvedPeriod } from '@/features/learnerProgress/learnerProgressPeriod';

export const LEARNER_EVIDENCE_REPORT_CONTRACT_VERSION = 1 as const;

export interface LearnerEvidenceReportSource {
  label: string;
  status: LearnerProgressSourceStatus;
}

export interface LearnerEvidenceReportRow {
  id: string;
  occurredOn: string;
  title: string;
  kind: LearnerProgressEvidenceItem['kind'];
  status: LearnerProgressEvidenceItem['status'];
  valueLabel: string;
  observationText?: string;
  notes?: string;
  context?: LearnerEvidenceReportSource;
  assessment?: LearnerEvidenceReportSource;
  session?: LearnerEvidenceReportSource;
  standards: LearnerEvidenceReportSource[];
}

export interface LearnerEvidenceReport {
  contractVersion: typeof LEARNER_EVIDENCE_REPORT_CONTRACT_VERSION;
  audience: 'teacher-internal';
  schoolYearId: string;
  schoolYearLabel: string;
  learnerId: string;
  learnerLabel: string;
  learnerStatus: LearnerProgressSourceStatus;
  asOfDate: string;
  period: {
    label: string;
    startsOn?: string;
    endsOn?: string;
  };
  filters: {
    status: LearnerProgressStatusFilter;
    kind: LearnerProgressKindFilter;
  };
  summary: {
    evidenceCount: number;
    scoreCount: number;
    proficiencyCount: number;
    observationCount: number;
  };
  rows: LearnerEvidenceReportRow[];
}

function source(
  source: LearnerProgressSource | undefined,
): LearnerEvidenceReportSource | undefined {
  return source ? { label: source.label, status: source.status } : undefined;
}

export function learnerEvidenceReportSourceStatusLabel(
  status: LearnerProgressSourceStatus,
): string | null {
  if (status === 'archived') return 'Archived';
  if (status === 'snapshot') return 'Historical snapshot';
  if (status === 'unavailable') return 'Unavailable';
  return null;
}

export function buildLearnerEvidenceReport(input: {
  view: LearnerProgressView;
  period: LearnerProgressResolvedPeriod;
  status: LearnerProgressStatusFilter;
  kind: LearnerProgressKindFilter;
}): LearnerEvidenceReport | null {
  const { view, period, status, kind } = input;
  if (view.mode !== 'learners' || !view.selectedId) return null;

  const learner = view.scopeRows.find((row) => row.id === view.selectedId);
  if (!learner) return null;

  return {
    contractVersion: LEARNER_EVIDENCE_REPORT_CONTRACT_VERSION,
    audience: 'teacher-internal',
    schoolYearId: view.schoolYear.id,
    schoolYearLabel: view.schoolYear.label,
    learnerId: learner.id,
    learnerLabel: learner.label,
    learnerStatus: learner.sourceStatus,
    asOfDate: view.asOfDate,
    period: {
      label: period.label,
      startsOn: period.startsOn,
      endsOn: period.endsOn,
    },
    filters: { status, kind },
    summary: {
      evidenceCount: view.summary.evidenceCount,
      scoreCount: view.summary.scoreCount,
      proficiencyCount: view.summary.proficiencyCount,
      observationCount: view.summary.observationCount,
    },
    rows: view.evidence.map((item) => ({
      id: item.id,
      occurredOn: item.occurredOn,
      title: item.title,
      kind: item.kind,
      status: item.status,
      valueLabel: item.valueLabel,
      observationText: item.observationText,
      notes: item.notes,
      context: source(item.context),
      assessment: source(item.assessment),
      session: source(item.session),
      standards: item.standards.map((standard) => ({
        label: standard.label,
        status: standard.status,
      })),
    })),
  };
}

import type { AssessmentEvidenceRecord, SchoolYear } from '@/domain/models/entities';

import type { AssessmentEvidenceValues } from './assessmentEvidenceMutationService';

export type AssessmentEvidenceEditorKind = AssessmentEvidenceRecord['kind'];

export interface AssessmentEvidenceEditorDraft {
  studentId: string;
  occurredOn: string;
  title: string;
  kind: AssessmentEvidenceEditorKind;
  contextId: string;
  lessonPlanId: string;
  sessionOccurrenceId: string;
  assessmentId: string;
  standardIds: string[];
  notes: string;
  scoreValue: string;
  scoreMaximum: string;
  scoreLabel: string;
  proficiencyLabel: string;
  proficiencyLevelId: string;
  proficiencyRank: string;
  proficiencyScaleKey: string;
  proficiencyScaleLabel: string;
  observationText: string;
}

export interface AssessmentEvidenceDraftDefaults {
  studentId?: string;
  contextId?: string;
  standardId?: string;
  occurredOn?: string;
}

function numberText(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

export function createAssessmentEvidenceEditorDraft(
  schoolYear: Pick<SchoolYear, 'startsOn' | 'endsOn'>,
  record?: AssessmentEvidenceRecord,
  defaults: AssessmentEvidenceDraftDefaults = {},
): AssessmentEvidenceEditorDraft {
  const defaultDate = defaults.occurredOn ?? schoolYear.startsOn;
  if (!record) {
    return {
      studentId: defaults.studentId ?? '',
      occurredOn: defaultDate,
      title: '',
      kind: 'observation',
      contextId: defaults.contextId ?? '',
      lessonPlanId: '',
      sessionOccurrenceId: '',
      assessmentId: '',
      standardIds: defaults.standardId ? [defaults.standardId] : [],
      notes: '',
      scoreValue: '',
      scoreMaximum: '',
      scoreLabel: '',
      proficiencyLabel: '',
      proficiencyLevelId: '',
      proficiencyRank: '',
      proficiencyScaleKey: '',
      proficiencyScaleLabel: '',
      observationText: '',
    };
  }

  return {
    studentId: record.studentId,
    occurredOn: record.occurredOn,
    title: record.title,
    kind: record.kind,
    contextId: record.contextId ?? '',
    lessonPlanId: record.lessonPlanId ?? '',
    sessionOccurrenceId: record.sessionOccurrenceId ?? '',
    assessmentId: record.assessmentId ?? '',
    standardIds: [...record.standardIds],
    notes: record.notes ?? '',
    scoreValue: record.kind === 'score' ? numberText(record.score.value) : '',
    scoreMaximum: record.kind === 'score' ? numberText(record.score.maximum) : '',
    scoreLabel: record.kind === 'score' ? (record.score.label ?? '') : '',
    proficiencyLabel: record.kind === 'proficiency' ? record.proficiency.label : '',
    proficiencyLevelId: record.kind === 'proficiency' ? (record.proficiency.levelId ?? '') : '',
    proficiencyRank: record.kind === 'proficiency' ? numberText(record.proficiency.rank) : '',
    proficiencyScaleKey: record.kind === 'proficiency' ? (record.proficiency.scaleKey ?? '') : '',
    proficiencyScaleLabel:
      record.kind === 'proficiency' ? (record.proficiency.scaleLabel ?? '') : '',
    observationText: record.kind === 'observation' ? record.observation.text : '',
  };
}

function optionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : undefined;
}

function optionalInteger(value: string): number | undefined {
  const parsed = optionalNumber(value);
  return parsed === undefined ? undefined : parsed;
}

function optionalString(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function assessmentEvidenceDraftToValues(
  draft: AssessmentEvidenceEditorDraft,
  schoolYearId: string,
): AssessmentEvidenceValues {
  const base = {
    studentId: draft.studentId,
    schoolYearId,
    occurredOn: draft.occurredOn,
    title: draft.title,
    contextId: optionalString(draft.contextId),
    lessonPlanId: optionalString(draft.lessonPlanId),
    sessionOccurrenceId: optionalString(draft.sessionOccurrenceId),
    assessmentId: optionalString(draft.assessmentId),
    standardIds: draft.standardIds,
    notes: optionalString(draft.notes),
  };

  if (draft.kind === 'score') {
    return {
      ...base,
      kind: 'score',
      score: {
        value: optionalNumber(draft.scoreValue),
        maximum: optionalNumber(draft.scoreMaximum),
        label: optionalString(draft.scoreLabel),
      },
    };
  }
  if (draft.kind === 'proficiency') {
    return {
      ...base,
      kind: 'proficiency',
      proficiency: {
        label: draft.proficiencyLabel,
        levelId: optionalString(draft.proficiencyLevelId),
        rank: optionalInteger(draft.proficiencyRank),
        scaleKey: optionalString(draft.proficiencyScaleKey),
        scaleLabel: optionalString(draft.proficiencyScaleLabel),
      },
    };
  }
  return {
    ...base,
    kind: 'observation',
    observation: { text: draft.observationText },
  };
}

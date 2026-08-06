import type {
  AssessmentEvidenceKind,
  CategoryFamilyId,
  LearnerContext,
  LibraryApplicationType,
} from '@/domain/models/entities';

export const TEACHING_INSIGHTS_CONTRACT_VERSION = 2 as const;

export const teachingInsightsMetricDefinitions = {
  completedSessions: {
    id: 'completed-sessions',
    label: 'Completed Sessions',
    classification: 'derived-metric',
    sourceOfTruth: ['sessionOccurrences', 'learnerContexts', 'schoolYears'],
  },
  completedTeachingMinutes: {
    id: 'completed-teaching-minutes',
    label: 'Completed Teaching Minutes',
    classification: 'derived-metric',
    sourceOfTruth: ['sessionOccurrences', 'learnerContexts', 'schoolYears'],
  },
  teachingDays: {
    id: 'teaching-days',
    label: 'Teaching Days',
    classification: 'derived-metric',
    sourceOfTruth: ['sessionOccurrences', 'learnerContexts', 'schoolYears'],
  },
  plannedToTaught: {
    id: 'planned-to-taught',
    label: 'Planned to Taught',
    classification: 'derived-metric',
    sourceOfTruth: ['sessionOccurrences', 'learnerContexts', 'schoolYears'],
  },
  evidenceCoverage: {
    id: 'current-retained-roster-evidence-coverage',
    label: 'Current Retained Roster Evidence Coverage',
    classification: 'derived-metric',
    sourceOfTruth: [
      'assessmentEvidence',
      'rosterMemberships',
      'learnerContexts',
      'studentRecords',
      'schoolYears',
    ],
  },
  contextDistribution: {
    id: 'context-distribution',
    label: 'Context Distribution',
    classification: 'derived-metric',
    sourceOfTruth: ['sessionOccurrences', 'learnerContexts', 'schoolYears'],
  },
  standardsUsage: {
    id: 'explicit-standard-alignment',
    label: 'Explicit Standard Alignment',
    classification: 'derived-metric',
    sourceOfTruth: ['lessonPlans', 'standardAlignments', 'standards', 'learnerContexts'],
  },
  contentUsage: {
    id: 'planning-content-links',
    label: 'Planning Content Links',
    classification: 'derived-metric',
    sourceOfTruth: ['lessonPlans', 'libraryItems', 'learnerContexts'],
  },
  reflectionCoverage: {
    id: 'completed-session-reflection-coverage',
    label: 'Completed Session Reflection Coverage',
    classification: 'derived-metric',
    sourceOfTruth: ['teachingReflections', 'sessionOccurrences', 'schoolYears'],
  },
  reflectionNextSteps: {
    id: 'reflection-linked-next-steps',
    label: 'Reflection-linked Next Steps',
    classification: 'derived-metric',
    sourceOfTruth: ['tasks', 'teachingReflections', 'schoolYears'],
  },
  needsReview: {
    id: 'needs-review',
    label: 'Needs Review',
    classification: 'derived-metric',
    sourceOfTruth: ['canonical-record-integrity-rules'],
  },
} as const;

export type TeachingInsightsMetricDefinition =
  (typeof teachingInsightsMetricDefinitions)[keyof typeof teachingInsightsMetricDefinitions];

export type TeachingInsightsClaimClassification =
  'fact' | 'derived-metric' | 'teacher-interpretation' | 'unsupported-inference';

export type TeachingInsightsContextKind = LearnerContext['kind'];
export type TeachingInsightsEvidenceKind = AssessmentEvidenceKind;
export type TeachingInsightsContentType = LibraryApplicationType;
export type TeachingInsightsPlanCategoryFamily = Extract<
  CategoryFamilyId,
  'focus-tag' | 'purpose-tag' | 'theme-tag'
>;

export const teachingInsightsPlanCategoryFamilies: readonly TeachingInsightsPlanCategoryFamily[] = [
  'focus-tag',
  'purpose-tag',
  'theme-tag',
];

export type TeachingInsightsSourceEntityType =
  | 'school-year'
  | 'context'
  | 'student'
  | 'lesson-plan'
  | 'session'
  | 'assessment-evidence'
  | 'library-item'
  | 'standard'
  | 'category-assignment'
  | 'teaching-reflection'
  | 'task';

export interface TeachingInsightsSourceTrace {
  entityType: TeachingInsightsSourceEntityType;
  entityId: string;
  label: string;
  href?: string;
  archived?: boolean;
}

export type TeachingInsightsRatio =
  | {
      status: 'available';
      numerator: number;
      denominator: number;
      value: number;
    }
  | {
      status: 'unavailable';
      numerator: number;
      denominator: 0;
      reason: 'no-eligible-records' | 'no-retained-roster-links' | 'future-school-year';
    };

export const teachingInsightsNeedsReviewCodes = [
  'past-session-still-scheduled',
  'session-outside-school-year',
  'session-missing-context',
  'session-missing-plan',
  'session-context-mismatch',
  'completed-session-missing-completed-at',
  'future-completed-session',
  'evidence-outside-school-year',
  'evidence-missing-student',
  'evidence-context-year-mismatch',
  'unlinked-individual-context',
  'library-link-missing-source',
  'library-link-type-mismatch',
  'standard-alignment-missing-source',
  'category-assignment-missing-source',
] as const;

export type TeachingInsightsNeedsReviewCode = (typeof teachingInsightsNeedsReviewCodes)[number];

export interface TeachingInsightsNeedsReviewIssue {
  code: TeachingInsightsNeedsReviewCode;
  entityType: TeachingInsightsSourceEntityType;
  entityId: string;
  message: string;
  source: TeachingInsightsSourceTrace;
}

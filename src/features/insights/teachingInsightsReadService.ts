import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  assessmentEvidenceRecordSchema,
  categoryAssignmentSchema,
  categoryValueSchema,
  learnerContextSchema,
  lessonPlanSchema,
  libraryCatalogItemSchema,
  rosterMembershipSchema,
  schoolYearSchema,
  sessionOccurrenceSchema,
  standardAlignmentSchema,
  standardSchema,
  studentRecordSchema,
  type SchoolYear,
} from '@/domain/models/entities';
import { parseLocalDate, todayLocalDate } from '@/shared/dates/localDate';

import {
  buildTeachingInsightsView,
  type TeachingInsightsSnapshot,
  type TeachingInsightsView,
} from './teachingInsightsReadModel';

export interface TeachingInsightsReadOptions {
  schoolYearId?: string;
  asOfDate?: string;
}

export interface TeachingInsightsReadResult {
  schoolYears: SchoolYear[];
  selectedSchoolYear: SchoolYear | null;
  asOfDate: string;
  view: TeachingInsightsView | null;
}

function compareSchoolYears(first: SchoolYear, second: SchoolYear): number {
  return (
    Number(second.active) - Number(first.active) ||
    Number(first.lifecycleState === 'archived') - Number(second.lifecycleState === 'archived') ||
    second.startsOn.localeCompare(first.startsOn) ||
    first.label.localeCompare(second.label, 'en', { sensitivity: 'base' }) ||
    first.id.localeCompare(second.id)
  );
}

function chooseSchoolYear(
  schoolYears: readonly SchoolYear[],
  requestedSchoolYearId: string | undefined,
  asOfDate: string,
): SchoolYear | null {
  if (requestedSchoolYearId) {
    const requested = schoolYears.find((schoolYear) => schoolYear.id === requestedSchoolYearId);
    if (requested) return requested;
  }

  return (
    schoolYears.find((schoolYear) => schoolYear.active) ??
    schoolYears.find(
      (schoolYear) => schoolYear.startsOn <= asOfDate && schoolYear.endsOn >= asOfDate,
    ) ??
    schoolYears[0] ??
    null
  );
}

function parseSnapshotRows(values: {
  schoolYear: SchoolYear;
  asOfDate: string;
  learnerContexts: readonly unknown[];
  studentRecords: readonly unknown[];
  rosterMemberships: readonly unknown[];
  lessonPlans: readonly unknown[];
  sessionOccurrences: readonly unknown[];
  assessmentEvidence: readonly unknown[];
  libraryItems: readonly unknown[];
  standards: readonly unknown[];
  standardAlignments: readonly unknown[];
  categoryValues: readonly unknown[];
  categoryAssignments: readonly unknown[];
}): TeachingInsightsSnapshot {
  return {
    schoolYear: values.schoolYear,
    asOfDate: values.asOfDate,
    learnerContexts: values.learnerContexts.map((value) => learnerContextSchema.parse(value)),
    studentRecords: values.studentRecords.map((value) => studentRecordSchema.parse(value)),
    rosterMemberships: values.rosterMemberships.map((value) => rosterMembershipSchema.parse(value)),
    lessonPlans: values.lessonPlans.map((value) => lessonPlanSchema.parse(value)),
    sessionOccurrences: values.sessionOccurrences.map((value) =>
      sessionOccurrenceSchema.parse(value),
    ),
    assessmentEvidence: values.assessmentEvidence.map((value) =>
      assessmentEvidenceRecordSchema.parse(value),
    ),
    libraryItems: values.libraryItems.map((value) => libraryCatalogItemSchema.parse(value)),
    standards: values.standards.map((value) => standardSchema.parse(value)),
    standardAlignments: values.standardAlignments.map((value) =>
      standardAlignmentSchema.parse(value),
    ),
    categoryValues: values.categoryValues.map((value) => categoryValueSchema.parse(value)),
    categoryAssignments: values.categoryAssignments.map((value) =>
      categoryAssignmentSchema.parse(value),
    ),
  };
}

export class TeachingInsightsReadService {
  constructor(private readonly db: ClassroomDatabase = classroomDb) {}

  async load(options: TeachingInsightsReadOptions = {}): Promise<TeachingInsightsReadResult> {
    const asOfDate = options.asOfDate ?? todayLocalDate();
    if (!parseLocalDate(asOfDate)) throw new Error(`Invalid Insights as-of date: ${asOfDate}`);

    return this.db.transaction(
      'r',
      [
        this.db.schoolYears,
        this.db.learnerContexts,
        this.db.studentRecords,
        this.db.rosterMemberships,
        this.db.lessonPlans,
        this.db.sessionOccurrences,
        this.db.assessmentEvidence,
        this.db.libraryItems,
        this.db.standards,
        this.db.standardAlignments,
        this.db.categoryValues,
        this.db.categoryAssignments,
      ],
      async () => {
        const [
          schoolYearValues,
          learnerContexts,
          studentRecords,
          rosterMemberships,
          lessonPlans,
          sessionOccurrences,
          assessmentEvidence,
          libraryItems,
          standards,
          standardAlignments,
          categoryValues,
          categoryAssignments,
        ] = await Promise.all([
          this.db.schoolYears.toArray(),
          this.db.learnerContexts.toArray(),
          this.db.studentRecords.toArray(),
          this.db.rosterMemberships.toArray(),
          this.db.lessonPlans.toArray(),
          this.db.sessionOccurrences.toArray(),
          this.db.assessmentEvidence.toArray(),
          this.db.libraryItems.toArray(),
          this.db.standards.toArray(),
          this.db.standardAlignments.toArray(),
          this.db.categoryValues.toArray(),
          this.db.categoryAssignments.toArray(),
        ]);

        const schoolYears = schoolYearValues
          .map((value) => schoolYearSchema.parse(value))
          .sort(compareSchoolYears);
        const selectedSchoolYear = chooseSchoolYear(schoolYears, options.schoolYearId, asOfDate);

        if (!selectedSchoolYear) {
          return {
            schoolYears,
            selectedSchoolYear: null,
            asOfDate,
            view: null,
          };
        }

        const snapshot = parseSnapshotRows({
          schoolYear: selectedSchoolYear,
          asOfDate,
          learnerContexts,
          studentRecords,
          rosterMemberships,
          lessonPlans,
          sessionOccurrences,
          assessmentEvidence,
          libraryItems,
          standards,
          standardAlignments,
          categoryValues,
          categoryAssignments,
        });

        return {
          schoolYears,
          selectedSchoolYear,
          asOfDate,
          view: buildTeachingInsightsView(snapshot),
        };
      },
    );
  }
}

export const teachingInsightsReadService = new TeachingInsightsReadService();

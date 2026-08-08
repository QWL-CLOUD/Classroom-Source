import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  assessmentEvidenceRecordSchema,
  learnerContextSchema,
  lessonPlanSchema,
  libraryCatalogItemSchema,
  rosterMembershipSchema,
  schoolYearSchema,
  sessionOccurrenceSchema,
  standardSchema,
  studentRecordSchema,
  type SchoolYear,
} from '@/domain/models/entities';
import { parseLocalDate, todayLocalDate } from '@/shared/dates/localDate';

import type { LearnerProgressSnapshot } from './learnerProgressReadModel';

export interface LearnerProgressReadOptions {
  schoolYearId?: string;
  asOfDate?: string;
}

export interface LearnerProgressReadResult {
  schoolYears: SchoolYear[];
  selectedSchoolYear: SchoolYear | null;
  asOfDate: string;
  snapshot: LearnerProgressSnapshot | null;
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

export class LearnerProgressReadService {
  constructor(private readonly db: ClassroomDatabase = classroomDb) {}

  async load(options: LearnerProgressReadOptions = {}): Promise<LearnerProgressReadResult> {
    const asOfDate = options.asOfDate ?? todayLocalDate();
    if (!parseLocalDate(asOfDate))
      throw new Error(`Invalid Learner Progress as-of date: ${asOfDate}`);

    return this.db.transaction(
      'r',
      [
        this.db.schoolYears,
        this.db.studentRecords,
        this.db.learnerContexts,
        this.db.standards,
        this.db.assessmentEvidence,
        this.db.lessonPlans,
        this.db.sessionOccurrences,
        this.db.libraryItems,
        this.db.rosterMemberships,
      ],
      async () => {
        const [
          schoolYearValues,
          studentValues,
          contextValues,
          standardValues,
          evidenceValues,
          lessonPlanValues,
          sessionValues,
          libraryItemValues,
          rosterMembershipValues,
        ] = await Promise.all([
          this.db.schoolYears.toArray(),
          this.db.studentRecords.toArray(),
          this.db.learnerContexts.toArray(),
          this.db.standards.toArray(),
          this.db.assessmentEvidence.toArray(),
          this.db.lessonPlans.toArray(),
          this.db.sessionOccurrences.toArray(),
          this.db.libraryItems.toArray(),
          this.db.rosterMemberships.toArray(),
        ]);

        const schoolYears = schoolYearValues
          .map((value) => schoolYearSchema.parse(value))
          .sort(compareSchoolYears);
        const selectedSchoolYear = chooseSchoolYear(schoolYears, options.schoolYearId, asOfDate);

        if (!selectedSchoolYear) {
          return { schoolYears, selectedSchoolYear: null, asOfDate, snapshot: null };
        }

        const snapshot: LearnerProgressSnapshot = {
          schoolYear: selectedSchoolYear,
          asOfDate,
          students: studentValues.map((value) => studentRecordSchema.parse(value)),
          contexts: contextValues.map((value) => learnerContextSchema.parse(value)),
          standards: standardValues.map((value) => standardSchema.parse(value)),
          evidence: evidenceValues.map((value) => assessmentEvidenceRecordSchema.parse(value)),
          lessonPlans: lessonPlanValues.map((value) => lessonPlanSchema.parse(value)),
          sessions: sessionValues.map((value) => sessionOccurrenceSchema.parse(value)),
          libraryItems: libraryItemValues.map((value) => libraryCatalogItemSchema.parse(value)),
          rosterMemberships: rosterMembershipValues.map((value) =>
            rosterMembershipSchema.parse(value),
          ),
        };

        return { schoolYears, selectedSchoolYear, asOfDate, snapshot };
      },
    );
  }
}

export const learnerProgressReadService = new LearnerProgressReadService();

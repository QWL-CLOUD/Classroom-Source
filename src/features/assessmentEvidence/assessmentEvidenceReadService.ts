import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  assessmentEvidenceRecordSchema,
  type AssessmentEvidenceRecord,
  type AssessmentEvidenceStatus,
} from '@/domain/models/entities';

export interface AssessmentEvidenceFilters {
  schoolYearId?: string;
  status?: 'all' | AssessmentEvidenceStatus;
  kind?: 'all' | AssessmentEvidenceRecord['kind'];
  occurredOnFrom?: string;
  occurredOnTo?: string;
}

function compareEvidence(
  first: AssessmentEvidenceRecord,
  second: AssessmentEvidenceRecord,
): number {
  return (
    second.occurredOn.localeCompare(first.occurredOn) ||
    second.updatedAt.localeCompare(first.updatedAt) ||
    first.title.localeCompare(second.title, 'en', { sensitivity: 'base' }) ||
    first.id.localeCompare(second.id)
  );
}

function filterEvidence(
  values: readonly AssessmentEvidenceRecord[],
  filters: AssessmentEvidenceFilters,
): AssessmentEvidenceRecord[] {
  return values
    .filter((record) => {
      if (filters.schoolYearId && record.schoolYearId !== filters.schoolYearId) return false;
      if (filters.status && filters.status !== 'all' && record.status !== filters.status)
        return false;
      if (filters.kind && filters.kind !== 'all' && record.kind !== filters.kind) return false;
      if (filters.occurredOnFrom && record.occurredOn < filters.occurredOnFrom) return false;
      if (filters.occurredOnTo && record.occurredOn > filters.occurredOnTo) return false;
      return true;
    })
    .sort(compareEvidence);
}

export class AssessmentEvidenceReadService {
  constructor(private readonly db: ClassroomDatabase = classroomDb) {}

  async getEvidence(id: string): Promise<AssessmentEvidenceRecord | undefined> {
    const value = await this.db.assessmentEvidence.get(id);
    return value ? assessmentEvidenceRecordSchema.parse(value) : undefined;
  }

  async listStudentEvidence(
    studentId: string,
    filters: AssessmentEvidenceFilters = {},
  ): Promise<AssessmentEvidenceRecord[]> {
    return this.readAndFilter(
      await this.db.assessmentEvidence.where('studentId').equals(studentId).toArray(),
      filters,
    );
  }

  async listContextEvidence(
    contextId: string,
    filters: AssessmentEvidenceFilters = {},
  ): Promise<AssessmentEvidenceRecord[]> {
    return this.readAndFilter(
      await this.db.assessmentEvidence.where('contextId').equals(contextId).toArray(),
      filters,
    );
  }

  async listStandardEvidence(
    standardId: string,
    filters: AssessmentEvidenceFilters = {},
  ): Promise<AssessmentEvidenceRecord[]> {
    return this.readAndFilter(
      await this.db.assessmentEvidence.where('standardIds').equals(standardId).toArray(),
      filters,
    );
  }

  async listAssessmentEvidence(
    assessmentId: string,
    filters: AssessmentEvidenceFilters = {},
  ): Promise<AssessmentEvidenceRecord[]> {
    return this.readAndFilter(
      await this.db.assessmentEvidence.where('assessmentId').equals(assessmentId).toArray(),
      filters,
    );
  }

  private readAndFilter(
    values: readonly unknown[],
    filters: AssessmentEvidenceFilters,
  ): AssessmentEvidenceRecord[] {
    return filterEvidence(
      values.map((value) => assessmentEvidenceRecordSchema.parse(value)),
      filters,
    );
  }
}

export const assessmentEvidenceReadService = new AssessmentEvidenceReadService();

import { z } from 'zod';

import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  assessmentEvidenceObservationSchema,
  assessmentEvidenceProficiencySchema,
  assessmentEvidenceRecordSchema,
  assessmentEvidenceScoreSchema,
  changeLogSchema,
  learnerContextSchema,
  lessonPlanSchema,
  libraryCatalogItemSchema,
  schoolYearSchema,
  sessionOccurrenceSchema,
  standardSchema,
  studentRecordSchema,
  type AssessmentEvidenceRecord,
  type AssessmentEvidenceSourceSnapshots,
  type ChangeLog,
  type LearnerContext,
  type LessonPlan,
  type LibraryCatalogItem,
  type SchoolYear,
  type SessionOccurrence,
  type Standard,
} from '@/domain/models/entities';
import { clearSupportedRedoBranch } from '@/features/editing/editCommandRegistry';
import { notifyEditHistoryChanged } from '@/features/editing/editHistorySignal';

import { applyAssessmentEvidenceOperations } from './applyAssessmentEvidenceOperations';
import {
  createAssessmentEvidenceCommand,
  deleteAssessmentEvidenceOperation,
  putAssessmentEvidenceOperation,
  serializeAssessmentEvidenceCommand,
  type AssessmentEvidenceCommandPair,
} from './assessmentEvidenceCommands';

const optionalTrimmedString = (maximum: number) =>
  z.preprocess((value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().max(maximum).optional());

const uniqueStandardIdsSchema = z
  .array(z.string().min(1))
  .max(500)
  .default([])
  .transform((values) => [...new Set(values)]);

const evidenceValuesBaseShape = {
  studentId: z.string().min(1),
  schoolYearId: z.string().min(1),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().trim().min(1, 'Enter an evidence title.').max(240),
  contextId: z.string().min(1).optional(),
  lessonPlanId: z.string().min(1).optional(),
  sessionOccurrenceId: z.string().min(1).optional(),
  assessmentId: z.string().min(1).optional(),
  standardIds: uniqueStandardIdsSchema,
  notes: optionalTrimmedString(5000),
};

export const assessmentEvidenceValuesSchema = z.discriminatedUnion('kind', [
  z.object({
    ...evidenceValuesBaseShape,
    kind: z.literal('score'),
    score: assessmentEvidenceScoreSchema,
  }),
  z.object({
    ...evidenceValuesBaseShape,
    kind: z.literal('proficiency'),
    proficiency: assessmentEvidenceProficiencySchema,
  }),
  z.object({
    ...evidenceValuesBaseShape,
    kind: z.literal('observation'),
    observation: assessmentEvidenceObservationSchema,
  }),
]);

export type AssessmentEvidenceValues = z.input<typeof assessmentEvidenceValuesSchema>;
type ParsedAssessmentEvidenceValues = z.output<typeof assessmentEvidenceValuesSchema>;

export interface AssessmentEvidenceMutationDependencies {
  createId?: () => string;
  now?: () => string;
}

interface CommitResult<T> {
  value: T;
  log: ChangeLog;
}

export class AssessmentEvidenceMutationService {
  private readonly createId: () => string;
  private readonly now: () => string;

  constructor(
    private readonly db: ClassroomDatabase = classroomDb,
    dependencies: AssessmentEvidenceMutationDependencies = {},
  ) {
    this.createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  async create(values: AssessmentEvidenceValues): Promise<AssessmentEvidenceRecord> {
    const parsed = assessmentEvidenceValuesSchema.parse(values);
    const result = await this.db.transaction(
      'rw',
      this.mutationTables(),
      async (): Promise<CommitResult<AssessmentEvidenceRecord>> => {
        const schoolYear = await this.requireStudentAndSchoolYear(
          parsed.studentId,
          parsed.schoolYearId,
        );
        this.requireOccurredOnInsideSchoolYear(parsed.occurredOn, schoolYear);
        const sourceSnapshots = await this.validateSourcesAndBuildSnapshots(parsed);
        const now = this.now();
        const created = this.buildRecord(parsed, {
          id: this.createId(),
          sourceSnapshots,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        });
        const commands: AssessmentEvidenceCommandPair = {
          forward: createAssessmentEvidenceCommand([putAssessmentEvidenceOperation(created)]),
          inverse: createAssessmentEvidenceCommand([deleteAssessmentEvidenceOperation(created.id)]),
        };
        const log = this.createChangeLog(
          'assessment-evidence.create',
          `Create evidence “${created.title}”`,
          commands,
        );

        await clearSupportedRedoBranch(this.db);
        await applyAssessmentEvidenceOperations(this.db, commands.forward.operations);
        await this.db.changeLog.put(log);
        return { value: created, log };
      },
    );

    this.notifyNewChange(result.log);
    return result.value;
  }

  async update(id: string, values: AssessmentEvidenceValues): Promise<AssessmentEvidenceRecord> {
    const parsed = assessmentEvidenceValuesSchema.parse(values);
    const result = await this.db.transaction(
      'rw',
      this.mutationTables(),
      async (): Promise<CommitResult<AssessmentEvidenceRecord>> => {
        const existing = await this.requireEvidence(id);
        const schoolYear = await this.requireStudentAndSchoolYear(
          parsed.studentId,
          parsed.schoolYearId,
        );
        this.requireOccurredOnInsideSchoolYear(parsed.occurredOn, schoolYear);
        const sourceSnapshots = await this.validateSourcesAndBuildSnapshots(parsed, existing);
        const updated = this.buildRecord(parsed, {
          id: existing.id,
          sourceSnapshots,
          status: existing.status,
          createdAt: existing.createdAt,
          updatedAt: this.now(),
          archivedAt: existing.archivedAt,
        });
        const commands: AssessmentEvidenceCommandPair = {
          forward: createAssessmentEvidenceCommand([putAssessmentEvidenceOperation(updated)]),
          inverse: createAssessmentEvidenceCommand([putAssessmentEvidenceOperation(existing)]),
        };
        const log = this.createChangeLog(
          'assessment-evidence.update',
          `Edit evidence “${updated.title}”`,
          commands,
        );

        await clearSupportedRedoBranch(this.db);
        await applyAssessmentEvidenceOperations(this.db, commands.forward.operations);
        await this.db.changeLog.put(log);
        return { value: updated, log };
      },
    );

    this.notifyNewChange(result.log);
    return result.value;
  }

  async archive(id: string): Promise<AssessmentEvidenceRecord> {
    return this.setStatus(id, 'archived');
  }

  async restore(id: string): Promise<AssessmentEvidenceRecord> {
    return this.setStatus(id, 'active');
  }

  private async setStatus(
    id: string,
    status: AssessmentEvidenceRecord['status'],
  ): Promise<AssessmentEvidenceRecord> {
    const result = await this.db.transaction(
      'rw',
      this.db.assessmentEvidence,
      this.db.changeLog,
      async (): Promise<CommitResult<AssessmentEvidenceRecord>> => {
        const existing = await this.requireEvidence(id);
        if (existing.status === status) {
          throw new Error(
            status === 'active'
              ? 'This assessment evidence is already active.'
              : 'This assessment evidence is already archived.',
          );
        }
        const now = this.now();
        const updated = assessmentEvidenceRecordSchema.parse({
          ...existing,
          status,
          updatedAt: now,
          archivedAt: status === 'archived' ? now : undefined,
        });
        const commands: AssessmentEvidenceCommandPair = {
          forward: createAssessmentEvidenceCommand([putAssessmentEvidenceOperation(updated)]),
          inverse: createAssessmentEvidenceCommand([putAssessmentEvidenceOperation(existing)]),
        };
        const verb = status === 'archived' ? 'Archive' : 'Restore';
        const log = this.createChangeLog(
          `assessment-evidence.${status === 'archived' ? 'archive' : 'restore'}`,
          `${verb} evidence “${existing.title}”`,
          commands,
        );

        await clearSupportedRedoBranch(this.db);
        await applyAssessmentEvidenceOperations(this.db, commands.forward.operations);
        await this.db.changeLog.put(log);
        return { value: updated, log };
      },
    );

    this.notifyNewChange(result.log);
    return result.value;
  }

  private mutationTables() {
    return [
      this.db.assessmentEvidence,
      this.db.studentRecords,
      this.db.schoolYears,
      this.db.learnerContexts,
      this.db.lessonPlans,
      this.db.sessionOccurrences,
      this.db.libraryItems,
      this.db.standards,
      this.db.changeLog,
    ];
  }

  private async requireStudentAndSchoolYear(
    studentId: string,
    schoolYearId: string,
  ): Promise<SchoolYear> {
    const [studentValue, schoolYearValue] = await Promise.all([
      this.db.studentRecords.get(studentId),
      this.db.schoolYears.get(schoolYearId),
    ]);
    if (!studentValue) throw new Error('The selected Student no longer exists.');
    if (!schoolYearValue) throw new Error('The selected school year no longer exists.');
    studentRecordSchema.parse(studentValue);
    return schoolYearSchema.parse(schoolYearValue);
  }

  private requireOccurredOnInsideSchoolYear(
    occurredOn: string,
    schoolYear: Pick<SchoolYear, 'startsOn' | 'endsOn'>,
  ): void {
    if (occurredOn < schoolYear.startsOn || occurredOn > schoolYear.endsOn) {
      throw new Error('Evidence date must fall inside the selected School Year.');
    }
  }

  private async validateSourcesAndBuildSnapshots(
    values: ParsedAssessmentEvidenceValues,
    existing?: AssessmentEvidenceRecord,
  ): Promise<AssessmentEvidenceSourceSnapshots | undefined> {
    const context = await this.resolveContext(values, existing);
    const lessonPlan = await this.resolveLessonPlan(values, existing);
    const session = await this.resolveSession(values, existing);
    const assessment = await this.resolveAssessment(values, existing);
    const standards = await this.resolveStandards(values, existing);

    if (context && context.schoolYearId !== values.schoolYearId) {
      throw new Error('The selected context belongs to a different school year.');
    }
    if (lessonPlan) {
      if (values.contextId && lessonPlan.contextId !== values.contextId) {
        throw new Error('The selected Lesson Plan belongs to a different context.');
      }
      await this.requireContextSchoolYear(
        lessonPlan.contextId,
        values.schoolYearId,
        'Lesson Plan',
        existing?.lessonPlanId === values.lessonPlanId,
      );
    }
    if (session) {
      if (values.lessonPlanId && session.lessonPlanId !== values.lessonPlanId) {
        throw new Error('The selected Session belongs to a different Lesson Plan.');
      }
      if (values.contextId && session.contextId !== values.contextId) {
        throw new Error('The selected Session belongs to a different context.');
      }
      await this.requireContextSchoolYear(
        session.contextId,
        values.schoolYearId,
        'Session',
        existing?.sessionOccurrenceId === values.sessionOccurrenceId,
      );
    }

    const previous = existing?.sourceSnapshots;
    const snapshots: AssessmentEvidenceSourceSnapshots = {};

    if (values.contextId) {
      snapshots.context =
        existing?.contextId === values.contextId && previous?.context
          ? previous.context
          : context
            ? { kind: context.kind, name: context.name }
            : undefined;
    }
    if (values.lessonPlanId) {
      snapshots.lessonPlan =
        existing?.lessonPlanId === values.lessonPlanId && previous?.lessonPlan
          ? previous.lessonPlan
          : lessonPlan
            ? { title: lessonPlan.title }
            : undefined;
    }
    if (values.sessionOccurrenceId) {
      snapshots.sessionOccurrence =
        existing?.sessionOccurrenceId === values.sessionOccurrenceId && previous?.sessionOccurrence
          ? previous.sessionOccurrence
          : session
            ? {
                date: session.date,
                startMinute: session.startMinute,
                endMinute: session.endMinute,
              }
            : undefined;
    }
    if (values.assessmentId) {
      snapshots.assessment =
        existing?.assessmentId === values.assessmentId && previous?.assessment
          ? previous.assessment
          : assessment
            ? {
                title: assessment.title,
                assessmentKind:
                  assessment.typedFields?.catalogType === 'assessment'
                    ? assessment.typedFields.assessmentKind
                    : undefined,
              }
            : undefined;
    }

    if (values.standardIds.length > 0) {
      const previousById = new Map(
        (previous?.standards ?? []).map((snapshot) => [snapshot.standardId, snapshot]),
      );
      const currentById = new Map(standards.map((standard) => [standard.id, standard]));
      const standardSnapshots = values.standardIds.flatMap((standardId) => {
        if (existing?.standardIds.includes(standardId)) {
          const preserved = previousById.get(standardId);
          if (preserved) return [preserved];
        }
        const standard = currentById.get(standardId);
        return standard
          ? [
              {
                standardId: standard.id,
                code: standard.code,
                statement: standard.statement,
              },
            ]
          : [];
      });
      if (standardSnapshots.length > 0) snapshots.standards = standardSnapshots;
    }

    return Object.keys(snapshots).length > 0 ? snapshots : undefined;
  }

  private async resolveContext(
    values: ParsedAssessmentEvidenceValues,
    existing?: AssessmentEvidenceRecord,
  ): Promise<LearnerContext | undefined> {
    if (!values.contextId) return undefined;
    const raw = await this.db.learnerContexts.get(values.contextId);
    if (raw) return learnerContextSchema.parse(raw);
    this.allowMissingUnchangedReference(existing?.contextId, values.contextId, existing);
    return undefined;
  }

  private async resolveLessonPlan(
    values: ParsedAssessmentEvidenceValues,
    existing?: AssessmentEvidenceRecord,
  ): Promise<LessonPlan | undefined> {
    if (!values.lessonPlanId) return undefined;
    const raw = await this.db.lessonPlans.get(values.lessonPlanId);
    if (raw) return lessonPlanSchema.parse(raw);
    this.allowMissingUnchangedReference(existing?.lessonPlanId, values.lessonPlanId, existing);
    return undefined;
  }

  private async resolveSession(
    values: ParsedAssessmentEvidenceValues,
    existing?: AssessmentEvidenceRecord,
  ): Promise<SessionOccurrence | undefined> {
    if (!values.sessionOccurrenceId) return undefined;
    const raw = await this.db.sessionOccurrences.get(values.sessionOccurrenceId);
    if (raw) return sessionOccurrenceSchema.parse(raw);
    this.allowMissingUnchangedReference(
      existing?.sessionOccurrenceId,
      values.sessionOccurrenceId,
      existing,
    );
    return undefined;
  }

  private async resolveAssessment(
    values: ParsedAssessmentEvidenceValues,
    existing?: AssessmentEvidenceRecord,
  ): Promise<LibraryCatalogItem | undefined> {
    if (!values.assessmentId) return undefined;
    const raw = await this.db.libraryItems.get(values.assessmentId);
    if (!raw) {
      this.allowMissingUnchangedReference(existing?.assessmentId, values.assessmentId, existing);
      return undefined;
    }
    const item = libraryCatalogItemSchema.parse(raw);
    if (item.catalogType !== 'assessment') {
      throw new Error('assessmentId must refer to a Library Assessment.');
    }
    return item;
  }

  private async resolveStandards(
    values: ParsedAssessmentEvidenceValues,
    existing?: AssessmentEvidenceRecord,
  ): Promise<Standard[]> {
    const standards: Standard[] = [];
    for (const standardId of values.standardIds) {
      const raw = await this.db.standards.get(standardId);
      if (raw) {
        standards.push(standardSchema.parse(raw));
        continue;
      }
      const unchanged = existing?.standardIds.includes(standardId) ?? false;
      if (!unchanged) throw new Error(`Standard “${standardId}” no longer exists.`);
    }
    return standards;
  }

  private allowMissingUnchangedReference(
    previousId: string | undefined,
    nextId: string,
    existing?: AssessmentEvidenceRecord,
  ): void {
    if (existing && previousId === nextId) return;
    throw new Error(`Linked source “${nextId}” no longer exists.`);
  }

  private async requireContextSchoolYear(
    contextId: string,
    schoolYearId: string,
    sourceLabel: string,
    allowMissing = false,
  ): Promise<void> {
    const raw = await this.db.learnerContexts.get(contextId);
    if (!raw) {
      if (allowMissing) return;
      throw new Error(`The ${sourceLabel} context no longer exists.`);
    }
    const context = learnerContextSchema.parse(raw);
    if (context.schoolYearId !== schoolYearId) {
      throw new Error(`The selected ${sourceLabel} belongs to a different school year.`);
    }
  }

  private buildRecord(
    values: ParsedAssessmentEvidenceValues,
    metadata: {
      id: string;
      sourceSnapshots?: AssessmentEvidenceSourceSnapshots;
      status: AssessmentEvidenceRecord['status'];
      createdAt: string;
      updatedAt: string;
      archivedAt?: string;
    },
  ): AssessmentEvidenceRecord {
    const common = {
      id: metadata.id,
      studentId: values.studentId,
      schoolYearId: values.schoolYearId,
      occurredOn: values.occurredOn,
      title: values.title,
      contextId: values.contextId,
      lessonPlanId: values.lessonPlanId,
      sessionOccurrenceId: values.sessionOccurrenceId,
      assessmentId: values.assessmentId,
      standardIds: values.standardIds,
      sourceSnapshots: metadata.sourceSnapshots,
      notes: values.notes,
      status: metadata.status,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
      archivedAt: metadata.archivedAt,
    };

    if (values.kind === 'score') {
      return assessmentEvidenceRecordSchema.parse({
        ...common,
        kind: 'score',
        score: values.score,
      });
    }
    if (values.kind === 'proficiency') {
      return assessmentEvidenceRecordSchema.parse({
        ...common,
        kind: 'proficiency',
        proficiency: values.proficiency,
      });
    }
    return assessmentEvidenceRecordSchema.parse({
      ...common,
      kind: 'observation',
      observation: values.observation,
    });
  }

  private async requireEvidence(id: string): Promise<AssessmentEvidenceRecord> {
    const value = await this.db.assessmentEvidence.get(id);
    if (!value) throw new Error('Assessment evidence no longer exists.');
    return assessmentEvidenceRecordSchema.parse(value);
  }

  private createChangeLog(
    commandType: string,
    label: string,
    commands: AssessmentEvidenceCommandPair,
  ): ChangeLog {
    return changeLogSchema.parse({
      id: this.createId(),
      label,
      commandType,
      forwardJson: serializeAssessmentEvidenceCommand(commands.forward),
      inverseJson: serializeAssessmentEvidenceCommand(commands.inverse),
      createdAt: this.now(),
    });
  }

  private notifyNewChange(log: ChangeLog): void {
    notifyEditHistoryChanged({
      canUndo: true,
      canRedo: false,
      undoLabel: log.label,
    });
  }
}

export const assessmentEvidenceMutationService = new AssessmentEvidenceMutationService();

import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  calendarEventImportOccurrenceSchema,
  calendarEventImportSeriesSchema,
  calendarEventSchema,
  categoryAssignmentSchema,
  categoryValueSchema,
  changeLogSchema,
  importRunSchema,
  schoolYearSchema,
  type CalendarEvent,
  type CalendarEventImportOccurrence,
  type CalendarEventImportSeries,
  type CategoryAssignment,
  type CategoryValue,
  type ChangeLog,
  type ClassificationMappingPreset,
} from '@/domain/models/entities';
import { clearSupportedRedoBranch } from '@/features/editing/editCommandRegistry';
import { notifyEditHistoryChanged } from '@/features/editing/editHistorySignal';
import { applyImportOperations } from '@/features/importCenter/applyImportOperations';
import { classificationSummaryJson } from '@/features/importCenter/importClassificationResolution';
import {
  importClassificationMappingPresetOperations,
  validateImportClassificationMappingPresetState,
} from '@/features/importCenter/importClassificationMappingPresetPlan';
import {
  createImportCommand,
  deleteImportCategoryAssignmentOperation,
  deleteImportCategoryValueOperation,
  deleteCalendarEventImportOccurrenceOperation,
  deleteCalendarEventImportSeriesOperation,
  deleteImportedCalendarEventOperation,
  deleteImportRunOperation,
  putImportCategoryAssignmentOperation,
  putImportCategoryValueOperation,
  putCalendarEventImportOccurrenceOperation,
  putCalendarEventImportSeriesOperation,
  putImportedCalendarEventOperation,
  putImportRunOperation,
  serializeImportCommand,
  type ImportOperation,
} from '@/features/importCenter/importCommands';

import type { CalendarEventImportPreview } from './calendarEventImportModel';

export const MAX_CALENDAR_EVENT_IMPORT_COMMAND_BYTES = 20 * 1024 * 1024;

export interface CommitCalendarEventImportOptions {
  sourceKind: 'ics' | 'csv' | 'xlsx';
  sourceLabel?: string;
  worksheetName?: string;
  sourceContentFingerprint: string;
  confirmUpdates: boolean;
  confirmRemovals: boolean;
  confirmCommit: boolean;
}

export interface CalendarEventImportMutationDependencies {
  createId?: () => string;
  applyOperations?: typeof applyImportOperations;
}

export interface CalendarEventImportCommitResult {
  created: CalendarEvent[];
  updated: CalendarEvent[];
  removed: CalendarEvent[];
  skippedCount: number;
  createdCategoryValues: CategoryValue[];
  restoredCategoryValues: CategoryValue[];
  createdMappingPresets: ClassificationMappingPreset[];
  updatedMappingPresets: ClassificationMappingPreset[];
  earliestStartDate?: string;
  log: ChangeLog;
}

function sameRecord(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function sortedAssignments(values: readonly CategoryAssignment[]): CategoryAssignment[] {
  return [...values].sort((first, second) => first.id.localeCompare(second.id));
}

function commandSize(forwardJson: string, inverseJson: string): number {
  return (
    new TextEncoder().encode(forwardJson).byteLength +
    new TextEncoder().encode(inverseJson).byteLength
  );
}

export class CalendarEventImportMutationService {
  private readonly createId: () => string;
  private readonly applyOperations: typeof applyImportOperations;

  constructor(
    private readonly db: ClassroomDatabase = classroomDb,
    dependencies: CalendarEventImportMutationDependencies = {},
  ) {
    this.createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
    this.applyOperations = dependencies.applyOperations ?? applyImportOperations;
  }

  async commit(
    preview: CalendarEventImportPreview,
    options: CommitCalendarEventImportOptions,
  ): Promise<CalendarEventImportCommitResult> {
    if (!preview.canCommit) {
      throw new Error('Resolve every Review and Blocked Calendar Event before committing.');
    }
    if (!options.confirmCommit) {
      throw new Error(
        'Confirm that the complete reviewed Calendar Event preview should be committed.',
      );
    }
    if (
      preview.summary.createCount + preview.summary.updateCount + preview.summary.removeCount ===
      0
    ) {
      throw new Error('The reviewed Calendar Event preview contains no changes to commit.');
    }
    if (preview.summary.updateCount > 0 && !options.confirmUpdates) {
      throw new Error('Confirm the reviewed Calendar Event updates before committing.');
    }
    if (preview.summary.removeCount > 0 && !options.confirmRemovals) {
      throw new Error('Confirm the reviewed Calendar Event removals before committing.');
    }
    if (options.sourceKind !== preview.sourceKind) {
      throw new Error('The Calendar source kind changed after preview. Generate a new preview.');
    }
    if (options.sourceContentFingerprint !== preview.sourceContentFingerprint) {
      throw new Error('The Calendar source changed after preview. Generate a new preview.');
    }

    const result = await this.db.transaction(
      'rw',
      [
        this.db.schoolYears,
        this.db.calendarEvents,
        this.db.calendarEventImportSeries,
        this.db.calendarEventImportOccurrences,
        this.db.categoryValues,
        this.db.categoryAssignments,
        this.db.classificationMappingPresets,
        this.db.importRuns,
        this.db.changeLog,
      ],
      async (): Promise<CalendarEventImportCommitResult> => {
        if (await this.db.importRuns.get(preview.importRunId)) {
          throw new Error('This reviewed Calendar Event import has already been committed.');
        }
        const currentSchoolYear = await this.db.schoolYears.get(preview.schoolYear.id);
        if (
          !currentSchoolYear ||
          !sameRecord(schoolYearSchema.parse(currentSchoolYear), preview.schoolYear) ||
          !currentSchoolYear.active ||
          currentSchoolYear.lifecycleState === 'archived'
        ) {
          throw new Error(
            'The destination School Year changed after preview. Generate a new preview.',
          );
        }

        await this.validateCategoryState(preview);
        await this.validateMappingState(preview);

        const currentEvents = (await this.db.calendarEvents.toArray()).map((value) =>
          calendarEventSchema.parse(value),
        );
        const currentByIdentity = new Map<string, CalendarEvent>();
        for (const event of currentEvents) {
          if (event.importIdentityKey) currentByIdentity.set(event.importIdentityKey, event);
        }

        const forwardEvents: ImportOperation[] = [];
        const inverseEvents: ImportOperation[] = [];
        const forwardAssignments: ImportOperation[] = [];
        const inverseAssignments: ImportOperation[] = [];
        const forwardSeries: ImportOperation[] = [];
        const inverseSeries: ImportOperation[] = [];
        const forwardOccurrences: ImportOperation[] = [];
        const inverseOccurrences: ImportOperation[] = [];
        const created: CalendarEvent[] = [];
        const updated: CalendarEvent[] = [];
        const removed: CalendarEvent[] = [];
        const validatedSeries = new Set<string>();
        const validatedOccurrences = new Set<string>();
        const writtenSeries = new Set<string>();
        const writtenOccurrences = new Set<string>();

        for (const row of preview.rows) {
          if (row.classification === 'review' || row.classification === 'blocked') {
            throw new Error(`Row ${row.sourceRow} is not eligible for Calendar Event import.`);
          }
          const plan = row.planned;
          if (!plan) {
            if (row.classification !== 'skip') {
              throw new Error(`Row ${row.sourceRow} has no reviewed Calendar Event plan.`);
            }
            continue;
          }

          if (plan.expectedSeries && !validatedSeries.has(plan.expectedSeries.id)) {
            await this.validateExpectedSeries(plan.expectedSeries, row.sourceRow);
            validatedSeries.add(plan.expectedSeries.id);
          }
          if (plan.expectedOccurrence && !validatedOccurrences.has(plan.expectedOccurrence.id)) {
            await this.validateExpectedOccurrence(plan.expectedOccurrence, row.sourceRow);
            validatedOccurrences.add(plan.expectedOccurrence.id);
          }
          if (plan.series && !writtenSeries.has(plan.series.id)) {
            const series = calendarEventImportSeriesSchema.parse(plan.series);
            if (plan.expectedSeries) {
              if (plan.expectedSeries.id !== series.id) {
                throw new Error(`Row ${row.sourceRow} recurrence series ID changed after preview.`);
              }
              forwardSeries.push(putCalendarEventImportSeriesOperation(series));
              inverseSeries.unshift(putCalendarEventImportSeriesOperation(plan.expectedSeries));
            } else {
              if (await this.db.calendarEventImportSeries.get(series.id)) {
                throw new Error(`Row ${row.sourceRow} recurrence series ID changed after preview.`);
              }
              const owner = await this.db.calendarEventImportSeries
                .where('seriesIdentityKey')
                .equals(series.seriesIdentityKey)
                .first();
              if (owner) {
                throw new Error(
                  `Row ${row.sourceRow} recurrence series identity changed after preview.`,
                );
              }
              forwardSeries.push(putCalendarEventImportSeriesOperation(series));
              inverseSeries.unshift(deleteCalendarEventImportSeriesOperation(series.id));
            }
            writtenSeries.add(series.id);
          }
          if (plan.occurrence && !writtenOccurrences.has(plan.occurrence.id)) {
            const occurrence = calendarEventImportOccurrenceSchema.parse(plan.occurrence);
            if (plan.expectedOccurrence) {
              if (plan.expectedOccurrence.id !== occurrence.id) {
                throw new Error(
                  `Row ${row.sourceRow} recurrence occurrence ID changed after preview.`,
                );
              }
              forwardOccurrences.push(putCalendarEventImportOccurrenceOperation(occurrence));
              inverseOccurrences.unshift(
                putCalendarEventImportOccurrenceOperation(plan.expectedOccurrence),
              );
            } else {
              if (await this.db.calendarEventImportOccurrences.get(occurrence.id)) {
                throw new Error(
                  `Row ${row.sourceRow} recurrence occurrence ID changed after preview.`,
                );
              }
              const owner = await this.db.calendarEventImportOccurrences
                .where('occurrenceIdentityKey')
                .equals(occurrence.occurrenceIdentityKey)
                .first();
              if (owner) {
                throw new Error(
                  `Row ${row.sourceRow} recurrence occurrence identity changed after preview.`,
                );
              }
              forwardOccurrences.push(putCalendarEventImportOccurrenceOperation(occurrence));
              inverseOccurrences.unshift(
                deleteCalendarEventImportOccurrenceOperation(occurrence.id),
              );
            }
            writtenOccurrences.add(occurrence.id);
          }

          const expectedEvent = plan.existingEvent;
          if (expectedEvent) {
            await this.validateExpectedEvent(expectedEvent, row.sourceRow);
            await this.validateExpectedAssignments(
              expectedEvent.id,
              plan.expectedAssignments,
              row.sourceRow,
            );
          } else if (plan.expectedAssignments.length > 0) {
            throw new Error(`Row ${row.sourceRow} has invalid expected category assignments.`);
          }

          if (plan.eventMutation === 'put') {
            if (!plan.event)
              throw new Error(`Row ${row.sourceRow} has no reviewed Calendar Event.`);
            const planned = calendarEventSchema.parse(plan.event);
            if (expectedEvent) {
              if (planned.id !== expectedEvent.id) {
                throw new Error(`Row ${row.sourceRow} Calendar Event ID changed after preview.`);
              }
              const identity = planned.importIdentityKey;
              if (identity) {
                const identityOwner = currentByIdentity.get(identity);
                if (identityOwner && identityOwner.id !== expectedEvent.id) {
                  throw new Error(
                    `Row ${row.sourceRow} Calendar Event identity now belongs to another Event.`,
                  );
                }
              }
              updated.push(planned);
              forwardEvents.push(putImportedCalendarEventOperation(planned));
              inverseEvents.unshift(putImportedCalendarEventOperation(expectedEvent));
              if (
                expectedEvent.importIdentityKey &&
                expectedEvent.importIdentityKey !== planned.importIdentityKey
              ) {
                currentByIdentity.delete(expectedEvent.importIdentityKey);
              }
            } else {
              if (await this.db.calendarEvents.get(planned.id)) {
                throw new Error(`Row ${row.sourceRow} Calendar Event ID changed after preview.`);
              }
              const identity = planned.importIdentityKey;
              if (!identity) {
                throw new Error(`Row ${row.sourceRow} has no stable Calendar Event identity.`);
              }
              if (currentByIdentity.has(identity)) {
                throw new Error(
                  `Row ${row.sourceRow} Calendar Event identity changed after preview.`,
                );
              }
              created.push(planned);
              forwardEvents.push(putImportedCalendarEventOperation(planned));
              inverseEvents.unshift(deleteImportedCalendarEventOperation(planned.id));
            }
            if (planned.importIdentityKey)
              currentByIdentity.set(planned.importIdentityKey, planned);
          } else if (plan.eventMutation === 'delete') {
            if (!expectedEvent) {
              throw new Error(`Row ${row.sourceRow} has no expected Calendar Event to remove.`);
            }
            removed.push(expectedEvent);
            forwardEvents.push(deleteImportedCalendarEventOperation(expectedEvent.id));
            inverseEvents.unshift(putImportedCalendarEventOperation(expectedEvent));
            if (expectedEvent.importIdentityKey) {
              currentByIdentity.delete(expectedEvent.importIdentityKey);
            }
          } else if (row.classification === 'create' && !plan.occurrence && !plan.series) {
            throw new Error(`Row ${row.sourceRow} has no create operation.`);
          }

          for (const assignment of plan.assignmentsToDelete) {
            forwardAssignments.push(deleteImportCategoryAssignmentOperation(assignment.id));
            inverseAssignments.unshift(putImportCategoryAssignmentOperation(assignment));
          }
          for (const value of plan.assignmentsToCreate) {
            const assignment = categoryAssignmentSchema.parse(value);
            const existing = await this.db.categoryAssignments
              .where('[categoryValueId+entityType+entityId]')
              .equals([assignment.categoryValueId, assignment.entityType, assignment.entityId])
              .first();
            if (existing) {
              throw new Error(`Row ${row.sourceRow} category assignments changed after preview.`);
            }
            forwardAssignments.push(putImportCategoryAssignmentOperation(assignment));
            inverseAssignments.unshift(deleteImportCategoryAssignmentOperation(assignment.id));
          }
        }

        const forwardCategoryValues: ImportOperation[] = [];
        const inverseCategoryValues: ImportOperation[] = [];
        for (const value of preview.newCategoryValues) {
          forwardCategoryValues.push(putImportCategoryValueOperation(value));
          inverseCategoryValues.unshift(deleteImportCategoryValueOperation(value.id));
        }
        for (const change of preview.restoredCategoryValues) {
          forwardCategoryValues.push(putImportCategoryValueOperation(change.after));
          inverseCategoryValues.unshift(putImportCategoryValueOperation(change.before));
        }
        const mappingOperations = importClassificationMappingPresetOperations(preview);

        const importRun = importRunSchema.parse({
          id: preview.importRunId,
          importType: 'calendar-events',
          sourceKind: options.sourceKind,
          sourceLabel: options.sourceLabel?.trim() || undefined,
          worksheetName: options.worksheetName?.trim() || undefined,
          schoolYearId: preview.schoolYear.id,
          totalRows: preview.summary.total,
          createdCount: preview.summary.createCount,
          updatedCount: preview.summary.updateCount,
          removedCount: preview.summary.removeCount,
          skippedCount: preview.summary.skipCount,
          reviewCount: 0,
          blockedCount: 0,
          summaryJson: classificationSummaryJson({
            sourceFingerprint: preview.sourceContentFingerprint,
            defaults: preview.defaults,
            newCategoryValues: preview.newCategoryValues,
            restoredCategoryValues: preview.restoredCategoryValues,
            classificationAudit: preview.classificationAudit,
            classificationMappingAudit: preview.classificationMappingAudit,
            additionalSummary: {
              schoolYear: preview.schoolYear,
              sourceKind: preview.sourceKind,
              outcomes: preview.outcomeAudit,
              parserDiagnostics: preview.parserDiagnostics,
            },
          }),
          committedAt: preview.generatedAt,
        });

        const forward = createImportCommand([
          ...forwardCategoryValues,
          ...mappingOperations.forward,
          ...forwardSeries,
          ...forwardEvents,
          ...forwardAssignments,
          ...forwardOccurrences,
          putImportRunOperation(importRun),
        ]);
        const inverse = createImportCommand([
          ...inverseOccurrences,
          ...inverseAssignments,
          ...inverseEvents,
          ...inverseSeries,
          ...mappingOperations.inverse,
          ...inverseCategoryValues,
          deleteImportRunOperation(importRun.id),
        ]);
        const forwardJson = serializeImportCommand(forward);
        const inverseJson = serializeImportCommand(inverse);
        if (commandSize(forwardJson, inverseJson) > MAX_CALENDAR_EVENT_IMPORT_COMMAND_BYTES) {
          throw new Error(
            'This reviewed Calendar Event import is too large for safe Undo/Redo. Split the source into smaller imports.',
          );
        }
        const changedEventCount = created.length + updated.length + removed.length;
        const changedMetadataCount = writtenSeries.size + writtenOccurrences.size;
        const log = changeLogSchema.parse({
          id: this.createId(),
          label: `Reconcile ${changedEventCount || changedMetadataCount} reviewed Calendar Event${changedEventCount === 1 ? '' : 's'}`,
          commandType: 'import-center.calendar-events.reviewed',
          forwardJson,
          inverseJson,
          createdAt: preview.generatedAt,
        });

        await clearSupportedRedoBranch(this.db);
        await this.applyOperations(this.db, forward.operations);
        await this.db.changeLog.put(log);

        return {
          created,
          updated,
          removed,
          skippedCount: preview.summary.skipCount,
          createdCategoryValues: preview.newCategoryValues,
          restoredCategoryValues: preview.restoredCategoryValues.map((value) => value.after),
          createdMappingPresets: preview.newMappingPresets,
          updatedMappingPresets: preview.updatedMappingPresets.map((value) => value.after),
          earliestStartDate: preview.earliestCommittedStartDate,
          log,
        };
      },
    );

    notifyEditHistoryChanged({
      canUndo: true,
      canRedo: false,
      undoLabel: result.log.label,
    });
    return result;
  }

  private async validateExpectedSeries(
    expected: CalendarEventImportSeries,
    sourceRow: number,
  ): Promise<void> {
    const current = await this.db.calendarEventImportSeries.get(expected.id);
    if (!current || !sameRecord(calendarEventImportSeriesSchema.parse(current), expected)) {
      throw new Error(
        `Row ${sourceRow} recurrence series changed after preview. Generate a new preview.`,
      );
    }
  }

  private async validateExpectedOccurrence(
    expected: CalendarEventImportOccurrence,
    sourceRow: number,
  ): Promise<void> {
    const current = await this.db.calendarEventImportOccurrences.get(expected.id);
    if (!current || !sameRecord(calendarEventImportOccurrenceSchema.parse(current), expected)) {
      throw new Error(
        `Row ${sourceRow} recurrence occurrence changed after preview. Generate a new preview.`,
      );
    }
  }

  private async validateExpectedEvent(expected: CalendarEvent, sourceRow: number): Promise<void> {
    const current = await this.db.calendarEvents.get(expected.id);
    if (!current || !sameRecord(calendarEventSchema.parse(current), expected)) {
      throw new Error(
        `Row ${sourceRow} Calendar Event changed after preview. Generate a new preview.`,
      );
    }
  }

  private async validateExpectedAssignments(
    entityId: string | undefined,
    expected: readonly CategoryAssignment[],
    sourceRow: number,
  ): Promise<void> {
    if (!entityId) {
      if (expected.length > 0)
        throw new Error(`Row ${sourceRow} has invalid expected assignments.`);
      return;
    }
    const current = (
      await this.db.categoryAssignments
        .where('[entityType+entityId]')
        .equals(['calendar-event', entityId])
        .toArray()
    )
      .map((value) => categoryAssignmentSchema.parse(value))
      .filter((value) => value.familyId === 'calendar-event-type');
    if (!sameRecord(sortedAssignments(current), sortedAssignments(expected))) {
      throw new Error(
        `Row ${sourceRow} category assignments changed after preview. Generate a new preview.`,
      );
    }
  }

  private async validateMappingState(preview: CalendarEventImportPreview): Promise<void> {
    const valuesAfterCommit = new Map(
      (await this.db.categoryValues.toArray())
        .map((value) => categoryValueSchema.parse(value))
        .map((value) => [value.id, value] as const),
    );
    for (const value of preview.newCategoryValues) valuesAfterCommit.set(value.id, value);
    for (const change of preview.restoredCategoryValues)
      valuesAfterCommit.set(change.after.id, change.after);
    await validateImportClassificationMappingPresetState({
      db: this.db,
      expectedMappingPresets: preview.expectedMappingPresets,
      newMappingPresets: preview.newMappingPresets,
      updatedMappingPresets: preview.updatedMappingPresets,
      categoryValuesAfterCommit: [...valuesAfterCommit.values()],
    });
  }

  private async validateCategoryState(preview: CalendarEventImportPreview): Promise<void> {
    for (const expected of preview.expectedCategoryValues) {
      const current = await this.db.categoryValues.get(expected.id);
      if (!current || !sameRecord(categoryValueSchema.parse(current), expected)) {
        throw new Error(
          `Category “${expected.name}” changed after preview. Generate a new preview.`,
        );
      }
    }
    for (const change of preview.restoredCategoryValues) {
      const current = await this.db.categoryValues.get(change.before.id);
      if (!current || !sameRecord(categoryValueSchema.parse(current), change.before)) {
        throw new Error(
          `Category “${change.before.name}” changed after preview. Generate a new preview.`,
        );
      }
    }
    const currentValues = (await this.db.categoryValues.toArray()).map((value) =>
      categoryValueSchema.parse(value),
    );
    for (const value of preview.newCategoryValues) {
      if (await this.db.categoryValues.get(value.id)) {
        throw new Error(`New category “${value.name}” changed after preview.`);
      }
      const collision = currentValues.find(
        (current) =>
          current.familyId === value.familyId &&
          (current.normalizedName === value.normalizedName ||
            current.normalizedAliases.includes(value.normalizedName)),
      );
      if (collision) {
        throw new Error(
          `Category “${value.name}” now conflicts with “${collision.name}”. Generate a new preview.`,
        );
      }
    }
  }
}

export const calendarEventImportMutationService = new CalendarEventImportMutationService();

import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  calendarEventSchema,
  categoryValueSchema,
  changeLogSchema,
  schoolYearSchema,
  type CalendarEvent,
  type CategoryValue,
  type ChangeLog,
} from '@/domain/models/entities';
import {
  buildCategoryAssignmentChangePlan,
  listCategoryAssignmentsForDeletion,
} from '@/features/categories/categoryAssignmentSelection';

import {
  createCalendarEventCommand,
  deleteCalendarEventCategoryAssignmentOperation,
  deleteCalendarEventOperation,
  putCalendarEventCategoryAssignmentOperation,
  putCalendarEventOperation,
  serializeCalendarEventCommand,
  type CalendarEventCommandPair,
  type CalendarEventOperation,
} from './calendarEventCommands';
import {
  parseCalendarEventEditorValues,
  type CalendarEventEditorValues,
} from './calendarEventEditorModel';
import { clearSupportedRedoBranch } from './editCommandRegistry';
import { notifyEditHistoryChanged } from './editHistorySignal';

export interface CalendarEventMutationDependencies {
  createId?: () => string;
  now?: () => string;
}

export class CalendarEventMutationService {
  private readonly createId: () => string;
  private readonly now: () => string;

  constructor(
    private readonly db: ClassroomDatabase = classroomDb,
    dependencies: CalendarEventMutationDependencies = {},
  ) {
    this.createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  async create(values: CalendarEventEditorValues): Promise<CalendarEvent> {
    const parsed = parseCalendarEventEditorValues(values);
    const result = await this.db.transaction(
      'rw',
      [
        this.db.schoolYears,
        this.db.calendarEvents,
        this.db.categoryValues,
        this.db.categoryAssignments,
        this.db.changeLog,
      ],
      async () => {
        await this.requireSchoolYear(parsed.fields.schoolYearId, false);
        const eventId = this.createId();
        if (await this.db.calendarEvents.get(eventId)) {
          throw new Error('Calendar event ID already exists.');
        }
        const categoryValue = await this.resolveSelectedType(parsed.categoryValueId, false);
        const record = calendarEventSchema.parse({
          id: eventId,
          ...parsed.fields,
          category: categoryValue?.name ?? parsed.fields.category,
          source: 'user',
        });
        const assignmentPlan = await buildCategoryAssignmentChangePlan(
          this.db,
          'calendar-event',
          record.id,
          {
            selections: { 'calendar-event-type': categoryValue ? [categoryValue.id] : [] },
            allowedFamilyIds: ['calendar-event-type'],
            createId: this.createId,
            now: this.now(),
          },
        );
        const commands: CalendarEventCommandPair = {
          forward: createCalendarEventCommand([
            putCalendarEventOperation(record),
            ...assignmentPlan.forward,
          ]),
          inverse: createCalendarEventCommand([
            ...assignmentPlan.inverse,
            deleteCalendarEventOperation(record.id),
          ]),
        };
        const log = this.createChangeLog(
          'calendar-event.create',
          `Create “${record.title}”`,
          commands,
        );
        await this.commit(commands.forward.operations, log);
        return { record, log };
      },
    );
    this.notifyNewChange(result.log);
    return result.record;
  }

  async update(id: string, values: CalendarEventEditorValues): Promise<CalendarEvent> {
    const parsed = parseCalendarEventEditorValues(values);
    const result = await this.db.transaction(
      'rw',
      [
        this.db.schoolYears,
        this.db.calendarEvents,
        this.db.categoryValues,
        this.db.categoryAssignments,
        this.db.changeLog,
      ],
      async () => {
        const existingValue = await this.db.calendarEvents.get(id);
        if (!existingValue) throw new Error('Calendar event no longer exists.');
        const existing = calendarEventSchema.parse(existingValue);
        await this.requireSchoolYear(
          parsed.fields.schoolYearId,
          existing.schoolYearId === parsed.fields.schoolYearId,
        );
        const existingTypeAssignment = await this.db.categoryAssignments
          .where('[familyId+entityType+entityId]')
          .equals(['calendar-event-type', 'calendar-event', id])
          .first();
        const categoryValue = await this.resolveSelectedType(
          parsed.categoryValueId,
          existingTypeAssignment?.categoryValueId === parsed.categoryValueId,
        );
        const updated = calendarEventSchema.parse({
          ...existing,
          ...parsed.fields,
          id,
          category: categoryValue?.name ?? parsed.fields.category,
        });
        const assignmentPlan = await buildCategoryAssignmentChangePlan(
          this.db,
          'calendar-event',
          id,
          {
            selections: { 'calendar-event-type': categoryValue ? [categoryValue.id] : [] },
            allowedFamilyIds: ['calendar-event-type'],
            createId: this.createId,
            now: this.now(),
          },
        );
        if (
          JSON.stringify(existing) === JSON.stringify(updated) &&
          assignmentPlan.forward.length === 0
        ) {
          throw new Error('The Calendar event is unchanged.');
        }
        const commands: CalendarEventCommandPair = {
          forward: createCalendarEventCommand([
            putCalendarEventOperation(updated),
            ...assignmentPlan.forward,
          ]),
          inverse: createCalendarEventCommand([
            ...assignmentPlan.inverse,
            putCalendarEventOperation(existing),
          ]),
        };
        const log = this.createChangeLog(
          'calendar-event.update',
          `Edit “${updated.title}”`,
          commands,
        );
        await this.commit(commands.forward.operations, log);
        return { updated, log };
      },
    );

    this.notifyNewChange(result.log);
    return result.updated;
  }

  async delete(id: string): Promise<void> {
    const log = await this.db.transaction(
      'rw',
      [this.db.calendarEvents, this.db.categoryAssignments, this.db.changeLog],
      async () => {
        const existingValue = await this.db.calendarEvents.get(id);
        if (!existingValue) throw new Error('Calendar event no longer exists.');
        const existing = calendarEventSchema.parse(existingValue);
        const assignments = await listCategoryAssignmentsForDeletion(this.db, 'calendar-event', id);
        const commands: CalendarEventCommandPair = {
          forward: createCalendarEventCommand([
            ...assignments.map((assignment) =>
              deleteCalendarEventCategoryAssignmentOperation(assignment.id),
            ),
            deleteCalendarEventOperation(id),
          ]),
          inverse: createCalendarEventCommand([
            putCalendarEventOperation(existing),
            ...assignments.map(putCalendarEventCategoryAssignmentOperation),
          ]),
        };
        const nextLog = this.createChangeLog(
          'calendar-event.delete',
          `Delete “${existing.title}”`,
          commands,
        );
        await this.commit(commands.forward.operations, nextLog);
        return nextLog;
      },
    );

    this.notifyNewChange(log);
  }

  private async resolveSelectedType(
    categoryValueId: string | undefined,
    allowRetainedArchived: boolean,
  ): Promise<CategoryValue | undefined> {
    if (!categoryValueId) return undefined;
    const raw = await this.db.categoryValues.get(categoryValueId);
    if (!raw) throw new Error('The selected Calendar Event Type no longer exists.');
    const value = categoryValueSchema.parse(raw);
    if (value.familyId !== 'calendar-event-type') {
      throw new Error('Choose a Calendar Event Type value.');
    }
    if (value.lifecycleState === 'merged') {
      throw new Error('Merged Calendar Event Types cannot remain assigned.');
    }
    if (value.lifecycleState !== 'active' && !allowRetainedArchived) {
      throw new Error('Archived Calendar Event Types cannot be newly assigned.');
    }
    return value;
  }

  private async requireSchoolYear(
    id: string | undefined,
    allowRetainedArchived: boolean,
  ): Promise<void> {
    if (!id) return;
    const value = await this.db.schoolYears.get(id);
    if (!value) throw new Error('The selected School Year no longer exists.');
    const schoolYear = schoolYearSchema.parse(value);
    if (schoolYear.lifecycleState === 'archived' && !allowRetainedArchived) {
      throw new Error('Archived School Years cannot be newly assigned to Calendar events.');
    }
  }

  private async commit(
    operations: readonly CalendarEventOperation[],
    log: ChangeLog,
  ): Promise<void> {
    await clearSupportedRedoBranch(this.db);
    for (const operation of operations) {
      if (operation.table === 'calendarEvents') {
        if (operation.action === 'put') await this.db.calendarEvents.put(operation.record);
        else await this.db.calendarEvents.delete(operation.id);
      } else if (operation.action === 'put') {
        await this.db.categoryAssignments.put(operation.record);
      } else {
        await this.db.categoryAssignments.delete(operation.id);
      }
    }
    await this.db.changeLog.put(log);
  }

  private createChangeLog(
    commandType: string,
    label: string,
    commands: CalendarEventCommandPair,
  ): ChangeLog {
    return changeLogSchema.parse({
      id: this.createId(),
      label,
      commandType,
      forwardJson: serializeCalendarEventCommand(commands.forward),
      inverseJson: serializeCalendarEventCommand(commands.inverse),
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

export const calendarEventMutationService = new CalendarEventMutationService();

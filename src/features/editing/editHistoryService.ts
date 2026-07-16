import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { changeLogSchema, type ChangeLog } from '@/domain/models/entities';
import {
  isCalendarEventChangeLog,
  parseCalendarEventCommand,
  type CalendarEventCommand,
} from './calendarEventCommands';
import { notifyEditHistoryChanged } from './editHistorySignal';
import {
  compareEditHistoryLogs,
  deriveEditHistoryState,
  findRedoTarget,
  findUndoTarget,
  type EditHistoryState,
} from './editHistoryState';

export type { EditHistoryState } from './editHistoryState';

export interface EditHistoryDependencies {
  now?: () => string;
}

export class EditHistoryService {
  private readonly now: () => string;

  constructor(
    private readonly db: ClassroomDatabase = classroomDb,
    dependencies: EditHistoryDependencies = {},
  ) {
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  async getState(): Promise<EditHistoryState> {
    return deriveEditHistoryState(await this.listLogs());
  }

  async undo(): Promise<void> {
    const nextState = await this.db.transaction(
      'rw',
      this.db.calendarEvents,
      this.db.changeLog,
      async () => {
        const logs = await this.listLogs();
        const target = findUndoTarget(logs);
        if (!target) return deriveEditHistoryState(logs);

        await this.apply(parseCalendarEventCommand(target.inverseJson));
        const updatedTarget = changeLogSchema.parse({ ...target, undoneAt: this.now() });
        await this.db.changeLog.put(updatedTarget);

        return deriveEditHistoryState(
          logs.map((log) => (log.id === updatedTarget.id ? updatedTarget : log)),
        );
      },
    );

    notifyEditHistoryChanged(nextState);
  }

  async redo(): Promise<void> {
    const nextState = await this.db.transaction(
      'rw',
      this.db.calendarEvents,
      this.db.changeLog,
      async () => {
        const logs = await this.listLogs();
        const target = findRedoTarget(logs);
        if (!target) return deriveEditHistoryState(logs);

        await this.apply(parseCalendarEventCommand(target.forwardJson));
        const updatedTarget = changeLogSchema.parse({ ...target, undoneAt: undefined });
        await this.db.changeLog.put(updatedTarget);

        return deriveEditHistoryState(
          logs.map((log) => (log.id === updatedTarget.id ? updatedTarget : log)),
        );
      },
    );

    notifyEditHistoryChanged(nextState);
  }

  private async listLogs(): Promise<ChangeLog[]> {
    const values = await this.db.changeLog
      .where('commandType')
      .startsWith('calendar-event.')
      .toArray();
    const logs: ChangeLog[] = [];

    for (const value of values) {
      const parsed = changeLogSchema.safeParse(value);
      if (!parsed.success || !isCalendarEventChangeLog(parsed.data)) continue;
      parseCalendarEventCommand(parsed.data.forwardJson);
      parseCalendarEventCommand(parsed.data.inverseJson);
      logs.push(parsed.data);
    }

    return logs.sort(compareEditHistoryLogs);
  }

  private async apply(command: CalendarEventCommand): Promise<void> {
    if (command.action === 'put') {
      await this.db.calendarEvents.put(command.record);
    } else {
      await this.db.calendarEvents.delete(command.id);
    }
  }
}

export const editHistoryService = new EditHistoryService();

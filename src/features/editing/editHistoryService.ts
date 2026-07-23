import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { changeLogSchema } from '@/domain/models/entities';

import {
  applySupportedEditCommand,
  listSupportedEditLogs,
  parseSupportedEditCommand,
} from './editCommandRegistry';
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
      [
        this.db.calendarEvents,
        this.db.categoryValues,
        this.db.categoryAssignments,
        this.db.schoolYears,
        this.db.learnerContexts,
        this.db.learnerNotices,
        this.db.learnerServiceOccurrences,
        this.db.contextMemberships,
        this.db.scheduleBlocks,
        this.db.scheduleExceptions,
        this.db.lessonSeries,
        this.db.lessonPlans,
        this.db.sessionOccurrences,
        this.db.tasks,
        this.db.reminders,
        this.db.changeLog,
      ],
      async () => {
        const logs = await this.listLogs();
        const target = findUndoTarget(logs);
        if (!target) return deriveEditHistoryState(logs);
        await applySupportedEditCommand(
          this.db,
          parseSupportedEditCommand(target.commandType, target.inverseJson),
        );
        const updatedTarget = changeLogSchema.parse({
          ...target,
          undoneAt: this.now(),
        });
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
      [
        this.db.calendarEvents,
        this.db.categoryValues,
        this.db.categoryAssignments,
        this.db.schoolYears,
        this.db.learnerContexts,
        this.db.learnerNotices,
        this.db.learnerServiceOccurrences,
        this.db.contextMemberships,
        this.db.scheduleBlocks,
        this.db.scheduleExceptions,
        this.db.lessonSeries,
        this.db.lessonPlans,
        this.db.sessionOccurrences,
        this.db.tasks,
        this.db.reminders,
        this.db.changeLog,
      ],
      async () => {
        const logs = await this.listLogs();
        const target = findRedoTarget(logs);
        if (!target) return deriveEditHistoryState(logs);
        await applySupportedEditCommand(
          this.db,
          parseSupportedEditCommand(target.commandType, target.forwardJson),
        );
        const updatedTarget = changeLogSchema.parse({
          ...target,
          undoneAt: undefined,
        });
        await this.db.changeLog.put(updatedTarget);
        return deriveEditHistoryState(
          logs.map((log) => (log.id === updatedTarget.id ? updatedTarget : log)),
        );
      },
    );
    notifyEditHistoryChanged(nextState);
  }

  private async listLogs() {
    return (await listSupportedEditLogs(this.db)).sort(compareEditHistoryLogs);
  }
}

export const editHistoryService = new EditHistoryService();

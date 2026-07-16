import type { ChangeLog } from '@/domain/models/entities';

export interface EditHistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string;
  redoLabel?: string;
}

export function compareEditHistoryLogs(first: ChangeLog, second: ChangeLog): number {
  return first.createdAt.localeCompare(second.createdAt) || first.id.localeCompare(second.id);
}

export function findUndoTarget(logs: readonly ChangeLog[]): ChangeLog | undefined {
  return [...logs].reverse().find((log) => !log.undoneAt);
}

export function findRedoTarget(logs: readonly ChangeLog[]): ChangeLog | undefined {
  let lastActiveIndex = -1;
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    if (!logs[index]?.undoneAt) {
      lastActiveIndex = index;
      break;
    }
  }
  return logs.slice(lastActiveIndex + 1).find((log) => Boolean(log.undoneAt));
}

export function deriveEditHistoryState(logs: readonly ChangeLog[]): EditHistoryState {
  const sorted = [...logs].sort(compareEditHistoryLogs);
  const undoTarget = findUndoTarget(sorted);
  const redoTarget = findRedoTarget(sorted);

  return {
    canUndo: Boolean(undoTarget),
    canRedo: Boolean(redoTarget),
    undoLabel: undoTarget?.label,
    redoLabel: redoTarget?.label,
  };
}

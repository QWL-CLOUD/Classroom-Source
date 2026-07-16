import { describe, expect, it } from 'vitest';

import type { ChangeLog } from '@/domain/models/entities';
import { deriveEditHistoryState } from './editHistoryState';

function log(id: string, label: string, undoneAt?: string): ChangeLog {
  return {
    id,
    label,
    commandType: 'calendar-event.update',
    forwardJson: '{}',
    inverseJson: '{}',
    createdAt: `2026-07-16T12:00:0${id}.000Z`,
    undoneAt,
  };
}

describe('deriveEditHistoryState', () => {
  it('derives undo and redo targets from persisted logs', () => {
    expect(deriveEditHistoryState([log('1', 'Create'), log('2', 'Edit')])).toEqual({
      canUndo: true,
      canRedo: false,
      undoLabel: 'Edit',
      redoLabel: undefined,
    });

    expect(
      deriveEditHistoryState([log('1', 'Create'), log('2', 'Edit', '2026-07-16T13:00:00.000Z')]),
    ).toEqual({
      canUndo: true,
      canRedo: true,
      undoLabel: 'Create',
      redoLabel: 'Edit',
    });
  });
});

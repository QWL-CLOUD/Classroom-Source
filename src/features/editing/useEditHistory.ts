import { useCallback, useEffect, useRef, useState } from 'react';

import { editHistoryService, type EditHistoryService } from './editHistoryService';
import { subscribeEditHistoryChanged } from './editHistorySignal';
import type { EditHistoryState } from './editHistoryState';

const emptyState: EditHistoryState = {
  canUndo: false,
  canRedo: false,
};

export function useEditHistory(service: EditHistoryService = editHistoryService) {
  const [state, setState] = useState<EditHistoryState>(emptyState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const acceptState = useCallback((nextState: EditHistoryState): void => {
    requestSequence.current += 1;
    setState(nextState);
    setError(null);
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;

    try {
      const nextState = await service.getState();
      if (requestSequence.current === requestId) {
        setState(nextState);
        setError(null);
      }
    } catch (cause) {
      if (requestSequence.current === requestId) {
        setError(cause instanceof Error ? cause.message : 'History state could not be loaded.');
      }
    }
  }, [service]);

  useEffect(() => {
    const unsubscribe = subscribeEditHistoryChanged(acceptState);
    void refresh();
    return unsubscribe;
  }, [acceptState, refresh]);

  async function run(action: () => Promise<void>): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'History action failed.');
    } finally {
      setBusy(false);
    }
  }

  return {
    canUndo: state.canUndo,
    canRedo: state.canRedo,
    undoLabel: state.undoLabel,
    redoLabel: state.redoLabel,
    busy,
    error,
    undo: () => run(() => service.undo()),
    redo: () => run(() => service.redo()),
  };
}

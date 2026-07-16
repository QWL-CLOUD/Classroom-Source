import type { EditHistoryState } from './editHistoryState';

type EditHistoryListener = (state: EditHistoryState) => void;

const EDIT_HISTORY_STATE_EVENT = 'classroom:edit-history-state';
const fallbackListeners = new Set<EditHistoryListener>();

function hasBrowserEventBus(): boolean {
  return (
    typeof globalThis.addEventListener === 'function' &&
    typeof globalThis.removeEventListener === 'function' &&
    typeof globalThis.dispatchEvent === 'function' &&
    typeof globalThis.CustomEvent === 'function'
  );
}

function isEditHistoryState(value: unknown): value is EditHistoryState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<EditHistoryState>;
  return typeof candidate.canUndo === 'boolean' && typeof candidate.canRedo === 'boolean';
}

export function notifyEditHistoryChanged(state: EditHistoryState): void {
  if (hasBrowserEventBus()) {
    globalThis.dispatchEvent(
      new globalThis.CustomEvent<EditHistoryState>(EDIT_HISTORY_STATE_EVENT, {
        detail: state,
      }),
    );
    return;
  }

  for (const listener of [...fallbackListeners]) listener(state);
}

export function subscribeEditHistoryChanged(listener: EditHistoryListener): () => void {
  if (hasBrowserEventBus()) {
    const handleEvent = (event: Event): void => {
      if (!(event instanceof globalThis.CustomEvent)) return;
      if (isEditHistoryState(event.detail)) listener(event.detail);
    };

    globalThis.addEventListener(EDIT_HISTORY_STATE_EVENT, handleEvent);
    return () => globalThis.removeEventListener(EDIT_HISTORY_STATE_EVENT, handleEvent);
  }

  fallbackListeners.add(listener);
  return () => fallbackListeners.delete(listener);
}

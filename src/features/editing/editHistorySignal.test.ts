import { describe, expect, it } from 'vitest';

import { notifyEditHistoryChanged, subscribeEditHistoryChanged } from './editHistorySignal';

describe('edit history state signal', () => {
  it('delivers the committed state to active subscribers', () => {
    const states: boolean[] = [];
    const unsubscribe = subscribeEditHistoryChanged((state) => {
      states.push(state.canUndo);
    });

    notifyEditHistoryChanged({ canUndo: true, canRedo: false, undoLabel: 'Create event' });
    expect(states).toEqual([true]);

    unsubscribe();
    notifyEditHistoryChanged({ canUndo: false, canRedo: true });
    expect(states).toEqual([true]);
  });
});

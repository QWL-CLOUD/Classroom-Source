import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EditorActionMenu } from './EditorActionMenu';

describe('EditorActionMenu', () => {
  it('closes after an enabled action runs', async () => {
    const user = userEvent.setup();
    const onRun = vi.fn();
    render(
      <EditorActionMenu label="More task actions">
        <button type="button" onClick={onRun}>
          Edit task
        </button>
      </EditorActionMenu>,
    );

    const summary = screen.getByText('More task actions').closest('summary');
    expect(summary).not.toBeNull();
    await user.click(summary!);
    expect(summary!.closest('details')).toHaveAttribute('open');

    await user.click(screen.getByRole('button', { name: 'Edit task' }));

    expect(onRun).toHaveBeenCalledOnce();
    expect(summary!.closest('details')).not.toHaveAttribute('open');
  });

  it('closes on Escape and restores focus to the summary', async () => {
    const user = userEvent.setup();
    render(
      <EditorActionMenu>
        <button type="button">Delete</button>
      </EditorActionMenu>,
    );

    const summary = screen.getByText('More').closest('summary');
    expect(summary).not.toBeNull();
    await user.click(summary!);
    fireEvent.keyDown(summary!.closest('details')!, { key: 'Escape' });

    expect(summary!.closest('details')).not.toHaveAttribute('open');
    expect(summary).toHaveFocus();
  });
});

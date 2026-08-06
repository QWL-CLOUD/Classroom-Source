import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppErrorBoundary } from './AppErrorBoundary';

let shouldThrow = true;

function UnstableView() {
  if (shouldThrow) throw new Error('Synthetic render failure with private details.');
  return <p>Recovered workspace</p>;
}

describe('AppErrorBoundary', () => {
  beforeEach(() => {
    shouldThrow = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows privacy-safe recovery actions without rendering error details', () => {
    render(
      <AppErrorBoundary>
        <UnstableView />
      </AppErrorBoundary>,
    );

    expect(
      screen.getByRole('heading', { name: 'This view could not be opened safely.' }),
    ).toBeVisible();
    expect(screen.getByText(/does not itself delete/)).toBeVisible();
    expect(screen.queryByText(/Synthetic render failure/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'System Health' })).toHaveAttribute(
      'href',
      '#/system-health',
    );
    expect(screen.getByRole('link', { name: 'Backup & Recovery' })).toHaveAttribute(
      'href',
      '#/export',
    );
  });

  it('can reset the boundary after the failing condition is resolved', () => {
    render(
      <AppErrorBoundary>
        <UnstableView />
      </AppErrorBoundary>,
    );

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try this view again' }));

    expect(screen.getByText('Recovered workspace')).toBeVisible();
  });
});

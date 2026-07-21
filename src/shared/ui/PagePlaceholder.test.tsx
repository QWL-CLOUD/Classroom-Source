import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PagePlaceholder } from './PagePlaceholder';

describe('PagePlaceholder', () => {
  it('labels unfinished workspaces as planned and names the owning phase', () => {
    render(
      <MemoryRouter>
        <PagePlaceholder
          eyebrow="Resources"
          title="Library"
          description="Reusable teaching content."
          status="planned"
          phase="Phase 3E-2"
          nextStep="Categories & Labels comes first."
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Library' })).toBeVisible();
    expect(screen.getByText('Planned')).toBeVisible();
    expect(screen.getByText('Phase 3E-2')).toBeVisible();
    expect(screen.queryByText('Not available in this build')).not.toBeInTheDocument();
  });

  it('offers grounded links to workspaces that are already available', () => {
    render(
      <MemoryRouter>
        <PagePlaceholder
          eyebrow="Reflect"
          title="Teaching Insights"
          description="Future teaching analysis."
          status="planned"
          availableNow={[{ to: '/learners', label: 'Open Learners' }]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Open Learners' })).toHaveAttribute(
      'href',
      '/learners',
    );
  });
});

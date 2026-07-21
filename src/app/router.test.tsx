import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { TodayRoute } from '@/routes/TodayRoute';

function renderToday() {
  const router = createMemoryRouter([{ path: '/today', element: <TodayRoute /> }], {
    initialEntries: ['/today?date=2026-07-14'],
  });
  return render(<RouterProvider router={router} />);
}

describe('Today route', () => {
  it('uses the URL date as the visible page date', () => {
    renderToday();
    expect(screen.getAllByText(/Tuesday, July 14, 2026/)).toHaveLength(1);
  });
});

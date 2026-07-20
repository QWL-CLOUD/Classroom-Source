import { describe, expect, it } from 'vitest';

import { buildShellNavigationHref } from './workspaceNavigation';

describe('buildShellNavigationHref', () => {
  it('preserves the selected date between workspace routes', () => {
    expect(buildShellNavigationHref('/tasks', '?date=2026-07-20')).toBe('/tasks?date=2026-07-20');
  });

  it('carries learner selection context through another workspace route', () => {
    expect(
      buildShellNavigationHref(
        '/today',
        '?date=2026-07-20&context=class-a&status=active&planning=upcoming',
      ),
    ).toBe('/today?date=2026-07-20&context=class-a&status=active&planning=upcoming');
  });

  it('restores learner selection when returning to Learners', () => {
    expect(
      buildShellNavigationHref(
        '/learners',
        '?date=2026-07-20&context=class-a&status=archived&planning=completed',
      ),
    ).toBe('/learners?date=2026-07-20&context=class-a&status=archived&planning=completed');
  });

  it('drops an invalid date while retaining safe workspace context', () => {
    expect(buildShellNavigationHref('/week', '?date=not-a-date&context=class-a')).toBe(
      '/week?context=class-a',
    );
  });

  it('does not append workspace context to system routes', () => {
    expect(buildShellNavigationHref('/settings', '?date=2026-07-20&context=class-a')).toBe(
      '/settings',
    );
  });
});

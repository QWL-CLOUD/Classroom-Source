import { describe, expect, it } from 'vitest';

import {
  DEFAULT_NAVIGATION_GROUP_PREFERENCES,
  navigationGroupForPath,
  parseNavigationGroupPreferences,
  readNavigationGroupPreferences,
  writeNavigationGroupPreferences,
} from './navigationGroups';

describe('navigation group preferences', () => {
  it('uses a practical default hierarchy for daily work', () => {
    expect(parseNavigationGroupPreferences(null)).toEqual({
      resources: true,
      reflect: false,
      settingsData: false,
    });
  });

  it('preserves valid stored choices while repairing invalid values', () => {
    expect(
      parseNavigationGroupPreferences(
        JSON.stringify({ resources: false, reflect: true, settingsData: 'open' }),
      ),
    ).toEqual({
      resources: false,
      reflect: true,
      settingsData: DEFAULT_NAVIGATION_GROUP_PREFERENCES.settingsData,
    });
    expect(parseNavigationGroupPreferences('{not-json')).toEqual(
      DEFAULT_NAVIGATION_GROUP_PREFERENCES,
    );
  });

  it('maps only secondary routes to collapsible groups', () => {
    expect(navigationGroupForPath('/learners')).toBeUndefined();
    expect(navigationGroupForPath('/library')).toBe('resources');
    expect(navigationGroupForPath('/templates')).toBe('resources');
    expect(navigationGroupForPath('/standards')).toBe('resources');
    expect(navigationGroupForPath('/categories')).toBe('resources');
    expect(navigationGroupForPath('/insights')).toBe('reflect');
    expect(navigationGroupForPath('/teaching-review')).toBe('reflect');
    expect(navigationGroupForPath('/migration')).toBe('settingsData');
    expect(navigationGroupForPath('/system-health')).toBe('settingsData');
  });
});

describe('navigation preference storage resilience', () => {
  it('falls back to defaults when localStorage.getItem throws', () => {
    const original = window.localStorage;
    try {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
          getItem: () => {
            throw new DOMException('Storage blocked', 'SecurityError');
          },
        },
      });

      expect(readNavigationGroupPreferences()).toEqual(DEFAULT_NAVIGATION_GROUP_PREFERENCES);
    } finally {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: original,
      });
    }
  });

  it('does not throw when localStorage.setItem is unavailable', () => {
    const original = window.localStorage;
    try {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
          setItem: () => {
            throw new DOMException('Storage full', 'QuotaExceededError');
          },
        },
      });

      expect(() =>
        writeNavigationGroupPreferences({ resources: false, reflect: true, settingsData: true }),
      ).not.toThrow();
    } finally {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: original,
      });
    }
  });
});

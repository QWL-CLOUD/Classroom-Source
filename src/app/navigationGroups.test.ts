import { describe, expect, it } from 'vitest';

import {
  DEFAULT_NAVIGATION_GROUP_PREFERENCES,
  navigationGroupForPath,
  parseNavigationGroupPreferences,
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
    expect(navigationGroupForPath('/categories')).toBe('resources');
    expect(navigationGroupForPath('/insights')).toBe('reflect');
    expect(navigationGroupForPath('/migration')).toBe('settingsData');
    expect(navigationGroupForPath('/system-health')).toBe('settingsData');
  });
});

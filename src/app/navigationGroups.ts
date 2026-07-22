export const NAVIGATION_GROUP_IDS = ['resources', 'reflect', 'settingsData'] as const;

export type NavigationGroupId = (typeof NAVIGATION_GROUP_IDS)[number];

export interface NavigationGroupPreferences {
  resources: boolean;
  reflect: boolean;
  settingsData: boolean;
}

export const DEFAULT_NAVIGATION_GROUP_PREFERENCES: NavigationGroupPreferences = {
  resources: true,
  reflect: false,
  settingsData: false,
};

export const NAVIGATION_GROUP_STORAGE_KEY = 'classroom.navigation.groups.v1';

export function navigationGroupForPath(pathname: string): NavigationGroupId | undefined {
  if (pathname.startsWith('/library') || pathname.startsWith('/categories')) return 'resources';
  if (pathname.startsWith('/insights')) return 'reflect';
  if (
    pathname.startsWith('/import') ||
    pathname.startsWith('/migration') ||
    pathname.startsWith('/export') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/system-health')
  ) {
    return 'settingsData';
  }
  return undefined;
}

export function parseNavigationGroupPreferences(
  serialized: string | null,
): NavigationGroupPreferences {
  if (!serialized) return { ...DEFAULT_NAVIGATION_GROUP_PREFERENCES };

  try {
    const candidate = JSON.parse(serialized) as Partial<Record<NavigationGroupId, unknown>>;
    return NAVIGATION_GROUP_IDS.reduce<NavigationGroupPreferences>(
      (preferences, groupId) => {
        if (typeof candidate[groupId] === 'boolean') {
          preferences[groupId] = candidate[groupId];
        }
        return preferences;
      },
      { ...DEFAULT_NAVIGATION_GROUP_PREFERENCES },
    );
  } catch {
    return { ...DEFAULT_NAVIGATION_GROUP_PREFERENCES };
  }
}

export function readNavigationGroupPreferences(): NavigationGroupPreferences {
  if (typeof window === 'undefined') return { ...DEFAULT_NAVIGATION_GROUP_PREFERENCES };
  return parseNavigationGroupPreferences(window.localStorage.getItem(NAVIGATION_GROUP_STORAGE_KEY));
}

export function writeNavigationGroupPreferences(preferences: NavigationGroupPreferences): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(NAVIGATION_GROUP_STORAGE_KEY, JSON.stringify(preferences));
}

import type { LibraryCatalogType } from '@/domain/models/entities';

export const LIBRARY_ROUTE_TABS = [
  'activities',
  'resources',
  'assessments',
  'legacy-standards',
] as const;

export type LibraryRouteTab = (typeof LIBRARY_ROUTE_TABS)[number];
export type LibraryRouteCatalogType = 'all' | LibraryCatalogType;

export interface LibraryRouteState {
  catalogType: LibraryRouteCatalogType;
}

const catalogTypeByRouteTab: Record<LibraryRouteTab, LibraryCatalogType> = {
  activities: 'activity',
  resources: 'resource',
  assessments: 'assessment',
  'legacy-standards': 'standard',
};

const routeTabByCatalogType: Record<LibraryCatalogType, LibraryRouteTab> = {
  activity: 'activities',
  resource: 'resources',
  assessment: 'assessments',
  standard: 'legacy-standards',
};

function isLibraryRouteTab(value: string): value is LibraryRouteTab {
  return LIBRARY_ROUTE_TABS.includes(value as LibraryRouteTab);
}

export function parseLibraryRouteState(search: URLSearchParams): LibraryRouteState {
  const tabValues = search.getAll('tab').filter(Boolean);
  const [tabValue] = tabValues;
  if (tabValues.length !== 1 || !tabValue || !isLibraryRouteTab(tabValue)) {
    return { catalogType: 'all' };
  }
  return { catalogType: catalogTypeByRouteTab[tabValue] };
}

export function buildLibraryRouteSearch(catalogType: LibraryRouteCatalogType): URLSearchParams {
  if (catalogType === 'all') return new URLSearchParams();
  return new URLSearchParams({ tab: routeTabByCatalogType[catalogType] });
}

export function buildLibraryHref(catalogType: LibraryRouteCatalogType = 'all'): string {
  const search = buildLibraryRouteSearch(catalogType);
  const query = search.toString();
  return query ? `/library?${query}` : '/library';
}

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
  itemId?: string;
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
  const itemId = search.get('item')?.trim() || undefined;
  const tabValues = search.getAll('tab').filter(Boolean);
  const [tabValue] = tabValues;
  if (tabValues.length !== 1 || !tabValue || !isLibraryRouteTab(tabValue)) {
    return { catalogType: 'all', itemId };
  }
  return { catalogType: catalogTypeByRouteTab[tabValue], itemId };
}

export function buildLibraryRouteSearch(
  catalogType: LibraryRouteCatalogType,
  itemId?: string,
): URLSearchParams {
  const params = new URLSearchParams();
  if (catalogType !== 'all') params.set('tab', routeTabByCatalogType[catalogType]);
  if (itemId?.trim()) params.set('item', itemId.trim());
  return params;
}

export function buildLibraryHref(
  catalogType: LibraryRouteCatalogType = 'all',
  itemId?: string,
): string {
  const search = buildLibraryRouteSearch(catalogType, itemId);
  const query = search.toString();
  return query ? `/library?${query}` : '/library';
}

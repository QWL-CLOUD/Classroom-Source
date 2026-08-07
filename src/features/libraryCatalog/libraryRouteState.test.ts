import { describe, expect, it } from 'vitest';

import {
  buildLibraryHref,
  buildLibraryRouteSearch,
  parseLibraryRouteState,
} from './libraryRouteState';

describe('Library route state', () => {
  it('parses canonical catalog tabs and builds stable hrefs', () => {
    expect(parseLibraryRouteState(new URLSearchParams('tab=activities'))).toEqual({
      catalogType: 'activity',
      itemId: undefined,
    });
    expect(parseLibraryRouteState(new URLSearchParams('tab=resources'))).toEqual({
      catalogType: 'resource',
      itemId: undefined,
    });
    expect(parseLibraryRouteState(new URLSearchParams('tab=assessments'))).toEqual({
      catalogType: 'assessment',
      itemId: undefined,
    });
    expect(parseLibraryRouteState(new URLSearchParams('tab=legacy-standards'))).toEqual({
      catalogType: 'standard',
      itemId: undefined,
    });

    expect(buildLibraryHref()).toBe('/library');
    expect(buildLibraryHref('activity')).toBe('/library?tab=activities');
    expect(buildLibraryHref('resource')).toBe('/library?tab=resources');
    expect(buildLibraryHref('assessment')).toBe('/library?tab=assessments');
    expect(buildLibraryHref('standard')).toBe('/library?tab=legacy-standards');
    expect(buildLibraryRouteSearch('all').toString()).toBe('');
  });

  it('falls back to All for absent, unknown, empty, or repeated tab state', () => {
    expect(parseLibraryRouteState(new URLSearchParams())).toEqual({
      catalogType: 'all',
      itemId: undefined,
    });
    expect(parseLibraryRouteState(new URLSearchParams('tab=unknown'))).toEqual({
      catalogType: 'all',
      itemId: undefined,
    });
    expect(parseLibraryRouteState(new URLSearchParams('tab='))).toEqual({
      catalogType: 'all',
      itemId: undefined,
    });
    expect(parseLibraryRouteState(new URLSearchParams('tab=activities&tab=resources'))).toEqual({
      catalogType: 'all',
      itemId: undefined,
    });
  });

  it('retains an exact Library item deep link independently of the catalog tab', () => {
    expect(parseLibraryRouteState(new URLSearchParams('item=item-1'))).toEqual({
      catalogType: 'all',
      itemId: 'item-1',
    });
    expect(buildLibraryRouteSearch('resource', 'item-1').toString()).toBe(
      'tab=resources&item=item-1',
    );
    expect(buildLibraryHref('all', 'item-1')).toBe('/library?item=item-1');
  });
});

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
    });
    expect(parseLibraryRouteState(new URLSearchParams('tab=resources'))).toEqual({
      catalogType: 'resource',
    });
    expect(parseLibraryRouteState(new URLSearchParams('tab=assessments'))).toEqual({
      catalogType: 'assessment',
    });
    expect(parseLibraryRouteState(new URLSearchParams('tab=legacy-standards'))).toEqual({
      catalogType: 'standard',
    });

    expect(buildLibraryHref()).toBe('/library');
    expect(buildLibraryHref('activity')).toBe('/library?tab=activities');
    expect(buildLibraryHref('resource')).toBe('/library?tab=resources');
    expect(buildLibraryHref('assessment')).toBe('/library?tab=assessments');
    expect(buildLibraryHref('standard')).toBe('/library?tab=legacy-standards');
    expect(buildLibraryRouteSearch('all').toString()).toBe('');
  });

  it('falls back to All for absent, unknown, empty, or repeated tab state', () => {
    expect(parseLibraryRouteState(new URLSearchParams())).toEqual({ catalogType: 'all' });
    expect(parseLibraryRouteState(new URLSearchParams('tab=unknown'))).toEqual({
      catalogType: 'all',
    });
    expect(parseLibraryRouteState(new URLSearchParams('tab='))).toEqual({
      catalogType: 'all',
    });
    expect(parseLibraryRouteState(new URLSearchParams('tab=activities&tab=resources'))).toEqual({
      catalogType: 'all',
    });
  });
});

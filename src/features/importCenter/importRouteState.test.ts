import { describe, expect, it } from 'vitest';

import { buildImportCenterHref, parseImportRouteState } from './importRouteState';

describe('Import Center route state', () => {
  it('parses canonical import types and roster context deep links', () => {
    expect(parseImportRouteState(new URLSearchParams('type=standards'))).toEqual({
      importType: 'standards',
      contextId: undefined,
    });
    expect(parseImportRouteState(new URLSearchParams('type=roster&context=class-1'))).toEqual({
      importType: 'roster',
      contextId: 'class-1',
    });
    expect(buildImportCenterHref('roster', 'class-1')).toBe('/import?type=roster&context=class-1');
    expect(buildImportCenterHref('standards', 'ignored')).toBe('/import?type=standards');
    expect(parseImportRouteState(new URLSearchParams('type=activities'))).toEqual({
      importType: 'activities',
      contextId: undefined,
    });
    expect(buildImportCenterHref('activities')).toBe('/import?type=activities');
  });

  it('rejects ambiguous, unknown, and cross-domain query state', () => {
    expect(parseImportRouteState(new URLSearchParams('type=standards&type=roster'))).toMatchObject({
      issue: 'Choose one import type at a time.',
    });
    expect(parseImportRouteState(new URLSearchParams('type=unknown'))).toMatchObject({
      issue: '“unknown” is not a supported import type.',
    });
    expect(parseImportRouteState(new URLSearchParams('type=standards&context=class-1'))).toEqual({
      importType: 'standards',
      issue: 'Only Roster import accepts a target Class or Group context.',
    });
  });
});

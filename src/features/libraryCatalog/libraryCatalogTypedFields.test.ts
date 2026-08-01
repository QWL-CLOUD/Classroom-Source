import { describe, expect, it } from 'vitest';

import { safeLibraryResourceHref } from './libraryCatalogTypedFields';

describe('libraryCatalogTypedFields Resource links', () => {
  it('returns only absolute http and https Resource locations as safe links', () => {
    expect(safeLibraryResourceHref('https://example.invalid/resource')).toBe(
      'https://example.invalid/resource',
    );
    expect(safeLibraryResourceHref('HTTP://Example.invalid:80/map#section')).toBe(
      'http://example.invalid/map#section',
    );
    expect(safeLibraryResourceHref('Shared Drive / Grade 3 / map.pdf')).toBeUndefined();
  });

  it('rejects dangerous schemes and embedded credentials', () => {
    expect(safeLibraryResourceHref('javascript:alert(1)')).toBeUndefined();
    expect(safeLibraryResourceHref('data:text/plain,hello')).toBeUndefined();
    expect(safeLibraryResourceHref('file:///Users/example/private.pdf')).toBeUndefined();
    expect(safeLibraryResourceHref('https://user:password@example.invalid/a')).toBeUndefined();
  });
});

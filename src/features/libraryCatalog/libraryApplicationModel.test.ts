import { describe, expect, it } from 'vitest';

import type { LibraryCatalogItem } from '@/domain/models/entities';

import {
  createLibraryApplicationLink,
  resolveLibraryApplicationView,
} from './libraryApplicationModel';

const source: LibraryCatalogItem = {
  id: 'resource-1',
  catalogType: 'resource',
  title: 'Fraction cards',
  description: 'Printable visual models.',
  tags: ['Fractions'],
  typedFields: {
    catalogType: 'resource',
    sourceLocation: 'Binder A',
    usageNotes: 'Print one set per pair.',
  },
  status: 'active',
  createdAt: '2026-07-23T12:00:00.000Z',
  updatedAt: '2026-07-23T12:00:00.000Z',
};

describe('Library application model', () => {
  it('keeps live applications linked by stable source ID', () => {
    const link = createLibraryApplicationLink(source);
    expect(link).toEqual({ libraryItemId: 'resource-1', catalogType: 'resource' });

    expect(
      resolveLibraryApplicationView(link, [
        {
          ...source,
          title: 'Updated fraction cards',
          updatedAt: '2026-07-23T13:00:00.000Z',
        },
      ]),
    ).toMatchObject({
      title: 'Updated fraction cards',
      usesSnapshot: false,
      sourceStatus: 'active',
    });
  });

  it('uses an explicit snapshot without replacing the stable source link', () => {
    const link = createLibraryApplicationLink(source, {
      captureSnapshot: true,
      capturedAt: '2026-07-23T12:30:00.000Z',
    });
    const view = resolveLibraryApplicationView(link, [
      {
        ...source,
        title: 'Later catalog title',
        updatedAt: '2026-07-23T13:00:00.000Z',
      },
    ]);

    expect(link.libraryItemId).toBe(source.id);
    expect(view).toMatchObject({
      title: 'Fraction cards',
      usesSnapshot: true,
      snapshotCapturedAt: '2026-07-23T12:30:00.000Z',
      sourceUpdatedAt: '2026-07-23T13:00:00.000Z',
    });
  });

  it('rejects Standards until the Phase 3F alignment workflow', () => {
    expect(() =>
      createLibraryApplicationLink({
        ...source,
        catalogType: 'standard',
        typedFields: undefined,
      }),
    ).toThrow('Standards cannot be attached before Phase 3F.');
  });
});

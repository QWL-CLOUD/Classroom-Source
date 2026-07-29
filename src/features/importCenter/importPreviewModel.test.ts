import { describe, expect, it } from 'vitest';

import {
  buildImportPreview,
  stableImportFingerprint,
  summarizeImportPreviewRows,
} from './importPreviewModel';

describe('shared import preview model', () => {
  it('summarizes create, update, skip, review, and blocked rows', () => {
    const summary = summarizeImportPreviewRows([
      { classification: 'create' },
      { classification: 'update' },
      { classification: 'skip' },
      { classification: 'review' },
      { classification: 'blocked' },
    ]);

    expect(summary).toEqual({
      total: 5,
      createCount: 1,
      updateCount: 1,
      skipCount: 1,
      reviewCount: 1,
      blockedCount: 1,
    });
  });

  it('only marks a preview committable when every review is resolved', () => {
    const blocked = buildImportPreview(
      [
        { sourceRow: 2, classification: 'create', reasons: ['New identity'] },
        { sourceRow: 3, classification: 'review', reasons: ['Possible title match'] },
      ],
      { rows: [['Title'], ['Warm-up']] },
      '2026-07-29T12:00:00.000Z',
    );
    expect(blocked.canCommit).toBe(false);
    expect(blocked.hasChanges).toBe(true);

    const ready = buildImportPreview(
      [
        { sourceRow: 2, classification: 'create', reasons: ['New identity'] },
        { sourceRow: 3, classification: 'skip', reasons: ['Exact duplicate'] },
      ],
      { rows: [['Title'], ['Warm-up']] },
      '2026-07-29T12:00:00.000Z',
    );
    expect(ready.canCommit).toBe(true);
  });

  it('produces a stable fingerprint independent of object key order', () => {
    expect(stableImportFingerprint({ b: 2, a: 1 })).toBe(stableImportFingerprint({ a: 1, b: 2 }));
  });
});

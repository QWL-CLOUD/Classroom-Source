import { describe, expect, it } from 'vitest';

import { getCategoryFamily } from '@/features/categories/categoryFamilies';

import {
  categoryFamilyIdsForLibraryCatalogType,
  LIBRARY_CLASSIFICATION_FAMILY_IDS,
} from './libraryClassificationFamilies';

describe('Library classification families', () => {
  it('scopes reusable families by Library catalog type', () => {
    expect(categoryFamilyIdsForLibraryCatalogType('activity')).toEqual([
      'subject',
      'grade-level',
      'language',
      'language-level',
      'activity-type',
      'purpose-tag',
      'focus-tag',
    ]);
    expect(categoryFamilyIdsForLibraryCatalogType('resource')).toEqual([
      'subject',
      'grade-level',
      'language',
      'language-level',
      'resource-format',
      'purpose-tag',
      'focus-tag',
    ]);
    expect(categoryFamilyIdsForLibraryCatalogType('assessment')).toEqual([
      'subject',
      'grade-level',
      'language',
      'language-level',
      'purpose-tag',
      'focus-tag',
    ]);
    expect(categoryFamilyIdsForLibraryCatalogType('standard')).toEqual([]);
    expect(LIBRARY_CLASSIFICATION_FAMILY_IDS.activity).toContain('activity-type');
  });

  it('keeps Activity Type single-select and the shared Library facets multi-select', () => {
    expect(getCategoryFamily('activity-type').selectionMode).toBe('single');
    for (const familyId of ['subject', 'grade-level', 'language', 'language-level'] as const) {
      expect(getCategoryFamily(familyId).selectionMode).toBe('multiple');
      expect(getCategoryFamily(familyId).entityTypes).toContain('library-item');
    }
  });
});

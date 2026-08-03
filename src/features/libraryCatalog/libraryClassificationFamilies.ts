import type { CategoryFamilyId, LibraryCatalogType } from '@/domain/models/entities';

const COMMON_LIBRARY_CLASSIFICATION_FAMILIES = [
  'subject',
  'grade-level',
  'language',
  'language-level',
] as const satisfies readonly CategoryFamilyId[];

const COMMON_LIBRARY_FILTER_FAMILIES = [
  ...COMMON_LIBRARY_CLASSIFICATION_FAMILIES,
  'purpose-tag',
  'focus-tag',
] as const satisfies readonly CategoryFamilyId[];

export const LIBRARY_CLASSIFICATION_FAMILY_IDS = {
  activity: [
    ...COMMON_LIBRARY_CLASSIFICATION_FAMILIES,
    'activity-type',
    'purpose-tag',
    'focus-tag',
  ],
  resource: [
    ...COMMON_LIBRARY_CLASSIFICATION_FAMILIES,
    'resource-format',
    'purpose-tag',
    'focus-tag',
  ],
  assessment: [...COMMON_LIBRARY_CLASSIFICATION_FAMILIES, 'purpose-tag', 'focus-tag'],
  standard: [],
} as const satisfies Record<LibraryCatalogType, readonly CategoryFamilyId[]>;

export function categoryFamilyIdsForLibraryCatalogType(
  catalogType: LibraryCatalogType,
): readonly CategoryFamilyId[] {
  return LIBRARY_CLASSIFICATION_FAMILY_IDS[catalogType];
}

export function categoryFamilyIdsForLibraryFilterTab(
  catalogType: 'all' | LibraryCatalogType,
): readonly CategoryFamilyId[] {
  if (catalogType === 'all') return COMMON_LIBRARY_FILTER_FAMILIES;
  return categoryFamilyIdsForLibraryCatalogType(catalogType);
}

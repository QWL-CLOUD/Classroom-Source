import {
  libraryCatalogTypedFieldsSchema,
  type LibraryActivityGrouping,
  type LibraryAssessmentKind,
  type LibraryCatalogItem,
  type LibraryCatalogType,
  type LibraryCatalogTypedFields,
} from '@/domain/models/entities';

export const libraryActivityGroupingLabels: Record<LibraryActivityGrouping, string> = {
  'whole-class': 'Whole class',
  'small-group': 'Small group',
  partners: 'Partners',
  individual: 'Individual',
  flexible: 'Flexible',
};

export const libraryAssessmentKindLabels: Record<LibraryAssessmentKind, string> = {
  diagnostic: 'Diagnostic',
  formative: 'Formative',
  summative: 'Summative',
  'self-assessment': 'Self-assessment',
  other: 'Other',
};

export function createDefaultLibraryCatalogTypedFields(
  catalogType: LibraryCatalogType,
): LibraryCatalogTypedFields | undefined {
  if (catalogType === 'activity') {
    return libraryCatalogTypedFieldsSchema.parse({
      catalogType: 'activity',
      grouping: 'flexible',
    });
  }
  if (catalogType === 'resource') {
    return libraryCatalogTypedFieldsSchema.parse({ catalogType: 'resource' });
  }
  if (catalogType === 'assessment') {
    return libraryCatalogTypedFieldsSchema.parse({
      catalogType: 'assessment',
      assessmentKind: 'formative',
    });
  }
  return undefined;
}

export function typedFieldsForCatalogType(
  catalogType: LibraryCatalogType,
  typedFields: LibraryCatalogTypedFields | undefined,
): LibraryCatalogTypedFields | undefined {
  if (catalogType === 'standard') return undefined;
  if (typedFields?.catalogType === catalogType) return typedFields;
  return createDefaultLibraryCatalogTypedFields(catalogType);
}

export function libraryCatalogTypedFieldsSearchText(item: LibraryCatalogItem): string {
  const fields = item.typedFields;
  if (!fields) return '';
  if (fields.catalogType === 'activity') {
    return [
      libraryActivityGroupingLabels[fields.grouping],
      fields.estimatedMinutes?.toString() ?? '',
      fields.directions ?? '',
    ].join(' ');
  }
  if (fields.catalogType === 'resource') {
    return [fields.sourceLocation ?? '', fields.usageNotes ?? ''].join(' ');
  }
  return [
    libraryAssessmentKindLabels[fields.assessmentKind],
    fields.studentPrompt ?? '',
    fields.evidenceToCollect ?? '',
  ].join(' ');
}

export interface LibraryCatalogWorkflowDetail {
  label: string;
  value: string;
}

export function libraryCatalogWorkflowDetails(
  typedFields: LibraryCatalogTypedFields | undefined,
): LibraryCatalogWorkflowDetail[] {
  if (!typedFields) return [];
  if (typedFields.catalogType === 'activity') {
    return [
      { label: 'Grouping', value: libraryActivityGroupingLabels[typedFields.grouping] },
      ...(typedFields.estimatedMinutes
        ? [{ label: 'Estimated time', value: `${typedFields.estimatedMinutes} minutes` }]
        : []),
      ...(typedFields.directions ? [{ label: 'Directions', value: typedFields.directions }] : []),
    ];
  }
  if (typedFields.catalogType === 'resource') {
    return [
      ...(typedFields.sourceLocation
        ? [{ label: 'Source or location', value: typedFields.sourceLocation }]
        : []),
      ...(typedFields.usageNotes ? [{ label: 'Usage notes', value: typedFields.usageNotes }] : []),
    ];
  }
  return [
    { label: 'Assessment kind', value: libraryAssessmentKindLabels[typedFields.assessmentKind] },
    ...(typedFields.studentPrompt
      ? [{ label: 'Student prompt', value: typedFields.studentPrompt }]
      : []),
    ...(typedFields.evidenceToCollect
      ? [{ label: 'Evidence to collect', value: typedFields.evidenceToCollect }]
      : []),
  ];
}

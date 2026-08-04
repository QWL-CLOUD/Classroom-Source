import { describe, expect, it } from 'vitest';

import {
  categoryValueSchema,
  classificationMappingPresetSchema,
  type CategoryFamilyId,
  type ClassificationMappingPreset,
} from '@/domain/models/entities';

import {
  planImportClassificationMappingPresets,
  type ImportClassificationMappingPersistenceDecisions,
} from './importClassificationMappingPresetPlan';
import {
  importClassificationReviewKey,
  type ImportClassificationDecisions,
  type ImportClassificationReview,
} from './importClassificationResolution';

const now = '2026-08-04T12:00:00.000Z';

function category(id: string, familyId: CategoryFamilyId, name: string) {
  return categoryValueSchema.parse({
    id,
    familyId,
    name,
    normalizedName: name.toLocaleLowerCase('en-US'),
    aliases: [],
    normalizedAliases: [],
    sortOrder: 0,
    isDefault: false,
    lifecycleState: 'active',
    createdAt: now,
    updatedAt: now,
  });
}

function unknownReview(displayValue = 'ELA'): ImportClassificationReview {
  return {
    key: importClassificationReviewKey('subject', displayValue),
    familyId: 'subject',
    familyLabel: 'Subject',
    fieldLabel: 'Subject',
    genericTagPrefix: 'Subject',
    displayValue,
    normalizedValue: displayValue.toLocaleLowerCase('en-US'),
    kind: 'unknown',
    matches: [],
  };
}

function plan(input: {
  review?: ImportClassificationReview;
  decisions?: ImportClassificationDecisions;
  persistence?: ImportClassificationMappingPersistenceDecisions;
  mappingPresets?: ClassificationMappingPreset[];
}) {
  const review = input.review ?? unknownReview();
  return planImportClassificationMappingPresets({
    reviews: [review],
    decisions: input.decisions ?? {},
    persistenceDecisions: input.persistence ?? {},
    categoryValues: [category('subject-ela', 'subject', 'English Language Arts')],
    mappingPresets: input.mappingPresets ?? [],
    createId: () => 'mapping-new',
    generatedAt: now,
  });
}

describe('importClassificationMappingPresetPlan', () => {
  it('keeps Apply once preview-only', () => {
    const review = unknownReview();
    const snapshot = plan({
      review,
      decisions: { [review.key]: { action: 'use', categoryValueId: 'subject-ela' } },
    });

    expect(snapshot.newMappingPresets).toEqual([]);
    expect(snapshot.updatedMappingPresets).toEqual([]);
    expect(snapshot.classificationMappingAudit).toEqual([]);
  });

  it('plans one active family-scoped mapping without writing', () => {
    const review = unknownReview();
    const snapshot = plan({
      review,
      decisions: { [review.key]: { action: 'use', categoryValueId: 'subject-ela' } },
      persistence: { [review.key]: 'save' },
    });

    expect(snapshot.newMappingPresets).toEqual([
      expect.objectContaining({
        id: 'mapping-new',
        familyId: 'subject',
        sourceText: 'ELA',
        normalizedSourceText: 'ela',
        targetCategoryValueId: 'subject-ela',
        status: 'active',
      }),
    ]);
    expect(snapshot.classificationMappingAudit).toEqual([
      expect.objectContaining({ action: 'created', presetId: 'mapping-new' }),
    ]);
  });

  it('updates and activates one existing mapping while preserving identity', () => {
    const review: ImportClassificationReview = {
      ...unknownReview(),
      kind: 'mapping',
      mappingIssue: 'inactive',
      mappingPresets: [
        classificationMappingPresetSchema.parse({
          id: 'mapping-existing',
          familyId: 'subject',
          sourceText: 'ELA',
          normalizedSourceText: 'ela',
          targetCategoryValueId: 'subject-ela',
          status: 'inactive',
          createdAt: now,
          updatedAt: now,
          deactivatedAt: now,
        }),
      ],
    };
    const snapshot = plan({
      review,
      mappingPresets: review.mappingPresets,
      decisions: { [review.key]: { action: 'use', categoryValueId: 'subject-ela' } },
      persistence: { [review.key]: 'update' },
    });

    expect(snapshot.updatedMappingPresets).toEqual([
      {
        before: expect.objectContaining({ id: 'mapping-existing', status: 'inactive' }),
        after: expect.objectContaining({
          id: 'mapping-existing',
          status: 'active',
          deactivatedAt: undefined,
        }),
      },
    ]);
    expect(snapshot.expectedMappingPresets).toEqual([
      expect.objectContaining({ id: 'mapping-existing' }),
    ]);
  });

  it('does not allow Generic Tag to become a persistent mapping', () => {
    const review = unknownReview();
    expect(() =>
      plan({
        review,
        decisions: { [review.key]: { action: 'generic-tag' } },
        persistence: { [review.key]: 'save' },
      }),
    ).toThrow(/existing controlled/i);
  });

  it('requires Update when the family and source key already exists', () => {
    const review = unknownReview();
    const existing = classificationMappingPresetSchema.parse({
      id: 'mapping-existing',
      familyId: 'subject',
      sourceText: 'ELA',
      normalizedSourceText: 'ela',
      targetCategoryValueId: 'subject-ela',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    expect(() =>
      plan({
        review,
        mappingPresets: [existing],
        decisions: { [review.key]: { action: 'use', categoryValueId: 'subject-ela' } },
        persistence: { [review.key]: 'save' },
      }),
    ).toThrow(/already exists/i);
  });
});

import { describe, expect, it } from 'vitest';

import {
  classificationMappingPresetSchema,
  type CategoryAssignment,
  type CategoryFamilyId,
  type CategoryValue,
} from '@/domain/models/entities';

import {
  classificationSummaryJson,
  createImportClassificationResolutionSession,
  importClassificationFieldsForCatalogType,
  importClassificationReviewKey,
  planImportClassificationAssignments,
} from './importClassificationResolution';

const now = '2026-08-03T12:00:00.000Z';

function value(
  id: string,
  familyId: CategoryFamilyId,
  name: string,
  overrides: Partial<CategoryValue> = {},
): CategoryValue {
  return {
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
    ...overrides,
  };
}

function assignment(
  id: string,
  familyId: CategoryFamilyId,
  categoryValueId: string,
): CategoryAssignment {
  return {
    id,
    familyId,
    categoryValueId,
    entityType: 'library-item',
    entityId: 'item-1',
    createdAt: now,
  };
}

describe('importClassificationResolution', () => {
  it('auto-resolves active exact names and aliases inside the requested family', () => {
    const session = createImportClassificationResolutionSession({
      catalogType: 'activity',
      categoryValues: [
        value('subject-math', 'subject', 'Mathematics', {
          aliases: ['Math'],
          normalizedAliases: ['math'],
        }),
        value('purpose-math', 'purpose-tag', 'Math'),
      ],
      mappingPresets: [],
      mappingPersistenceDecisions: {},
      decisions: {},
      createId: () => 'unused',
      generatedAt: now,
    });

    const resolved = session.resolveRow({
      sourceRow: 2,
      presentFamilyIds: ['subject', 'purpose-tag'],
      values: { subject: 'Math', 'purpose-tag': 'Math' },
    });

    expect(resolved.reviews).toEqual([]);
    expect(resolved.blockingReasons).toEqual([]);
    expect(
      resolved.families.find((family) => family.familyId === 'subject')?.categoryValueIds,
    ).toEqual(['subject-math']);
    expect(
      resolved.families.find((family) => family.familyId === 'purpose-tag')?.categoryValueIds,
    ).toEqual(['purpose-math']);
    expect(session.snapshot().classificationAudit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ familyId: 'subject', resolution: 'exact-alias' }),
        expect.objectContaining({ familyId: 'purpose-tag', resolution: 'exact-name' }),
      ]),
    );
  });

  it('requires review for unknown, archived, merged, and ambiguous values', () => {
    const categoryValues = [
      value('grade-old', 'grade-level', 'Primary', {
        lifecycleState: 'archived',
        archivedAt: now,
      }),
      value('language-old', 'language', 'Mandarin Legacy', {
        lifecycleState: 'merged',
        mergedIntoId: 'language-current',
        mergedAt: now,
      }),
      value('language-current', 'language', 'Mandarin'),
      value('focus-a', 'focus-tag', 'Speaking'),
      value('focus-b', 'focus-tag', 'Oral communication', {
        aliases: ['Speaking'],
        normalizedAliases: ['speaking'],
      }),
    ];
    const session = createImportClassificationResolutionSession({
      catalogType: 'activity',
      categoryValues,
      mappingPresets: [],
      mappingPersistenceDecisions: {},
      decisions: {},
      createId: () => 'new-value',
      generatedAt: now,
    });

    const resolved = session.resolveRow({
      sourceRow: 3,
      presentFamilyIds: ['subject', 'grade-level', 'language', 'focus-tag'],
      values: {
        subject: 'Science',
        'grade-level': 'Primary',
        language: 'Mandarin Legacy',
        'focus-tag': 'Speaking',
      },
    });

    expect(resolved.reviews.map((review) => review.kind).sort()).toEqual([
      'ambiguous',
      'archived',
      'merged',
      'unknown',
    ]);
    expect(resolved.reviewReasons).toHaveLength(4);
  });

  it('creates, restores, redirects merged history, keeps generic tags, and records audit', () => {
    const decisions = {
      [importClassificationReviewKey('subject', 'Science')]: { action: 'create' as const },
      [importClassificationReviewKey('grade-level', 'Primary')]: {
        action: 'restore' as const,
        categoryValueId: 'grade-old',
      },
      [importClassificationReviewKey('language', 'Mandarin Legacy')]: {
        action: 'use' as const,
        categoryValueId: 'language-current',
      },
      [importClassificationReviewKey('focus-tag', 'New focus')]: {
        action: 'generic-tag' as const,
      },
    };
    const session = createImportClassificationResolutionSession({
      catalogType: 'activity',
      categoryValues: [
        value('grade-old', 'grade-level', 'Primary', {
          lifecycleState: 'archived',
          archivedAt: now,
        }),
        value('language-old', 'language', 'Mandarin Legacy', {
          lifecycleState: 'merged',
          mergedIntoId: 'language-current',
          mergedAt: now,
        }),
        value('language-current', 'language', 'Mandarin'),
      ],
      mappingPresets: [],
      mappingPersistenceDecisions: {},
      decisions,
      createId: () => 'subject-science',
      generatedAt: now,
    });

    const resolved = session.resolveRow({
      sourceRow: 4,
      presentFamilyIds: ['subject', 'grade-level', 'language', 'focus-tag'],
      values: {
        subject: 'Science',
        'grade-level': 'Primary',
        language: 'Mandarin Legacy',
        'focus-tag': 'New focus',
      },
    });
    const snapshot = session.snapshot();

    expect(resolved.reviews).toEqual([]);
    expect(resolved.genericTags).toEqual(['Focus: New focus']);
    expect(snapshot.newCategoryValues).toEqual([
      expect.objectContaining({ id: 'subject-science', familyId: 'subject', name: 'Science' }),
    ]);
    expect(snapshot.restoredCategoryValues).toEqual([
      expect.objectContaining({
        before: expect.objectContaining({ id: 'grade-old', lifecycleState: 'archived' }),
        after: expect.objectContaining({ id: 'grade-old', lifecycleState: 'active' }),
      }),
    ]);
    expect(snapshot.classificationAudit.map((record) => record.resolution)).toEqual(
      expect.arrayContaining(['created', 'restored', 'merged-replacement', 'generic-tag']),
    );
  });

  it('blocks multiple imported values for single-assignment families', () => {
    const session = createImportClassificationResolutionSession({
      catalogType: 'resource',
      categoryValues: [],
      mappingPresets: [],
      mappingPersistenceDecisions: {},
      decisions: {},
      createId: () => 'unused',
      generatedAt: now,
    });
    const resolved = session.resolveRow({
      sourceRow: 5,
      presentFamilyIds: ['resource-format'],
      values: { 'resource-format': 'Slides; PDF' },
    });
    expect(resolved.blockingReasons).toEqual([
      'Resource Format accepts one controlled value per item; split this source row before import.',
    ]);
  });

  it('replaces nonblank canonical families while preserving blank or generic-only families', () => {
    let next = 0;
    const plan = planImportClassificationAssignments({
      entityId: 'item-1',
      existingAssignments: [
        assignment('old-subject', 'subject', 'subject-old'),
        assignment('old-grade', 'grade-level', 'grade-old'),
        assignment('old-focus', 'focus-tag', 'focus-old'),
      ],
      resolution: {
        sourceRow: 6,
        reviews: [],
        reviewReasons: [],
        blockingReasons: [],
        genericTags: ['Focus: Imported text'],
        mappingNotes: [],
        mappingPersistencePlanned: false,
        families: [
          {
            familyId: 'subject',
            fieldLabel: 'Subject',
            inputPresent: true,
            hadInput: true,
            categoryValueIds: ['subject-new'],
            genericTags: [],
          },
          {
            familyId: 'grade-level',
            fieldLabel: 'Grade Level',
            inputPresent: true,
            hadInput: false,
            categoryValueIds: [],
            genericTags: [],
          },
          {
            familyId: 'focus-tag',
            fieldLabel: 'Skill / Focus',
            inputPresent: true,
            hadInput: true,
            categoryValueIds: [],
            genericTags: ['Focus: Imported text'],
          },
        ],
      },
      applicableFamilyIds: ['subject', 'grade-level', 'focus-tag'],
      createId: () => `assignment-${++next}`,
      generatedAt: now,
    });

    expect(plan.assignmentsToDelete.map((entry) => entry.id)).toEqual(['old-subject']);
    expect(plan.assignmentsToCreate).toEqual([
      expect.objectContaining({ familyId: 'subject', categoryValueId: 'subject-new' }),
    ]);
    expect(plan.desiredCategoryValueIdsByFamily).toEqual({
      subject: ['subject-new'],
      'grade-level': ['grade-old'],
      'focus-tag': ['focus-old'],
    });
  });

  it('stores a compact classification audit in Import History', () => {
    const summary = classificationSummaryJson({
      sourceFingerprint: 'source-fingerprint',
      defaults: { externalSource: 'District' },
      newCategoryValues: [value('subject-new', 'subject', 'Science')],
      restoredCategoryValues: [],
      classificationAudit: [
        {
          familyId: 'subject',
          importedText: 'Science',
          normalizedText: 'science',
          occurrenceCount: 2,
          resolution: 'created',
          categoryValueId: 'subject-new',
          resultingName: 'Science',
        },
      ],
      classificationMappingAudit: [
        {
          action: 'created',
          presetId: 'mapping-science',
          familyId: 'subject',
          importedText: 'SCI',
          normalizedText: 'sci',
          targetCategoryValueId: 'subject-new',
          targetName: 'Science',
        },
      ],
    });
    expect(JSON.parse(summary)).toMatchObject({
      sourceFingerprint: 'source-fingerprint',
      createdCategoryValues: 1,
      restoredCategoryValues: 0,
      classificationAudit: [expect.objectContaining({ occurrenceCount: 2 })],
      classificationMappingAudit: [
        expect.objectContaining({ action: 'created', presetId: 'mapping-science' }),
      ],
    });
  });

  it('uses one safe active saved mapping only after canonical matching finds nothing', () => {
    const session = createImportClassificationResolutionSession({
      catalogType: 'activity',
      categoryValues: [value('subject-ela', 'subject', 'English Language Arts')],
      mappingPresets: [
        classificationMappingPresetSchema.parse({
          id: 'mapping-ela',
          familyId: 'subject',
          sourceText: 'ELA',
          normalizedSourceText: 'ela',
          targetCategoryValueId: 'subject-ela',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        }),
      ],
      mappingPersistenceDecisions: {},
      decisions: {},
      createId: () => 'unused',
      generatedAt: now,
    });

    const resolved = session.resolveRow({
      sourceRow: 5,
      presentFamilyIds: ['subject'],
      values: { subject: 'ELA' },
    });
    const snapshot = session.snapshot();

    expect(resolved.reviews).toEqual([]);
    expect(resolved.mappingNotes).toEqual([
      'Saved import mapping: “ELA” → “English Language Arts”.',
    ]);
    expect(resolved.families[0]?.categoryValueIds).toEqual(['subject-ela']);
    expect(snapshot.expectedMappingPresets).toEqual([
      expect.objectContaining({ id: 'mapping-ela' }),
    ]);
    expect(snapshot.classificationAudit).toEqual([
      expect.objectContaining({
        resolution: 'saved-preset',
        mappingPresetId: 'mapping-ela',
      }),
    ]);
  });

  it('keeps canonical history ahead of a saved mapping', () => {
    const session = createImportClassificationResolutionSession({
      catalogType: 'activity',
      categoryValues: [
        value('subject-old', 'subject', 'ELA', {
          lifecycleState: 'archived',
          archivedAt: now,
        }),
        value('subject-current', 'subject', 'English Language Arts'),
      ],
      mappingPresets: [
        classificationMappingPresetSchema.parse({
          id: 'mapping-ela',
          familyId: 'subject',
          sourceText: 'ELA',
          normalizedSourceText: 'ela',
          targetCategoryValueId: 'subject-current',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        }),
      ],
      mappingPersistenceDecisions: {},
      decisions: {},
      createId: () => 'unused',
      generatedAt: now,
    });

    const resolved = session.resolveRow({
      sourceRow: 6,
      presentFamilyIds: ['subject'],
      values: { subject: 'ELA' },
    });

    expect(resolved.reviews).toEqual([
      expect.objectContaining({
        kind: 'archived',
        matchedValue: expect.objectContaining({ id: 'subject-old' }),
      }),
    ]);
    expect(resolved.mappingNotes).toEqual([]);
  });

  it('requires review for an inactive saved mapping', () => {
    const session = createImportClassificationResolutionSession({
      catalogType: 'assessment',
      categoryValues: [value('language-en', 'language', 'English')],
      mappingPresets: [
        classificationMappingPresetSchema.parse({
          id: 'mapping-en',
          familyId: 'language',
          sourceText: 'EN',
          normalizedSourceText: 'en',
          targetCategoryValueId: 'language-en',
          status: 'inactive',
          createdAt: now,
          updatedAt: now,
          deactivatedAt: now,
        }),
      ],
      mappingPersistenceDecisions: {},
      decisions: {},
      createId: () => 'unused',
      generatedAt: now,
    });

    const resolved = session.resolveRow({
      sourceRow: 7,
      presentFamilyIds: ['language'],
      values: { language: 'EN' },
    });

    expect(resolved.reviews).toEqual([
      expect.objectContaining({
        kind: 'mapping',
        mappingIssue: 'inactive',
        mappingPresets: [expect.objectContaining({ id: 'mapping-en' })],
      }),
    ]);
  });

  it('limits Calendar Events to Calendar Event Type and never offers generic-tag fallback', () => {
    expect(importClassificationFieldsForCatalogType('calendar-event')).toEqual([
      {
        familyId: 'calendar-event-type',
        fieldLabel: 'Calendar Event Type',
      },
    ]);
    const reviewKey = importClassificationReviewKey('calendar-event-type', 'Special Closure');
    const session = createImportClassificationResolutionSession({
      catalogType: 'calendar-event',
      categoryValues: [],
      mappingPresets: [],
      mappingPersistenceDecisions: {},
      decisions: { [reviewKey]: { action: 'generic-tag' } },
      createId: () => 'unused',
      generatedAt: now,
    });

    const resolved = session.resolveRow({
      sourceRow: 8,
      presentFamilyIds: ['calendar-event-type'],
      values: { 'calendar-event-type': 'Special Closure' },
    });

    expect(resolved.reviews).toEqual([
      expect.objectContaining({
        key: reviewKey,
        familyId: 'calendar-event-type',
        genericTagPrefix: undefined,
      }),
    ]);
    expect(resolved.genericTags).toEqual([]);
  });

  it('plans Calendar Event category assignments with the requested entity type', () => {
    const plan = planImportClassificationAssignments({
      entityId: 'event-1',
      entityType: 'calendar-event',
      existingAssignments: [],
      resolution: {
        sourceRow: 9,
        reviews: [],
        reviewReasons: [],
        blockingReasons: [],
        genericTags: [],
        mappingNotes: [],
        mappingPersistencePlanned: false,
        families: [
          {
            familyId: 'calendar-event-type',
            fieldLabel: 'Calendar Event Type',
            inputPresent: true,
            hadInput: true,
            categoryValueIds: ['event-type-pd'],
            genericTags: [],
          },
        ],
      },
      applicableFamilyIds: ['calendar-event-type'],
      createId: () => 'event-assignment',
      generatedAt: now,
    });

    expect(plan.assignmentsToCreate).toEqual([
      expect.objectContaining({
        id: 'event-assignment',
        familyId: 'calendar-event-type',
        categoryValueId: 'event-type-pd',
        entityType: 'calendar-event',
        entityId: 'event-1',
      }),
    ]);
  });
});

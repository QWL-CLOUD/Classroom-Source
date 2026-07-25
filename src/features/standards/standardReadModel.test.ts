import { describe, expect, it } from 'vitest';

import type { Standard, StandardAlignment } from '@/domain/models/entities';

import { buildStandardViews, filterStandards } from './standardReadModel';

const timestamp = '2026-07-24T03:00:00.000Z';

const standards: Standard[] = [
  {
    id: 'parent',
    issuingOrganization: 'Organization',
    frameworkTitle: 'Framework',
    jurisdiction: 'State',
    subject: 'Math',
    gradeBand: '3',
    version: '2026',
    frameworkKey: 'organization|framework|state|2026',
    code: '3.NF.A',
    normalizedCode: '3.nf.a',
    statement: 'Develop understanding of fractions.',
    sortOrder: 0,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: 'child',
    issuingOrganization: 'Organization',
    frameworkTitle: 'Framework',
    jurisdiction: 'State',
    subject: 'Math',
    gradeBand: '3',
    version: '2026',
    frameworkKey: 'organization|framework|state|2026',
    code: '3.NF.A.3',
    normalizedCode: '3.nf.a.3',
    statement: 'Compare fractions.',
    parentStandardId: 'parent',
    sortOrder: 1,
    status: 'archived',
    archivedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];

const alignments: StandardAlignment[] = [
  {
    id: 'alignment-1',
    standardId: 'child',
    targetType: 'lesson-plan',
    targetId: 'plan-1',
    scopeKey: 'lesson-plan:plan-1:root',
    createdAt: timestamp,
  },
];

describe('standard read models', () => {
  it('builds hierarchy and explicit alignment counts', () => {
    const views = buildStandardViews(standards, alignments);
    expect(views.find((value) => value.id === 'parent')).toMatchObject({
      childCount: 1,
      alignmentCount: 0,
    });
    expect(views.find((value) => value.id === 'child')).toMatchObject({
      parentCode: '3.NF.A',
      alignmentCount: 1,
      frameworkLabel: 'Framework · State · 2026',
    });
  });

  it('filters by lifecycle, framework, subject, grade, and search text', () => {
    const views = buildStandardViews(standards, alignments);
    expect(
      filterStandards(views, {
        query: 'compare',
        status: 'archived',
        frameworkKey: 'organization|framework|state|2026',
        subject: 'Math',
        gradeBand: '3',
      }).map((value) => value.id),
    ).toEqual(['child']);
  });
});

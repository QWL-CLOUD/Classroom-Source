import type { Standard, StandardAlignment, StandardStatus } from '@/domain/models/entities';

export const standardStatusLabels: Record<StandardStatus, string> = {
  active: 'Active',
  archived: 'Archived',
};

export interface StandardView extends Standard {
  parentCode?: string;
  childCount: number;
  alignmentCount: number;
  frameworkLabel: string;
}

export interface StandardFilters {
  query: string;
  status: 'all' | StandardStatus;
  frameworkKey: string;
  subject: string;
  gradeBand: string;
}

export function standardFrameworkLabel(standard: Standard): string {
  return [standard.frameworkTitle, standard.jurisdiction, standard.version]
    .filter(Boolean)
    .join(' · ');
}

export function buildStandardViews(
  standards: readonly Standard[],
  alignments: readonly StandardAlignment[],
): StandardView[] {
  const byId = new Map(standards.map((standard) => [standard.id, standard]));
  const childCounts = new Map<string, number>();
  const alignmentCounts = new Map<string, number>();
  for (const standard of standards) {
    if (standard.parentStandardId) {
      childCounts.set(
        standard.parentStandardId,
        (childCounts.get(standard.parentStandardId) ?? 0) + 1,
      );
    }
  }
  for (const alignment of alignments) {
    alignmentCounts.set(alignment.standardId, (alignmentCounts.get(alignment.standardId) ?? 0) + 1);
  }
  return standards.map((standard) => ({
    ...standard,
    parentCode: standard.parentStandardId ? byId.get(standard.parentStandardId)?.code : undefined,
    childCount: childCounts.get(standard.id) ?? 0,
    alignmentCount: alignmentCounts.get(standard.id) ?? 0,
    frameworkLabel: standardFrameworkLabel(standard),
  }));
}

function searchableText(standard: StandardView): string {
  return [
    standard.code,
    standard.statement,
    standard.issuingOrganization,
    standard.frameworkTitle,
    standard.jurisdiction ?? '',
    standard.subject ?? '',
    standard.gradeBand ?? '',
    standard.version ?? '',
    standard.parentCode ?? '',
  ]
    .join(' ')
    .toLocaleLowerCase('en');
}

export function filterStandards(
  standards: readonly StandardView[],
  filters: StandardFilters,
): StandardView[] {
  const query = filters.query.trim().toLocaleLowerCase('en');
  return standards
    .filter((standard) => {
      if (filters.status !== 'all' && standard.status !== filters.status) return false;
      if (filters.frameworkKey && standard.frameworkKey !== filters.frameworkKey) return false;
      if (filters.subject === '__not-specified__' && standard.subject) return false;
      if (
        filters.subject &&
        filters.subject !== '__not-specified__' &&
        standard.subject !== filters.subject
      )
        return false;
      if (filters.gradeBand === '__not-specified__' && standard.gradeBand) return false;
      if (
        filters.gradeBand &&
        filters.gradeBand !== '__not-specified__' &&
        standard.gradeBand !== filters.gradeBand
      )
        return false;
      return !query || searchableText(standard).includes(query);
    })
    .sort(
      (first, second) =>
        (first.status === second.status ? 0 : first.status === 'active' ? -1 : 1) ||
        first.frameworkLabel.localeCompare(second.frameworkLabel, 'en', {
          sensitivity: 'base',
        }) ||
        first.sortOrder - second.sortOrder ||
        first.code.localeCompare(second.code, 'en', { numeric: true, sensitivity: 'base' }) ||
        first.id.localeCompare(second.id),
    );
}

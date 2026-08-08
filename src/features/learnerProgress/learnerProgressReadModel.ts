import type {
  AssessmentEvidenceKind,
  AssessmentEvidenceProficiency,
  AssessmentEvidenceRecord,
  AssessmentEvidenceStatus,
  LearnerContext,
  LessonPlan,
  LibraryCatalogItem,
  RosterMembership,
  SchoolYear,
  SessionOccurrence,
  Standard,
  StudentRecord,
} from '@/domain/models/entities';
import { formatShortDate } from '@/shared/dates/localDate';

import {
  dateInsideLearnerProgressPeriod,
  type LearnerProgressResolvedPeriod,
} from './learnerProgressPeriod';

export const LEARNER_PROGRESS_CONTRACT_VERSION = 1 as const;

export const learnerProgressModes = ['learners', 'contexts', 'standards'] as const;
export type LearnerProgressMode = (typeof learnerProgressModes)[number];

export type LearnerProgressStatusFilter = 'all' | AssessmentEvidenceStatus;
export type LearnerProgressKindFilter = 'all' | AssessmentEvidenceKind;

export interface LearnerProgressSnapshot {
  schoolYear: SchoolYear;
  asOfDate: string;
  students: readonly StudentRecord[];
  contexts: readonly LearnerContext[];
  standards: readonly Standard[];
  evidence: readonly AssessmentEvidenceRecord[];
  lessonPlans: readonly LessonPlan[];
  sessions: readonly SessionOccurrence[];
  libraryItems: readonly LibraryCatalogItem[];
  rosterMemberships: readonly RosterMembership[];
}

export type LearnerProgressOrder = 'newest' | 'oldest';

export interface LearnerProgressFilters {
  mode: LearnerProgressMode;
  selectedId?: string;
  evidenceId?: string;
  status: LearnerProgressStatusFilter;
  kind: LearnerProgressKindFilter;
  assessmentId?: string;
  standardFilterId?: string;
  sessionId?: string;
  order: LearnerProgressOrder;
  period: LearnerProgressResolvedPeriod;
}

export type LearnerProgressSourceStatus = 'current' | 'archived' | 'snapshot' | 'unavailable';

export interface LearnerProgressSource {
  entityType: 'student' | 'context' | 'lesson-plan' | 'session' | 'assessment' | 'standard';
  entityId?: string;
  label: string;
  status: LearnerProgressSourceStatus;
  href?: string;
}

export interface LearnerProgressEvidenceItem {
  id: string;
  studentId: string;
  schoolYearId: string;
  occurredOn: string;
  title: string;
  kind: AssessmentEvidenceKind;
  status: AssessmentEvidenceStatus;
  valueLabel: string;
  observationText?: string;
  proficiency?: AssessmentEvidenceProficiency;
  notes?: string;
  student: LearnerProgressSource;
  context?: LearnerProgressSource;
  lessonPlan?: LearnerProgressSource;
  session?: LearnerProgressSource;
  assessment?: LearnerProgressSource;
  standards: LearnerProgressSource[];
}

export interface LearnerProgressScopeRow {
  id: string;
  label: string;
  meta: string;
  sourceStatus: LearnerProgressSourceStatus;
  evidenceCount: number;
}

export interface LearnerProgressSummary {
  evidenceCount: number;
  learnerCount: number;
  scoreCount: number;
  proficiencyCount: number;
  observationCount: number;
}

export interface LearnerProgressFilterOption {
  id: string;
  label: string;
  sourceStatus: LearnerProgressSourceStatus;
}

export interface LearnerProgressRosterCoverage {
  status: 'available' | 'not-applicable' | 'unavailable';
  label: string;
  contextCount: number;
  currentRetainedRosterLearnerCount: number;
  coveredRosterLearnerCount: number;
  note: string;
}

export interface LearnerProgressProficiencyHistoryEntry {
  id: string;
  occurredOn: string;
  title: string;
  label: string;
  status: AssessmentEvidenceStatus;
}

export interface LearnerProgressProficiencyHistory {
  scaleKey: string;
  scaleLabel?: string;
  entries: LearnerProgressProficiencyHistoryEntry[];
}

export interface LearnerProgressView {
  contractVersion: typeof LEARNER_PROGRESS_CONTRACT_VERSION;
  schoolYear: SchoolYear;
  asOfDate: string;
  mode: LearnerProgressMode;
  selectedId?: string;
  scopeLabel: string;
  scopeRows: LearnerProgressScopeRow[];
  scopeEvidenceCount: number;
  evidence: LearnerProgressEvidenceItem[];
  selectedEvidence?: LearnerProgressEvidenceItem;
  summary: LearnerProgressSummary;
  assessmentOptions: LearnerProgressFilterOption[];
  standardOptions: LearnerProgressFilterOption[];
  sessionOptions: LearnerProgressFilterOption[];
  rosterCoverage?: LearnerProgressRosterCoverage;
  proficiencyHistory?: LearnerProgressProficiencyHistory;
  schoolYearState: 'future' | 'current' | 'historical';
}

function studentLabel(student: StudentRecord): string {
  return student.preferredName || student.name;
}

function contextKindLabel(kind: LearnerContext['kind']): string {
  if (kind === 'class') return 'Class';
  if (kind === 'group') return 'Group';
  return 'Individual';
}

function compareEvidence(
  first: LearnerProgressEvidenceItem,
  second: LearnerProgressEvidenceItem,
): number {
  return (
    second.occurredOn.localeCompare(first.occurredOn) ||
    first.title.localeCompare(second.title, 'en', { sensitivity: 'base' }) ||
    first.id.localeCompare(second.id)
  );
}

function evidenceValueLabel(record: AssessmentEvidenceRecord): string {
  if (record.kind === 'score') {
    const numeric =
      record.score.value === undefined
        ? undefined
        : record.score.maximum === undefined
          ? String(record.score.value)
          : `${record.score.value} / ${record.score.maximum}`;
    return [record.score.label, numeric].filter(Boolean).join(' · ') || 'Score recorded';
  }
  if (record.kind === 'proficiency') {
    return [record.proficiency.label, record.proficiency.scaleLabel].filter(Boolean).join(' · ');
  }
  return 'Teacher observation';
}

function currentSource(
  entityType: LearnerProgressSource['entityType'],
  entityId: string,
  label: string,
  archived: boolean,
  href: string,
): LearnerProgressSource {
  return {
    entityType,
    entityId,
    label,
    status: archived ? 'archived' : 'current',
    href,
  };
}

function snapshotSource(
  entityType: LearnerProgressSource['entityType'],
  entityId: string | undefined,
  label: string,
): LearnerProgressSource {
  return { entityType, entityId, label, status: 'snapshot' };
}

function unavailableSource(
  entityType: LearnerProgressSource['entityType'],
  entityId: string | undefined,
  label: string,
): LearnerProgressSource {
  return { entityType, entityId, label, status: 'unavailable' };
}

function buildEvidenceItems(snapshot: LearnerProgressSnapshot): LearnerProgressEvidenceItem[] {
  const studentById = new Map(snapshot.students.map((student) => [student.id, student]));
  const contextById = new Map(snapshot.contexts.map((context) => [context.id, context]));
  const standardById = new Map(snapshot.standards.map((standard) => [standard.id, standard]));
  const planById = new Map(snapshot.lessonPlans.map((plan) => [plan.id, plan]));
  const sessionById = new Map(snapshot.sessions.map((session) => [session.id, session]));
  const assessmentById = new Map(
    snapshot.libraryItems
      .filter((item) => item.catalogType === 'assessment')
      .map((assessment) => [assessment.id, assessment]),
  );

  return snapshot.evidence
    .filter((record) => record.schoolYearId === snapshot.schoolYear.id)
    .map((record): LearnerProgressEvidenceItem => {
      const currentStudent = studentById.get(record.studentId);
      const student = currentStudent
        ? currentSource(
            'student',
            currentStudent.id,
            studentLabel(currentStudent),
            currentStudent.status === 'archived',
            `#/learners?student=${encodeURIComponent(currentStudent.id)}`,
          )
        : unavailableSource('student', record.studentId, 'Learner record unavailable');

      let context: LearnerProgressSource | undefined;
      if (record.contextId) {
        const current = contextById.get(record.contextId);
        const snapshotValue = record.sourceSnapshots?.context;
        context = current
          ? currentSource(
              'context',
              current.id,
              `${contextKindLabel(current.kind)} · ${current.name}`,
              current.status === 'archived',
              `#/learners?context=${encodeURIComponent(current.id)}`,
            )
          : snapshotValue
            ? snapshotSource(
                'context',
                record.contextId,
                `${contextKindLabel(snapshotValue.kind)} · ${snapshotValue.name}`,
              )
            : unavailableSource('context', record.contextId, 'Context source unavailable');
      }

      let lessonPlan: LearnerProgressSource | undefined;
      if (record.lessonPlanId) {
        const current = planById.get(record.lessonPlanId);
        const snapshotValue = record.sourceSnapshots?.lessonPlan;
        lessonPlan = current
          ? currentSource(
              'lesson-plan',
              current.id,
              current.title,
              current.workflowState === 'archived',
              `#/planning/edit?plan=${encodeURIComponent(current.id)}`,
            )
          : snapshotValue
            ? snapshotSource('lesson-plan', record.lessonPlanId, snapshotValue.title)
            : unavailableSource(
                'lesson-plan',
                record.lessonPlanId,
                'Lesson Plan source unavailable',
              );
      }

      let session: LearnerProgressSource | undefined;
      if (record.sessionOccurrenceId) {
        const current = sessionById.get(record.sessionOccurrenceId);
        const snapshotValue = record.sourceSnapshots?.sessionOccurrence;
        session = current
          ? currentSource(
              'session',
              current.id,
              `Session · ${formatShortDate(current.date)}`,
              false,
              `#/planning/session?session=${encodeURIComponent(current.id)}`,
            )
          : snapshotValue
            ? snapshotSource(
                'session',
                record.sessionOccurrenceId,
                `Session · ${formatShortDate(snapshotValue.date)}`,
              )
            : unavailableSource(
                'session',
                record.sessionOccurrenceId,
                'Session source unavailable',
              );
      }

      let assessment: LearnerProgressSource | undefined;
      if (record.assessmentId) {
        const current = assessmentById.get(record.assessmentId);
        const snapshotValue = record.sourceSnapshots?.assessment;
        assessment = current
          ? currentSource(
              'assessment',
              current.id,
              current.title,
              current.status === 'archived',
              `#/library?item=${encodeURIComponent(current.id)}`,
            )
          : snapshotValue
            ? snapshotSource('assessment', record.assessmentId, snapshotValue.title)
            : unavailableSource('assessment', record.assessmentId, 'Assessment source unavailable');
      }

      const standardSnapshots = new Map(
        (record.sourceSnapshots?.standards ?? []).map((value) => [value.standardId, value]),
      );
      const standards = record.standardIds.map((standardId) => {
        const current = standardById.get(standardId);
        if (current) {
          return currentSource(
            'standard',
            current.id,
            `${current.code} · ${current.statement}`,
            current.status === 'archived',
            `#/standards?standard=${encodeURIComponent(current.id)}`,
          );
        }
        const snapshotValue = standardSnapshots.get(standardId);
        return snapshotValue
          ? snapshotSource(
              'standard',
              standardId,
              `${snapshotValue.code} · ${snapshotValue.statement}`,
            )
          : unavailableSource('standard', standardId, 'Standard source unavailable');
      });

      return {
        id: record.id,
        studentId: record.studentId,
        schoolYearId: record.schoolYearId,
        occurredOn: record.occurredOn,
        title: record.title,
        kind: record.kind,
        status: record.status,
        valueLabel: evidenceValueLabel(record),
        observationText: record.kind === 'observation' ? record.observation.text : undefined,
        proficiency: record.kind === 'proficiency' ? record.proficiency : undefined,
        notes: record.notes,
        student,
        context,
        lessonPlan,
        session,
        assessment,
        standards,
      };
    })
    .sort(compareEvidence);
}

function globallyFilteredEvidence(
  items: readonly LearnerProgressEvidenceItem[],
  filters: LearnerProgressFilters,
): LearnerProgressEvidenceItem[] {
  return items.filter((item) => {
    if (!dateInsideLearnerProgressPeriod(item.occurredOn, filters.period)) return false;
    if (filters.status !== 'all' && item.status !== filters.status) return false;
    if (filters.kind !== 'all' && item.kind !== filters.kind) return false;
    if (filters.assessmentId && item.assessment?.entityId !== filters.assessmentId) return false;
    if (filters.sessionId && item.session?.entityId !== filters.sessionId) return false;
    if (
      filters.standardFilterId &&
      !item.standards.some((standard) => standard.entityId === filters.standardFilterId)
    ) {
      return false;
    }
    return true;
  });
}

function modeEligibleEvidence(
  items: readonly LearnerProgressEvidenceItem[],
  mode: LearnerProgressMode,
): LearnerProgressEvidenceItem[] {
  if (mode === 'learners') return [...items];
  if (mode === 'contexts') return items.filter((item) => Boolean(item.context?.entityId));
  return items.filter((item) => item.standards.some((standard) => Boolean(standard.entityId)));
}

function scopeFilteredEvidence(
  items: readonly LearnerProgressEvidenceItem[],
  filters: LearnerProgressFilters,
): LearnerProgressEvidenceItem[] {
  if (!filters.selectedId) return [...items];
  if (filters.mode === 'learners') {
    return items.filter((item) => item.studentId === filters.selectedId);
  }
  if (filters.mode === 'contexts') {
    return items.filter((item) => item.context?.entityId === filters.selectedId);
  }
  return items.filter((item) =>
    item.standards.some((standard) => standard.entityId === filters.selectedId),
  );
}

function orderedEvidence(
  items: readonly LearnerProgressEvidenceItem[],
  order: LearnerProgressOrder,
): LearnerProgressEvidenceItem[] {
  const sorted = [...items].sort(compareEvidence);
  return order === 'oldest' ? sorted.reverse() : sorted;
}

function countBy(
  items: readonly LearnerProgressEvidenceItem[],
  key: (item: LearnerProgressEvidenceItem) => string | undefined,
) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = key(item);
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function buildLearnerRows(
  snapshot: LearnerProgressSnapshot,
  items: readonly LearnerProgressEvidenceItem[],
): LearnerProgressScopeRow[] {
  const counts = countBy(items, (item) => item.studentId);
  const rows = snapshot.students.map((student): LearnerProgressScopeRow => ({
    id: student.id,
    label: studentLabel(student),
    meta: student.status === 'archived' ? 'Archived learner' : 'Student record',
    sourceStatus: student.status === 'archived' ? 'archived' : 'current',
    evidenceCount: counts.get(student.id) ?? 0,
  }));

  const knownIds = new Set(rows.map((row) => row.id));
  for (const item of items) {
    if (knownIds.has(item.studentId)) continue;
    knownIds.add(item.studentId);
    rows.push({
      id: item.studentId,
      label: item.student.label,
      meta: 'Learner source unavailable',
      sourceStatus: 'unavailable',
      evidenceCount: counts.get(item.studentId) ?? 0,
    });
  }

  return rows.sort(
    (first, second) =>
      Number(first.sourceStatus === 'archived') - Number(second.sourceStatus === 'archived') ||
      first.label.localeCompare(second.label, 'en', { sensitivity: 'base' }) ||
      first.id.localeCompare(second.id),
  );
}

function buildContextRows(
  snapshot: LearnerProgressSnapshot,
  items: readonly LearnerProgressEvidenceItem[],
): LearnerProgressScopeRow[] {
  const counts = countBy(items, (item) => item.context?.entityId);
  const rows = snapshot.contexts
    .filter((context) => context.schoolYearId === snapshot.schoolYear.id)
    .map((context): LearnerProgressScopeRow => ({
      id: context.id,
      label: context.name,
      meta: `${contextKindLabel(context.kind)}${context.status === 'archived' ? ' · Archived' : ''}`,
      sourceStatus: context.status === 'archived' ? 'archived' : 'current',
      evidenceCount: counts.get(context.id) ?? 0,
    }));

  const knownIds = new Set(rows.map((row) => row.id));
  for (const item of items) {
    const source = item.context;
    if (!source?.entityId || knownIds.has(source.entityId)) continue;
    knownIds.add(source.entityId);
    rows.push({
      id: source.entityId,
      label: source.label,
      meta:
        source.status === 'snapshot'
          ? 'Historical context snapshot'
          : source.status === 'current'
            ? 'Current Context · different School Year'
            : source.status === 'archived'
              ? 'Archived Context · different School Year'
              : 'Context unavailable',
      sourceStatus: source.status,
      evidenceCount: counts.get(source.entityId) ?? 0,
    });
  }

  return rows.sort(
    (first, second) =>
      Number(first.sourceStatus === 'archived') - Number(second.sourceStatus === 'archived') ||
      first.label.localeCompare(second.label, 'en', { sensitivity: 'base' }) ||
      first.id.localeCompare(second.id),
  );
}

function buildStandardRows(
  items: readonly LearnerProgressEvidenceItem[],
): LearnerProgressScopeRow[] {
  const rows = new Map<string, LearnerProgressScopeRow>();
  for (const item of items) {
    for (const standard of item.standards) {
      if (!standard.entityId) continue;
      const existing = rows.get(standard.entityId);
      if (existing) {
        existing.evidenceCount += 1;
        continue;
      }
      rows.set(standard.entityId, {
        id: standard.entityId,
        label: standard.label,
        meta:
          standard.status === 'snapshot'
            ? 'Historical Standard snapshot'
            : standard.status === 'archived'
              ? 'Archived Standard'
              : standard.status === 'unavailable'
                ? 'Standard unavailable'
                : 'Standard',
        sourceStatus: standard.status,
        evidenceCount: 1,
      });
    }
  }
  return [...rows.values()].sort(
    (first, second) =>
      first.label.localeCompare(second.label, 'en', { numeric: true, sensitivity: 'base' }) ||
      first.id.localeCompare(second.id),
  );
}

function scopeLabel(
  mode: LearnerProgressMode,
  selectedId: string | undefined,
  rows: readonly LearnerProgressScopeRow[],
): string {
  if (!selectedId) {
    if (mode === 'learners') return 'All learner Evidence';
    if (mode === 'contexts') return 'All explicitly linked Context Evidence';
    return 'All Standard-linked Evidence';
  }
  return rows.find((row) => row.id === selectedId)?.label ?? 'Selected source unavailable';
}

function summary(items: readonly LearnerProgressEvidenceItem[]): LearnerProgressSummary {
  return {
    evidenceCount: items.length,
    learnerCount: new Set(items.map((item) => item.studentId)).size,
    scoreCount: items.filter((item) => item.kind === 'score').length,
    proficiencyCount: items.filter((item) => item.kind === 'proficiency').length,
    observationCount: items.filter((item) => item.kind === 'observation').length,
  };
}

function filterOptions(
  sources: readonly (LearnerProgressSource | undefined)[],
): LearnerProgressFilterOption[] {
  const values = new Map<string, LearnerProgressFilterOption>();
  for (const source of sources) {
    if (!source?.entityId) continue;
    const existing = values.get(source.entityId);
    if (existing) {
      if (existing.sourceStatus !== 'current' && source.status === 'current') {
        values.set(source.entityId, {
          id: source.entityId,
          label: source.label,
          sourceStatus: source.status,
        });
      }
      continue;
    }
    values.set(source.entityId, {
      id: source.entityId,
      label: source.label,
      sourceStatus: source.status,
    });
  }
  return [...values.values()].sort(
    (first, second) =>
      first.label.localeCompare(second.label, 'en', { numeric: true, sensitivity: 'base' }) ||
      first.id.localeCompare(second.id),
  );
}

function standardFilterOptions(
  items: readonly LearnerProgressEvidenceItem[],
): LearnerProgressFilterOption[] {
  return filterOptions(items.flatMap((item) => item.standards));
}

function schoolYearState(
  snapshot: LearnerProgressSnapshot,
): LearnerProgressView['schoolYearState'] {
  if (
    snapshot.schoolYear.lifecycleState === 'archived' ||
    snapshot.asOfDate > snapshot.schoolYear.endsOn
  ) {
    return 'historical';
  }
  if (snapshot.asOfDate < snapshot.schoolYear.startsOn) return 'future';
  return 'current';
}

function buildRosterCoverage(
  snapshot: LearnerProgressSnapshot,
  filters: LearnerProgressFilters,
  evidence: readonly LearnerProgressEvidenceItem[],
): LearnerProgressRosterCoverage | undefined {
  if (filters.mode !== 'contexts') return undefined;

  const currentContexts = snapshot.contexts.filter(
    (context) => context.schoolYearId === snapshot.schoolYear.id,
  );
  const studentIds = new Set(snapshot.students.map((student) => student.id));

  let relevantContexts = currentContexts.filter(
    (context) => context.kind === 'class' || context.kind === 'group',
  );
  let label = 'All current Class and Group rosters';

  if (filters.selectedId) {
    const selected = currentContexts.find((context) => context.id === filters.selectedId);
    if (!selected || selected.status === 'archived') {
      return {
        status: 'unavailable',
        label: 'Current retained roster coverage unavailable',
        contextCount: 0,
        currentRetainedRosterLearnerCount: 0,
        coveredRosterLearnerCount: 0,
        note: 'This Context is historical, archived, or unavailable. Classroom does not reconstruct past roster membership from retained roster links.',
      };
    }
    if (selected.kind === 'individual') {
      return {
        status: 'not-applicable',
        label: 'Current retained roster coverage not applicable',
        contextCount: 0,
        currentRetainedRosterLearnerCount: 0,
        coveredRosterLearnerCount: 0,
        note: 'Individual is a one-on-one planning context, not a roster. Evidence remains linked through the canonical Student record and explicit source links.',
      };
    }
    relevantContexts = [selected];
    label = `${selected.name} · current retained roster`;
  } else {
    relevantContexts = relevantContexts.filter((context) => context.status === 'active');
  }

  if (schoolYearState(snapshot) === 'historical') {
    return {
      status: 'unavailable',
      label: 'Current retained roster coverage unavailable',
      contextCount: 0,
      currentRetainedRosterLearnerCount: 0,
      coveredRosterLearnerCount: 0,
      note: 'A historical School Year does not provide a trustworthy current-roster denominator. Classroom keeps recorded Evidence readable without reconstructing past membership.',
    };
  }

  const contextIds = new Set(relevantContexts.map((context) => context.id));
  const retainedRosterLearnerIds = new Set(
    snapshot.rosterMemberships
      .filter(
        (membership) =>
          contextIds.has(membership.contextId) && studentIds.has(membership.studentId),
      )
      .map((membership) => membership.studentId),
  );
  const evidenceLearnerIds = new Set(
    evidence
      .filter((item) => item.context?.entityId && contextIds.has(item.context.entityId))
      .map((item) => item.studentId),
  );
  const coveredRosterLearnerCount = [...retainedRosterLearnerIds].filter((studentId) =>
    evidenceLearnerIds.has(studentId),
  ).length;

  return {
    status: 'available',
    label,
    contextCount: relevantContexts.length,
    currentRetainedRosterLearnerCount: retainedRosterLearnerIds.size,
    coveredRosterLearnerCount,
    note: 'This compares the current retained roster with recorded Evidence in the selected review scope. It is not a reconstruction of historical membership and is not a mastery or gap judgment.',
  };
}

function buildProficiencyHistory(
  selectedEvidence: LearnerProgressEvidenceItem | undefined,
  allItems: readonly LearnerProgressEvidenceItem[],
): LearnerProgressProficiencyHistory | undefined {
  if (selectedEvidence?.kind !== 'proficiency' || !selectedEvidence.proficiency?.scaleKey) {
    return undefined;
  }

  const scaleKey = selectedEvidence.proficiency.scaleKey;
  const entries = allItems
    .filter(
      (item) =>
        item.kind === 'proficiency' &&
        item.studentId === selectedEvidence.studentId &&
        item.proficiency?.scaleKey === scaleKey,
    )
    .sort(
      (first, second) =>
        first.occurredOn.localeCompare(second.occurredOn) ||
        first.title.localeCompare(second.title, 'en', { sensitivity: 'base' }) ||
        first.id.localeCompare(second.id),
    )
    .map((item) => ({
      id: item.id,
      occurredOn: item.occurredOn,
      title: item.title,
      label: item.proficiency!.label,
      status: item.status,
    }));

  return {
    scaleKey,
    scaleLabel: selectedEvidence.proficiency.scaleLabel,
    entries,
  };
}

export function buildLearnerProgressView(
  snapshot: LearnerProgressSnapshot,
  filters: LearnerProgressFilters,
): LearnerProgressView {
  const allItems = buildEvidenceItems(snapshot);
  const globallyFiltered = globallyFilteredEvidence(allItems, filters);
  const scopeRows =
    filters.mode === 'learners'
      ? buildLearnerRows(snapshot, globallyFiltered)
      : filters.mode === 'contexts'
        ? buildContextRows(snapshot, globallyFiltered)
        : buildStandardRows(globallyFiltered);
  const eligibleEvidence = modeEligibleEvidence(globallyFiltered, filters.mode);
  const scopedEvidence = scopeFilteredEvidence(eligibleEvidence, filters);
  const evidence = orderedEvidence(scopedEvidence, filters.order);
  const selectedEvidence = filters.evidenceId
    ? allItems.find((item) => item.id === filters.evidenceId)
    : undefined;

  return {
    contractVersion: LEARNER_PROGRESS_CONTRACT_VERSION,
    schoolYear: snapshot.schoolYear,
    asOfDate: snapshot.asOfDate,
    mode: filters.mode,
    selectedId: filters.selectedId,
    scopeLabel: scopeLabel(filters.mode, filters.selectedId, scopeRows),
    scopeRows,
    scopeEvidenceCount: eligibleEvidence.length,
    evidence,
    selectedEvidence,
    summary: summary(evidence),
    assessmentOptions: filterOptions(allItems.map((item) => item.assessment)),
    standardOptions: standardFilterOptions(allItems),
    sessionOptions: filterOptions(allItems.map((item) => item.session)),
    rosterCoverage: buildRosterCoverage(snapshot, filters, scopedEvidence),
    proficiencyHistory: buildProficiencyHistory(selectedEvidence, allItems),
    schoolYearState: schoolYearState(snapshot),
  };
}

import type {
  AssessmentEvidenceRecord,
  CategoryAssignment,
  CategoryValue,
  LearnerContext,
  LessonPlan,
  LibraryApplicationLink,
  LibraryApplicationType,
  LibraryCatalogItem,
  RosterMembership,
  SchoolYear,
  SessionOccurrence,
  Standard,
  StandardAlignment,
  StudentRecord,
} from '@/domain/models/entities';
import { shiftDays } from '@/shared/dates/localDate';

import {
  teachingInsightsPlanCategoryFamilies,
  type TeachingInsightsContentType,
  type TeachingInsightsContextKind,
  type TeachingInsightsEvidenceKind,
  type TeachingInsightsNeedsReviewIssue,
  type TeachingInsightsPlanCategoryFamily,
  type TeachingInsightsRatio,
  type TeachingInsightsSourceTrace,
} from './teachingInsightsContract';

export interface TeachingInsightsSnapshot {
  schoolYear: SchoolYear;
  asOfDate: string;
  learnerContexts: readonly LearnerContext[];
  studentRecords: readonly StudentRecord[];
  rosterMemberships: readonly RosterMembership[];
  lessonPlans: readonly LessonPlan[];
  sessionOccurrences: readonly SessionOccurrence[];
  assessmentEvidence: readonly AssessmentEvidenceRecord[];
  libraryItems: readonly LibraryCatalogItem[];
  standards: readonly Standard[];
  standardAlignments: readonly StandardAlignment[];
  categoryValues: readonly CategoryValue[];
  categoryAssignments: readonly CategoryAssignment[];
}

export interface TeachingInsightsSessionRow {
  id: string;
  title: string;
  date: string;
  minutes: number;
  contextId: string;
  contextName: string;
  contextKind: TeachingInsightsContextKind;
  contextArchived: boolean;
  deliveryState: SessionOccurrence['deliveryState'];
  source: TeachingInsightsSourceTrace;
}

export interface TeachingInsightsContextRow {
  contextId: string;
  contextName: string;
  contextKind: TeachingInsightsContextKind;
  archived: boolean;
  completedSessions: number;
  completedMinutes: number;
  teachingDays: number;
  unresolvedPastSessions: number;
  futureScheduledSessions: number;
  source: TeachingInsightsSourceTrace;
}

export interface TeachingInsightsContextKindRow {
  contextKind: TeachingInsightsContextKind;
  completedSessions: number;
  completedMinutes: number;
  teachingDays: number;
}

export interface TeachingInsightsContentTypeCounts {
  activity: number;
  resource: number;
  assessment: number;
}

export interface TeachingInsightsContentPlacement {
  key: string;
  planId: string;
  planTitle: string;
  scope: 'plan-root' | 'lesson-flow-step';
  stepId?: string;
  stepTitle?: string;
  libraryItemId: string;
  title: string;
  catalogType: TeachingInsightsContentType;
  archivedSource: boolean;
  source: TeachingInsightsSourceTrace;
}

export interface TeachingInsightsStandardPlacement {
  alignmentId: string;
  planId: string;
  planTitle: string;
  standardId: string;
  standardCode: string;
  standardStatement: string;
  scope: 'plan-root' | 'lesson-flow-step';
  stepId?: string;
  stepTitle?: string;
  source: TeachingInsightsSourceTrace;
}

export interface TeachingInsightsCategoryFamilySummary {
  familyId: TeachingInsightsPlanCategoryFamily;
  assignmentCount: number;
  planCount: number;
  distinctValueCount: number;
}

export interface TeachingInsightsView {
  contractVersion: 1;
  schoolYear: {
    id: string;
    label: string;
    startsOn: string;
    endsOn: string;
    asOfDate: string;
    closedThrough?: string;
    status: 'future' | 'current' | 'historical';
    source: TeachingInsightsSourceTrace;
  };
  teachingActivity: {
    completedSessionCount: number;
    completedTeachingMinutes: number;
    teachingDayCount: number;
    sessions: TeachingInsightsSessionRow[];
  };
  plannedVersusTaught: {
    pastPlannedSessionCount: number;
    taughtSessionCount: number;
    unresolvedPastSessionCount: number;
    futureScheduledSessionCount: number;
    cancelledSessionCount: number;
    completion: TeachingInsightsRatio;
    readyUnscheduledPlanCount: number;
  };
  assessmentEvidence: {
    activeEvidenceCount: number;
    learnerCount: number;
    currentRetainedRosterLearnerCount: number;
    currentRetainedRosterCoveredLearnerCount: number;
    currentRetainedRosterCoverage: TeachingInsightsRatio;
    byKind: Record<TeachingInsightsEvidenceKind, number>;
    sourceLinkage: {
      context: number;
      lessonPlan: number;
      session: number;
      assessment: number;
      standard: number;
    };
  };
  contextDistribution: {
    byKind: TeachingInsightsContextKindRow[];
    contexts: TeachingInsightsContextRow[];
  };
  standardsUsage: {
    activePlanCount: number;
    plansWithActiveAlignmentCount: number;
    plansWithoutActiveAlignmentCount: number;
    uniqueExplicitlyLinkedStandardCount: number;
    alignmentPlacementCount: number;
    placements: TeachingInsightsStandardPlacement[];
  };
  contentUsage: {
    plansWithContentLinksCount: number;
    uniqueItemCount: number;
    placementCount: number;
    archivedSourcePlacementCount: number;
    uniqueItemsByType: TeachingInsightsContentTypeCounts;
    placementsByType: TeachingInsightsContentTypeCounts;
    placements: TeachingInsightsContentPlacement[];
  };
  classificationUsage: {
    families: TeachingInsightsCategoryFamilySummary[];
  };
  needsReview: {
    affectedRecordCount: number;
    issueCount: number;
    issues: TeachingInsightsNeedsReviewIssue[];
  };
}

function sourceHref(
  entityType: TeachingInsightsSourceTrace['entityType'],
  id: string,
): string | undefined {
  if (entityType === 'session') return `#/planning/session?session=${encodeURIComponent(id)}`;
  if (entityType === 'lesson-plan') {
    return `#/planning/edit?plan=${encodeURIComponent(id)}&return=learners`;
  }
  if (entityType === 'context') return `#/learners?context=${encodeURIComponent(id)}`;
  if (entityType === 'student') return `#/learners?student=${encodeURIComponent(id)}`;
  if (entityType === 'standard') return '#/standards';
  if (entityType === 'library-item') return '#/library';
  return undefined;
}

function source(
  entityType: TeachingInsightsSourceTrace['entityType'],
  entityId: string,
  label: string,
  archived = false,
): TeachingInsightsSourceTrace {
  return {
    entityType,
    entityId,
    label,
    href: sourceHref(entityType, entityId),
    archived: archived || undefined,
  };
}

function ratio(
  numerator: number,
  denominator: number,
  reason: Extract<TeachingInsightsRatio, { status: 'unavailable' }>['reason'],
): TeachingInsightsRatio {
  if (denominator === 0) return { status: 'unavailable', numerator, denominator: 0, reason };
  return { status: 'available', numerator, denominator, value: numerator / denominator };
}

function zeroContentCounts(): TeachingInsightsContentTypeCounts {
  return { activity: 0, resource: 0, assessment: 0 };
}

function schoolYearStatus(
  schoolYear: SchoolYear,
  asOfDate: string,
): TeachingInsightsView['schoolYear']['status'] {
  if (asOfDate < schoolYear.startsOn) return 'future';
  if (asOfDate > schoolYear.endsOn) return 'historical';
  return 'current';
}

function closedThrough(schoolYear: SchoolYear, asOfDate: string): string | undefined {
  if (asOfDate < schoolYear.startsOn) return undefined;
  if (asOfDate > schoolYear.endsOn) return schoolYear.endsOn;
  const yesterday = shiftDays(asOfDate, -1);
  return yesterday < schoolYear.startsOn ? undefined : yesterday;
}

function insideSchoolYear(date: string, schoolYear: SchoolYear): boolean {
  return date >= schoolYear.startsOn && date <= schoolYear.endsOn;
}

function sortedIssues(
  issues: TeachingInsightsNeedsReviewIssue[],
): TeachingInsightsNeedsReviewIssue[] {
  return issues.sort(
    (first, second) =>
      first.code.localeCompare(second.code) ||
      first.entityType.localeCompare(second.entityType) ||
      first.entityId.localeCompare(second.entityId),
  );
}

function sessionTitle(session: SessionOccurrence, plan?: LessonPlan): string {
  return plan?.title ?? `Session on ${session.date}`;
}

function addIssue(
  issues: TeachingInsightsNeedsReviewIssue[],
  issue: TeachingInsightsNeedsReviewIssue,
): void {
  issues.push(issue);
}

interface ContentPlacementInput {
  plan: LessonPlan;
  link: LibraryApplicationLink;
  scope: TeachingInsightsContentPlacement['scope'];
  stepId?: string;
  stepTitle?: string;
}

export function buildTeachingInsightsView(input: TeachingInsightsSnapshot): TeachingInsightsView {
  const { schoolYear, asOfDate } = input;
  const selectedContexts = input.learnerContexts.filter(
    (context) => context.schoolYearId === schoolYear.id,
  );
  const contextsById = new Map(selectedContexts.map((context) => [context.id, context]));
  const allContextsById = new Map(input.learnerContexts.map((context) => [context.id, context]));
  const studentsById = new Map(input.studentRecords.map((student) => [student.id, student]));
  const plansById = new Map(input.lessonPlans.map((plan) => [plan.id, plan]));
  const selectedPlans = input.lessonPlans.filter((plan) => contextsById.has(plan.contextId));
  const activePlans = selectedPlans.filter((plan) => plan.workflowState !== 'archived');
  const activePlanIds = new Set(activePlans.map((plan) => plan.id));
  const selectedSessions = input.sessionOccurrences.filter((session) =>
    contextsById.has(session.contextId),
  );
  const libraryById = new Map(input.libraryItems.map((item) => [item.id, item]));
  const standardsById = new Map(input.standards.map((standard) => [standard.id, standard]));
  const categoryValuesById = new Map(input.categoryValues.map((value) => [value.id, value]));
  const issues: TeachingInsightsNeedsReviewIssue[] = [];
  const closedDate = closedThrough(schoolYear, asOfDate);
  const yearStatus = schoolYearStatus(schoolYear, asOfDate);

  for (const context of selectedContexts) {
    if (context.kind === 'individual' && !context.linkedStudentId) {
      addIssue(issues, {
        code: 'unlinked-individual-context',
        entityType: 'context',
        entityId: context.id,
        message: 'Individual context has no linked learner record.',
        source: source('context', context.id, context.name, context.status === 'archived'),
      });
    }
  }

  const completedSessionRows: TeachingInsightsSessionRow[] = [];
  const unresolvedPastSessions: SessionOccurrence[] = [];
  const futureScheduledSessions: SessionOccurrence[] = [];
  let cancelledSessionCount = 0;

  for (const session of input.sessionOccurrences) {
    const context = allContextsById.get(session.contextId);
    const plan = plansById.get(session.lessonPlanId);
    const title = sessionTitle(session, plan);
    const sessionSource = source('session', session.id, title);

    if (!context) {
      addIssue(issues, {
        code: 'session-missing-context',
        entityType: 'session',
        entityId: session.id,
        message: 'Session references a context that no longer exists.',
        source: sessionSource,
      });
      continue;
    }
    if (context.schoolYearId !== schoolYear.id) continue;

    if (!insideSchoolYear(session.date, schoolYear)) {
      addIssue(issues, {
        code: 'session-outside-school-year',
        entityType: 'session',
        entityId: session.id,
        message: 'Session date falls outside its context School Year.',
        source: sessionSource,
      });
      continue;
    }

    if (!plan) {
      addIssue(issues, {
        code: 'session-missing-plan',
        entityType: 'session',
        entityId: session.id,
        message: 'Session references a Lesson Plan that no longer exists.',
        source: sessionSource,
      });
    } else if (plan.contextId !== session.contextId) {
      addIssue(issues, {
        code: 'session-context-mismatch',
        entityType: 'session',
        entityId: session.id,
        message: 'Session and Lesson Plan belong to different planning contexts.',
        source: sessionSource,
      });
    }

    const row: TeachingInsightsSessionRow = {
      id: session.id,
      title,
      date: session.date,
      minutes: session.endMinute - session.startMinute,
      contextId: context.id,
      contextName: context.name,
      contextKind: context.kind,
      contextArchived: context.status === 'archived',
      deliveryState: session.deliveryState,
      source: sessionSource,
    };
    if (session.deliveryState === 'cancelled') {
      cancelledSessionCount += 1;
      continue;
    }

    if (session.deliveryState === 'completed') {
      if (!session.completedAt) {
        addIssue(issues, {
          code: 'completed-session-missing-completed-at',
          entityType: 'session',
          entityId: session.id,
          message: 'Completed Session has no completion timestamp.',
          source: sessionSource,
        });
      }
      if (session.date > asOfDate) {
        addIssue(issues, {
          code: 'future-completed-session',
          entityType: 'session',
          entityId: session.id,
          message: 'Completed Session is dated in the future.',
          source: sessionSource,
        });
        continue;
      }
      completedSessionRows.push(row);
      continue;
    }

    if (closedDate && session.date <= closedDate) {
      unresolvedPastSessions.push(session);
      addIssue(issues, {
        code: 'past-session-still-scheduled',
        entityType: 'session',
        entityId: session.id,
        message: 'Past Session is still marked Scheduled.',
        source: sessionSource,
      });
    } else if (session.date >= asOfDate) {
      futureScheduledSessions.push(session);
    }
  }

  completedSessionRows.sort(
    (first, second) =>
      second.date.localeCompare(first.date) ||
      first.contextName.localeCompare(second.contextName, 'en', { sensitivity: 'base' }) ||
      first.title.localeCompare(second.title, 'en', { sensitivity: 'base' }) ||
      first.id.localeCompare(second.id),
  );

  const completedTeachingMinutes = completedSessionRows.reduce(
    (total, session) => total + session.minutes,
    0,
  );
  const teachingDayCount = new Set(completedSessionRows.map((session) => session.date)).size;
  const taughtClosedPeriodCount = completedSessionRows.filter(
    (session) => closedDate && session.date <= closedDate,
  ).length;
  const plannedDenominator = taughtClosedPeriodCount + unresolvedPastSessions.length;

  const retainedSessionPlanIds = new Set(
    selectedSessions
      .filter((session) => session.deliveryState !== 'cancelled')
      .map((session) => session.lessonPlanId),
  );
  const readyUnscheduledPlanCount = activePlans.filter(
    (plan) => plan.workflowState === 'ready' && !retainedSessionPlanIds.has(plan.id),
  ).length;

  const activeEvidence = input.assessmentEvidence.filter((record) => {
    if (record.schoolYearId !== schoolYear.id) return false;
    const evidenceSource = source(
      'assessment-evidence',
      record.id,
      record.title,
      record.status === 'archived',
    );
    if (!insideSchoolYear(record.occurredOn, schoolYear)) {
      addIssue(issues, {
        code: 'evidence-outside-school-year',
        entityType: 'assessment-evidence',
        entityId: record.id,
        message: 'Assessment Evidence date falls outside its School Year.',
        source: evidenceSource,
      });
      return false;
    }
    if (!studentsById.has(record.studentId)) {
      addIssue(issues, {
        code: 'evidence-missing-student',
        entityType: 'assessment-evidence',
        entityId: record.id,
        message: 'Assessment Evidence references a learner record that no longer exists.',
        source: evidenceSource,
      });
    }
    if (record.contextId) {
      const context = allContextsById.get(record.contextId);
      if (context && context.schoolYearId !== record.schoolYearId) {
        addIssue(issues, {
          code: 'evidence-context-year-mismatch',
          entityType: 'assessment-evidence',
          entityId: record.id,
          message: 'Assessment Evidence and its linked context belong to different School Years.',
          source: evidenceSource,
        });
      }
    }
    return record.status === 'active' && record.occurredOn <= asOfDate;
  });

  const evidenceLearnerIds = new Set(activeEvidence.map((record) => record.studentId));
  const retainedRosterLearnerIds = new Set<string>();
  for (const membership of input.rosterMemberships) {
    const context = contextsById.get(membership.contextId);
    if (!context || context.kind === 'individual') continue;
    if (studentsById.has(membership.studentId)) retainedRosterLearnerIds.add(membership.studentId);
  }
  for (const context of selectedContexts) {
    if (
      context.kind === 'individual' &&
      context.linkedStudentId &&
      studentsById.has(context.linkedStudentId)
    ) {
      retainedRosterLearnerIds.add(context.linkedStudentId);
    }
  }
  const coveredRosterLearnerIds = new Set(
    [...retainedRosterLearnerIds].filter((studentId) => evidenceLearnerIds.has(studentId)),
  );

  const byKind: Record<TeachingInsightsEvidenceKind, number> = {
    score: 0,
    proficiency: 0,
    observation: 0,
  };
  const sourceLinkage = { context: 0, lessonPlan: 0, session: 0, assessment: 0, standard: 0 };
  for (const record of activeEvidence) {
    byKind[record.kind] += 1;
    if (record.contextId) sourceLinkage.context += 1;
    if (record.lessonPlanId) sourceLinkage.lessonPlan += 1;
    if (record.sessionOccurrenceId) sourceLinkage.session += 1;
    if (record.assessmentId) sourceLinkage.assessment += 1;
    if (record.standardIds.length > 0) sourceLinkage.standard += 1;
  }

  const contextRows: TeachingInsightsContextRow[] = selectedContexts.map((context) => {
    const contextCompleted = completedSessionRows.filter(
      (session) => session.contextId === context.id,
    );
    const contextUnresolved = unresolvedPastSessions.filter(
      (session) => session.contextId === context.id,
    );
    const contextFuture = futureScheduledSessions.filter(
      (session) => session.contextId === context.id,
    );
    return {
      contextId: context.id,
      contextName: context.name,
      contextKind: context.kind,
      archived: context.status === 'archived',
      completedSessions: contextCompleted.length,
      completedMinutes: contextCompleted.reduce((total, session) => total + session.minutes, 0),
      teachingDays: new Set(contextCompleted.map((session) => session.date)).size,
      unresolvedPastSessions: contextUnresolved.length,
      futureScheduledSessions: contextFuture.length,
      source: source('context', context.id, context.name, context.status === 'archived'),
    };
  });
  contextRows.sort(
    (first, second) =>
      Number(first.archived) - Number(second.archived) ||
      first.contextName.localeCompare(second.contextName, 'en', { sensitivity: 'base' }) ||
      first.contextId.localeCompare(second.contextId),
  );

  const contextKinds: readonly TeachingInsightsContextKind[] = ['class', 'group', 'individual'];
  const byContextKind: TeachingInsightsContextKindRow[] = contextKinds.map((contextKind) => {
    const matching = completedSessionRows.filter((session) => session.contextKind === contextKind);
    return {
      contextKind,
      completedSessions: matching.length,
      completedMinutes: matching.reduce((total, session) => total + session.minutes, 0),
      teachingDays: new Set(matching.map((session) => session.date)).size,
    };
  });

  const alignedPlanIds = new Set<string>();
  const linkedStandardIds = new Set<string>();
  const standardPlacements: TeachingInsightsStandardPlacement[] = [];
  for (const alignment of input.standardAlignments) {
    if (alignment.targetType !== 'lesson-plan') continue;
    const plan = plansById.get(alignment.targetId);
    if (!plan || !activePlanIds.has(plan.id)) continue;
    const standard = standardsById.get(alignment.standardId);
    const step = alignment.lessonFlowStepId
      ? plan.lessonFlow?.find((value) => value.id === alignment.lessonFlowStepId)
      : undefined;
    if (!standard || standard.status !== 'active' || (alignment.lessonFlowStepId && !step)) {
      addIssue(issues, {
        code: 'standard-alignment-missing-source',
        entityType: 'lesson-plan',
        entityId: plan.id,
        message: 'Standard alignment has a missing, archived, or invalid source.',
        source: source('lesson-plan', plan.id, plan.title),
      });
      continue;
    }
    alignedPlanIds.add(plan.id);
    linkedStandardIds.add(standard.id);
    standardPlacements.push({
      alignmentId: alignment.id,
      planId: plan.id,
      planTitle: plan.title,
      standardId: standard.id,
      standardCode: standard.code,
      standardStatement: standard.statement,
      scope: step ? 'lesson-flow-step' : 'plan-root',
      stepId: step?.id,
      stepTitle: step?.title,
      source: source('lesson-plan', plan.id, plan.title),
    });
  }
  standardPlacements.sort(
    (first, second) =>
      first.planTitle.localeCompare(second.planTitle, 'en', { sensitivity: 'base' }) ||
      first.standardCode.localeCompare(second.standardCode, 'en', {
        numeric: true,
        sensitivity: 'base',
      }) ||
      (first.stepTitle ?? '').localeCompare(second.stepTitle ?? '', 'en', { sensitivity: 'base' }),
  );

  const contentPlacementInputs: ContentPlacementInput[] = [];
  for (const plan of activePlans) {
    for (const link of plan.libraryLinks ?? []) {
      contentPlacementInputs.push({ plan, link, scope: 'plan-root' });
    }
    for (const step of plan.lessonFlow ?? []) {
      for (const link of step.libraryLinks ?? []) {
        contentPlacementInputs.push({
          plan,
          link,
          scope: 'lesson-flow-step',
          stepId: step.id,
          stepTitle: step.title,
        });
      }
    }
  }

  const contentPlacements: TeachingInsightsContentPlacement[] = [];
  for (const placement of contentPlacementInputs) {
    const item = libraryById.get(placement.link.libraryItemId);
    const placementKey = `${placement.plan.id}:${placement.scope}:${placement.stepId ?? 'root'}:${placement.link.libraryItemId}`;
    if (!item) {
      if (!placement.link.snapshot) {
        addIssue(issues, {
          code: 'library-link-missing-source',
          entityType: 'lesson-plan',
          entityId: placement.plan.id,
          message: 'Planning content link has no current Library source or retained snapshot.',
          source: source('lesson-plan', placement.plan.id, placement.plan.title),
        });
        continue;
      }
      contentPlacements.push({
        key: placementKey,
        planId: placement.plan.id,
        planTitle: placement.plan.title,
        scope: placement.scope,
        stepId: placement.stepId,
        stepTitle: placement.stepTitle,
        libraryItemId: placement.link.libraryItemId,
        title: placement.link.snapshot.title,
        catalogType: placement.link.catalogType,
        archivedSource: true,
        source: source('lesson-plan', placement.plan.id, placement.plan.title),
      });
      continue;
    }
    if (item.catalogType !== placement.link.catalogType) {
      addIssue(issues, {
        code: 'library-link-type-mismatch',
        entityType: 'lesson-plan',
        entityId: placement.plan.id,
        message: 'Planning content link type does not match its current Library source.',
        source: source('lesson-plan', placement.plan.id, placement.plan.title),
      });
      continue;
    }
    contentPlacements.push({
      key: placementKey,
      planId: placement.plan.id,
      planTitle: placement.plan.title,
      scope: placement.scope,
      stepId: placement.stepId,
      stepTitle: placement.stepTitle,
      libraryItemId: item.id,
      title: item.title,
      catalogType: item.catalogType,
      archivedSource: item.status === 'archived',
      source: source('lesson-plan', placement.plan.id, placement.plan.title),
    });
  }
  contentPlacements.sort(
    (first, second) =>
      first.planTitle.localeCompare(second.planTitle, 'en', { sensitivity: 'base' }) ||
      first.catalogType.localeCompare(second.catalogType) ||
      first.title.localeCompare(second.title, 'en', { sensitivity: 'base' }) ||
      (first.stepTitle ?? '').localeCompare(second.stepTitle ?? '', 'en', { sensitivity: 'base' }),
  );

  const plansWithContentLinks = new Set(contentPlacements.map((placement) => placement.planId));
  const uniqueItems = new Map<string, LibraryApplicationType>();
  const uniqueItemsByType = zeroContentCounts();
  const placementsByType = zeroContentCounts();
  for (const placement of contentPlacements) {
    placementsByType[placement.catalogType] += 1;
    uniqueItems.set(placement.libraryItemId, placement.catalogType);
  }
  for (const catalogType of uniqueItems.values()) uniqueItemsByType[catalogType] += 1;

  const categoryFamilyPlanIds = new Map<TeachingInsightsPlanCategoryFamily, Set<string>>();
  const categoryFamilyValueIds = new Map<TeachingInsightsPlanCategoryFamily, Set<string>>();
  const categoryFamilyAssignmentCounts = new Map<TeachingInsightsPlanCategoryFamily, number>();
  for (const familyId of teachingInsightsPlanCategoryFamilies) {
    categoryFamilyPlanIds.set(familyId, new Set());
    categoryFamilyValueIds.set(familyId, new Set());
    categoryFamilyAssignmentCounts.set(familyId, 0);
  }
  for (const assignment of input.categoryAssignments) {
    if (assignment.entityType !== 'lesson-plan' || !activePlanIds.has(assignment.entityId))
      continue;
    if (
      !teachingInsightsPlanCategoryFamilies.includes(
        assignment.familyId as TeachingInsightsPlanCategoryFamily,
      )
    ) {
      continue;
    }
    const familyId = assignment.familyId as TeachingInsightsPlanCategoryFamily;
    const value = categoryValuesById.get(assignment.categoryValueId);
    if (!value || value.familyId !== assignment.familyId) {
      const plan = plansById.get(assignment.entityId);
      addIssue(issues, {
        code: 'category-assignment-missing-source',
        entityType: 'category-assignment',
        entityId: assignment.id,
        message: 'Plan category assignment has a missing or mismatched category value.',
        source: source('lesson-plan', assignment.entityId, plan?.title ?? 'Lesson Plan'),
      });
      continue;
    }
    categoryFamilyAssignmentCounts.set(
      familyId,
      (categoryFamilyAssignmentCounts.get(familyId) ?? 0) + 1,
    );
    categoryFamilyPlanIds.get(familyId)?.add(assignment.entityId);
    categoryFamilyValueIds.get(familyId)?.add(assignment.categoryValueId);
  }

  const categoryFamilies: TeachingInsightsCategoryFamilySummary[] =
    teachingInsightsPlanCategoryFamilies.map((familyId) => ({
      familyId,
      assignmentCount: categoryFamilyAssignmentCounts.get(familyId) ?? 0,
      planCount: categoryFamilyPlanIds.get(familyId)?.size ?? 0,
      distinctValueCount: categoryFamilyValueIds.get(familyId)?.size ?? 0,
    }));

  const sorted = sortedIssues(issues);
  const affectedRecordCount = new Set(
    sorted.map((issue) => `${issue.entityType}:${issue.entityId}`),
  ).size;

  return {
    contractVersion: 1,
    schoolYear: {
      id: schoolYear.id,
      label: schoolYear.label,
      startsOn: schoolYear.startsOn,
      endsOn: schoolYear.endsOn,
      asOfDate,
      closedThrough: closedDate,
      status: yearStatus,
      source: source(
        'school-year',
        schoolYear.id,
        schoolYear.label,
        schoolYear.lifecycleState === 'archived',
      ),
    },
    teachingActivity: {
      completedSessionCount: completedSessionRows.length,
      completedTeachingMinutes,
      teachingDayCount,
      sessions: completedSessionRows,
    },
    plannedVersusTaught: {
      pastPlannedSessionCount: plannedDenominator,
      taughtSessionCount: taughtClosedPeriodCount,
      unresolvedPastSessionCount: unresolvedPastSessions.length,
      futureScheduledSessionCount: futureScheduledSessions.length,
      cancelledSessionCount,
      completion:
        yearStatus === 'future'
          ? { status: 'unavailable', numerator: 0, denominator: 0, reason: 'future-school-year' }
          : ratio(taughtClosedPeriodCount, plannedDenominator, 'no-eligible-records'),
      readyUnscheduledPlanCount,
    },
    assessmentEvidence: {
      activeEvidenceCount: activeEvidence.length,
      learnerCount: evidenceLearnerIds.size,
      currentRetainedRosterLearnerCount: retainedRosterLearnerIds.size,
      currentRetainedRosterCoveredLearnerCount: coveredRosterLearnerIds.size,
      currentRetainedRosterCoverage: ratio(
        coveredRosterLearnerIds.size,
        retainedRosterLearnerIds.size,
        'no-retained-roster-links',
      ),
      byKind,
      sourceLinkage,
    },
    contextDistribution: {
      byKind: byContextKind,
      contexts: contextRows,
    },
    standardsUsage: {
      activePlanCount: activePlans.length,
      plansWithActiveAlignmentCount: alignedPlanIds.size,
      plansWithoutActiveAlignmentCount: activePlans.length - alignedPlanIds.size,
      uniqueExplicitlyLinkedStandardCount: linkedStandardIds.size,
      alignmentPlacementCount: standardPlacements.length,
      placements: standardPlacements,
    },
    contentUsage: {
      plansWithContentLinksCount: plansWithContentLinks.size,
      uniqueItemCount: uniqueItems.size,
      placementCount: contentPlacements.length,
      archivedSourcePlacementCount: contentPlacements.filter(
        (placement) => placement.archivedSource,
      ).length,
      uniqueItemsByType,
      placementsByType,
      placements: contentPlacements,
    },
    classificationUsage: {
      families: categoryFamilies,
    },
    needsReview: {
      affectedRecordCount,
      issueCount: sorted.length,
      issues: sorted,
    },
  };
}

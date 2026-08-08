import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { AssessmentEvidenceEditorPanel } from '@/features/assessmentEvidence/AssessmentEvidenceEditorPanel';
import { assessmentEvidenceMutationService } from '@/features/assessmentEvidence/assessmentEvidenceMutationService';
import { LearnerProgressDashboard } from '@/features/learnerProgress/LearnerProgressDashboard';
import {
  appendLearnerProgressPeriodParams,
  clampLearnerProgressPeriodToSchoolYear,
  parseLearnerProgressPeriodState,
  resolveLearnerProgressPeriod,
  type LearnerProgressPeriodState,
} from '@/features/learnerProgress/learnerProgressPeriod';
import {
  buildLearnerProgressView,
  type LearnerProgressKindFilter,
  type LearnerProgressMode,
  type LearnerProgressOrder,
  type LearnerProgressStatusFilter,
} from '@/features/learnerProgress/learnerProgressReadModel';
import {
  appendLearnerProgressEditor,
  appendLearnerProgressFilters,
  appendLearnerProgressMode,
  appendLearnerProgressSourceFilters,
  parseLearnerProgressRouteState,
} from '@/features/learnerProgress/learnerProgressRouteState';
import {
  decorateLearnerProgressSourceHref,
  parseLearnerProgressCloseoutReturnState,
  type LearnerProgressReturnState,
} from '@/features/learnerProgress/learnerProgressNavigation';
import { useLearnerProgress } from '@/features/learnerProgress/useLearnerProgress';
import { parseTeachingReviewReturnState } from '@/features/teachingReview/teachingReviewNavigation';

import styles from './InsightsRoute.module.css';

export function LearnerProgressRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSchoolYearId = searchParams.get('schoolYear') ?? undefined;
  const periodState = parseLearnerProgressPeriodState(searchParams);
  const routeState = parseLearnerProgressRouteState(searchParams);
  const parentReviewReturn = parseTeachingReviewReturnState(searchParams) ?? undefined;
  const closeoutReturn = parseLearnerProgressCloseoutReturnState(searchParams);
  const state = useLearnerProgress(requestedSchoolYearId);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [mutationMessage, setMutationMessage] = useState<string | null>(null);
  const selectedSchoolYear = state.status === 'ready' ? state.data.selectedSchoolYear : null;
  const effectivePeriod = selectedSchoolYear
    ? clampLearnerProgressPeriodToSchoolYear(periodState, selectedSchoolYear)
    : periodState;

  useEffect(() => {
    if (!selectedSchoolYear) return;
    const next = new URLSearchParams(searchParams);
    appendLearnerProgressPeriodParams(next, effectivePeriod);
    if (next.toString() === searchParams.toString()) return;
    setSearchParams(next, { replace: true });
  }, [effectivePeriod, searchParams, selectedSchoolYear, setSearchParams]);

  useEffect(() => {
    if (!requestedSchoolYearId || state.status !== 'ready') return;
    const selectedSchoolYearId = state.data.selectedSchoolYear?.id;
    if (!selectedSchoolYearId || selectedSchoolYearId === requestedSchoolYearId) return;
    const requestedExists = state.data.schoolYears.some(
      (schoolYear) => schoolYear.id === requestedSchoolYearId,
    );
    if (requestedExists) return;

    const next = new URLSearchParams(searchParams);
    next.set('schoolYear', selectedSchoolYearId);
    next.delete('student');
    next.delete('context');
    next.delete('standard');
    next.delete('evidence');
    next.delete('edit');
    next.delete('assessment');
    next.delete('standardFilter');
    next.delete('session');
    next.delete('order');
    setSearchParams(next, { replace: true });
  }, [requestedSchoolYearId, searchParams, setSearchParams, state]);

  function update(next: URLSearchParams): void {
    setSearchParams(next);
  }

  function selectSchoolYear(schoolYearId: string): void {
    const next = new URLSearchParams(searchParams);
    next.set('schoolYear', schoolYearId);
    const target =
      state.status === 'ready'
        ? state.data.schoolYears.find((schoolYear) => schoolYear.id === schoolYearId)
        : undefined;
    appendLearnerProgressPeriodParams(
      next,
      target ? clampLearnerProgressPeriodToSchoolYear(effectivePeriod, target) : effectivePeriod,
    );
    appendLearnerProgressMode(next, routeState.mode);
    appendLearnerProgressSourceFilters(next, { order: routeState.order });
    appendLearnerProgressEditor(next, null);
    update(next);
  }

  function selectPeriod(period: LearnerProgressPeriodState): void {
    const next = new URLSearchParams(searchParams);
    appendLearnerProgressPeriodParams(next, period);
    next.delete('evidence');
    appendLearnerProgressEditor(next, null);
    update(next);
  }

  function selectMode(mode: LearnerProgressMode): void {
    const next = new URLSearchParams(searchParams);
    appendLearnerProgressMode(next, mode);
    appendLearnerProgressEditor(next, null);
    update(next);
  }

  function selectScope(id?: string): void {
    const next = new URLSearchParams(searchParams);
    appendLearnerProgressMode(next, routeState.mode, id);
    appendLearnerProgressEditor(next, null);
    update(next);
  }

  function selectStatus(status: LearnerProgressStatusFilter): void {
    const next = new URLSearchParams(searchParams);
    appendLearnerProgressFilters(next, status, routeState.kind);
    next.delete('evidence');
    appendLearnerProgressEditor(next, null);
    update(next);
  }

  function selectKind(kind: LearnerProgressKindFilter): void {
    const next = new URLSearchParams(searchParams);
    appendLearnerProgressFilters(next, routeState.status, kind);
    next.delete('evidence');
    appendLearnerProgressEditor(next, null);
    update(next);
  }

  function selectAssessmentFilter(id?: string): void {
    const next = new URLSearchParams(searchParams);
    appendLearnerProgressSourceFilters(next, { ...routeState, assessmentId: id });
    next.delete('evidence');
    appendLearnerProgressEditor(next, null);
    update(next);
  }

  function selectStandardFilter(id?: string): void {
    const next = new URLSearchParams(searchParams);
    appendLearnerProgressSourceFilters(next, { ...routeState, standardFilterId: id });
    next.delete('evidence');
    appendLearnerProgressEditor(next, null);
    update(next);
  }

  function selectSessionFilter(id?: string): void {
    const next = new URLSearchParams(searchParams);
    appendLearnerProgressSourceFilters(next, { ...routeState, sessionId: id });
    next.delete('evidence');
    appendLearnerProgressEditor(next, null);
    update(next);
  }

  function selectOrderFilter(order: LearnerProgressOrder): void {
    const next = new URLSearchParams(searchParams);
    appendLearnerProgressSourceFilters(next, { ...routeState, order });
    update(next);
  }

  function clearSourceFilters(): void {
    const next = new URLSearchParams(searchParams);
    appendLearnerProgressSourceFilters(next, { order: routeState.order });
    next.delete('evidence');
    appendLearnerProgressEditor(next, null);
    update(next);
  }

  function selectEvidence(id?: string): void {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('evidence', id);
    else next.delete('evidence');
    appendLearnerProgressEditor(next, null);
    setMutationError(null);
    setMutationMessage(null);
    update(next);
  }

  function openCreateEvidence(): void {
    const next = new URLSearchParams(searchParams);
    appendLearnerProgressEditor(next, 'new');
    setMutationError(null);
    setMutationMessage(null);
    update(next);
  }

  function openEditEvidence(id: string): void {
    const next = new URLSearchParams(searchParams);
    next.set('evidence', id);
    appendLearnerProgressEditor(next, id);
    setMutationError(null);
    setMutationMessage(null);
    update(next);
  }

  function closeEvidenceEditor(): void {
    const next = new URLSearchParams(searchParams);
    appendLearnerProgressEditor(next, null);
    setMutationError(null);
    update(next);
  }

  function showSavedEvidence(id: string): void {
    const next = new URLSearchParams(searchParams);
    next.set('evidence', id);
    appendLearnerProgressFilters(next, 'all', 'all');
    appendLearnerProgressSourceFilters(next, { order: routeState.order });
    appendLearnerProgressEditor(next, null);
    setMutationError(null);
    setMutationMessage('Evidence saved. Global Undo is available in the top bar.');
    update(next);
  }

  async function changeEvidenceStatus(id: string, action: 'archive' | 'restore'): Promise<void> {
    setMutationError(null);
    setMutationMessage(null);
    try {
      if (action === 'archive') await assessmentEvidenceMutationService.archive(id);
      else await assessmentEvidenceMutationService.restore(id);
      const next = new URLSearchParams(searchParams);
      next.set('evidence', id);
      appendLearnerProgressFilters(next, 'all', routeState.kind);
      appendLearnerProgressEditor(next, null);
      setMutationMessage(
        action === 'archive'
          ? 'Evidence archived. Global Undo is available in the top bar.'
          : 'Evidence restored. Global Undo is available in the top bar.',
      );
      update(next);
    } catch (cause) {
      setMutationError(
        cause instanceof Error ? cause.message : 'Evidence lifecycle could not be updated.',
      );
    }
  }

  if (state.status === 'loading') {
    return (
      <section className={`card ${styles.state}`} role="status" aria-live="polite">
        <h1>Learner Progress</h1>
        <p>Loading source-traceable Assessment Evidence…</p>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section className={`card ${styles.state}`} role="alert">
        <h1>Learner Progress unavailable</h1>
        <p>{state.message}</p>
        <p>
          Classroom did not silently drop malformed Evidence records. Review System Health or the
          source data before trying again.
        </p>
        <div className={styles.actions}>
          <Link className="button" to="/system-health">
            Open System Health
          </Link>
          <Link className="button" to="/export">
            Open Export &amp; Backup
          </Link>
        </div>
      </section>
    );
  }

  if (!state.data.selectedSchoolYear || !state.data.snapshot) {
    return (
      <section className={`card ${styles.state}`} aria-labelledby="learner-progress-no-year">
        <p className="page-eyebrow">Reflect</p>
        <h1 id="learner-progress-no-year">Learner Progress needs a School Year</h1>
        <p>Create a School Year before Classroom can scope learner Evidence by date.</p>
        <div className={styles.actions}>
          <Link className="button button-primary" to="/settings#school-years">
            Manage School Years
          </Link>
        </div>
      </section>
    );
  }

  const resolvedPeriod = resolveLearnerProgressPeriod(
    effectivePeriod,
    state.data.selectedSchoolYear,
    state.data.asOfDate,
  );
  const view = buildLearnerProgressView(state.data.snapshot, {
    mode: routeState.mode,
    selectedId: routeState.selectedId,
    evidenceId: routeState.evidenceId,
    status: routeState.status,
    kind: routeState.kind,
    assessmentId: routeState.assessmentId,
    standardFilterId: routeState.standardFilterId,
    sessionId: routeState.sessionId,
    order: routeState.order,
    period: resolvedPeriod,
  });
  const progressReturn: LearnerProgressReturnState = {
    schoolYearId: view.schoolYear.id,
    mode: routeState.mode,
    selectedId: routeState.selectedId,
    evidenceId: view.selectedEvidence?.id ?? routeState.evidenceId,
    status: routeState.status,
    kind: routeState.kind,
    assessmentId: routeState.assessmentId,
    standardFilterId: routeState.standardFilterId,
    sessionId: routeState.sessionId,
    order: routeState.order,
    period: effectivePeriod,
    parentReview: parentReviewReturn,
    closeoutReturn,
  };
  const editorRecord =
    routeState.editor && routeState.editor !== 'new'
      ? state.data.snapshot.evidence.find((record) => record.id === routeState.editor)
      : undefined;
  const editorDefaults = {
    studentId: routeState.mode === 'learners' ? routeState.selectedId : undefined,
    contextId: routeState.mode === 'contexts' ? routeState.selectedId : undefined,
    sessionOccurrenceId: routeState.sessionId,
    assessmentId: routeState.assessmentId,
    standardId:
      routeState.mode === 'standards' ? routeState.selectedId : routeState.standardFilterId,
    occurredOn:
      state.data.asOfDate >= view.schoolYear.startsOn &&
      state.data.asOfDate <= view.schoolYear.endsOn
        ? state.data.asOfDate
        : view.schoolYear.startsOn,
  };

  return (
    <LearnerProgressDashboard
      schoolYears={state.data.schoolYears}
      view={view}
      period={effectivePeriod}
      resolvedPeriod={resolvedPeriod}
      statusFilter={routeState.status}
      kindFilter={routeState.kind}
      assessmentFilterId={routeState.assessmentId}
      standardFilterId={routeState.standardFilterId}
      sessionFilterId={routeState.sessionId}
      orderFilter={routeState.order}
      onSchoolYearChange={selectSchoolYear}
      onPeriodChange={selectPeriod}
      onModeChange={selectMode}
      onScopeChange={selectScope}
      onStatusFilterChange={selectStatus}
      onKindFilterChange={selectKind}
      onAssessmentFilterChange={selectAssessmentFilter}
      onStandardFilterChange={selectStandardFilter}
      onSessionFilterChange={selectSessionFilter}
      onOrderFilterChange={selectOrderFilter}
      onClearSourceFilters={clearSourceFilters}
      onEvidenceChange={selectEvidence}
      onCreateEvidence={openCreateEvidence}
      onEditEvidence={openEditEvidence}
      onArchiveEvidence={(id) => void changeEvidenceStatus(id, 'archive')}
      onRestoreEvidence={(id) => void changeEvidenceStatus(id, 'restore')}
      decorateSourceHref={(href) => decorateLearnerProgressSourceHref(href, progressReturn)}
      feedbackPanel={
        mutationError || mutationMessage ? (
          <>
            {mutationError ? (
              <section className={`card ${styles.state}`} role="alert">
                <strong>Evidence update failed</strong>
                <p>{mutationError}</p>
              </section>
            ) : null}
            {mutationMessage ? (
              <section className={`card ${styles.state}`} role="status">
                <p>{mutationMessage}</p>
              </section>
            ) : null}
          </>
        ) : null
      }
      editorPanel={
        routeState.editor ? (
          routeState.editor === 'new' || editorRecord ? (
            <AssessmentEvidenceEditorPanel
              key={
                routeState.editor === 'new'
                  ? 'new-evidence'
                  : `${editorRecord!.id}-${editorRecord!.updatedAt}`
              }
              snapshot={state.data.snapshot}
              existing={editorRecord}
              defaults={editorDefaults}
              onSaved={(record) => showSavedEvidence(record.id)}
              onCancel={closeEvidenceEditor}
            />
          ) : (
            <section className={`card ${styles.state}`} role="alert">
              <strong>Evidence record unavailable</strong>
              <p>The requested Evidence record no longer exists.</p>
              <button className="button" type="button" onClick={closeEvidenceEditor}>
                Close editor
              </button>
            </section>
          )
        ) : null
      }
    />
  );
}

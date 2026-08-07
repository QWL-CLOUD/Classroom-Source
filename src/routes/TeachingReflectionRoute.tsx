import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import { classroomDb } from '@/data/db/ClassroomDatabase';
import {
  learnerContextSchema,
  lessonPlanSchema,
  schoolYearSchema,
  sessionOccurrenceSchema,
} from '@/domain/models/entities';
import { parsePlanningReturnTarget } from '@/features/planning/planningNavigation';
import {
  buildTeachingReviewHref,
  parseTeachingReviewReturnState,
} from '@/features/teachingReview/teachingReviewNavigation';
import {
  TeachingReflectionEditor,
  type TeachingReflectionCreateSource,
} from '@/features/teachingReflections/TeachingReflectionEditor';
import { buildTeachingReflectionSessionHref } from '@/features/teachingReflections/teachingReflectionEditorModel';
import {
  teachingReflectionReadService,
  type TeachingReflectionReadService,
} from '@/features/teachingReflections/teachingReflectionReadService';

import styles from './TeachingReflectionRoute.module.css';

type TeachingReflectionRouteSnapshot =
  | {
      kind: 'existing';
      detail: NonNullable<
        Awaited<ReturnType<TeachingReflectionReadService['getSessionReflection']>>
      >;
    }
  | { kind: 'create'; source: TeachingReflectionCreateSource }
  | { kind: 'unavailable'; reason: string; sessionAvailable: boolean };

async function loadCreateSource(
  sessionOccurrenceId: string,
): Promise<TeachingReflectionRouteSnapshot> {
  const sessionRaw = await classroomDb.sessionOccurrences.get(sessionOccurrenceId);
  if (!sessionRaw) {
    return {
      kind: 'unavailable',
      reason: 'The requested Session is unavailable and no retained Teaching Reflection was found.',
      sessionAvailable: false,
    };
  }
  const session = sessionOccurrenceSchema.parse(sessionRaw);
  if (session.deliveryState !== 'completed') {
    return {
      kind: 'unavailable',
      reason: 'A Teaching Reflection can only be added after the Session is marked completed.',
      sessionAvailable: true,
    };
  }

  const [planRaw, contextRaw] = await Promise.all([
    classroomDb.lessonPlans.get(session.lessonPlanId),
    classroomDb.learnerContexts.get(session.contextId),
  ]);
  if (!planRaw || !contextRaw) {
    return {
      kind: 'unavailable',
      reason:
        'The completed Session no longer has the current Lesson Plan and context required to create a Reflection.',
      sessionAvailable: true,
    };
  }
  const lessonPlan = lessonPlanSchema.parse(planRaw);
  const context = learnerContextSchema.parse(contextRaw);
  const schoolYearRaw = await classroomDb.schoolYears.get(context.schoolYearId);
  if (!schoolYearRaw) {
    return {
      kind: 'unavailable',
      reason: 'The Session School Year is unavailable, so a new Reflection cannot be created.',
      sessionAvailable: true,
    };
  }

  return {
    kind: 'create',
    source: {
      sessionOccurrence: session,
      lessonPlan,
      context,
      schoolYear: schoolYearSchema.parse(schoolYearRaw),
    },
  };
}

export function TeachingReflectionRoute() {
  const [searchParams] = useSearchParams();
  const sessionOccurrenceId = searchParams.get('session');
  const returnTo = parsePlanningReturnTarget(searchParams.get('return'));
  const reviewReturn = parseTeachingReviewReturnState(searchParams);

  const snapshot = useLiveQuery(async (): Promise<TeachingReflectionRouteSnapshot | null> => {
    if (!sessionOccurrenceId) return null;
    const detail = await teachingReflectionReadService.getSessionReflection(sessionOccurrenceId);
    if (detail) return { kind: 'existing', detail };
    return loadCreateSource(sessionOccurrenceId);
  }, [sessionOccurrenceId]);

  if (!sessionOccurrenceId) {
    return (
      <section className={`card ${styles.statePanel}`} role="alert">
        <h1>Teaching Reflection unavailable</h1>
        <p>Open a completed Session before adding or viewing a Teaching Reflection.</p>
        <a className="button" href="#/learners">
          <ArrowLeft aria-hidden="true" size={17} /> Back to Learners
        </a>
      </section>
    );
  }

  if (snapshot === undefined) {
    return (
      <div className={`card ${styles.statePanel}`} role="status">
        Loading Teaching Reflection…
      </div>
    );
  }

  if (!snapshot || snapshot.kind === 'unavailable') {
    return (
      <section className={`card ${styles.statePanel}`} role="alert">
        <h1>Teaching Reflection unavailable</h1>
        <p>{snapshot?.reason ?? 'The requested Teaching Reflection could not be loaded.'}</p>
        {snapshot?.sessionAvailable ? (
          <a
            className="button"
            href={buildTeachingReflectionSessionHref(
              sessionOccurrenceId,
              returnTo,
              reviewReturn ?? undefined,
            )}
          >
            <ArrowLeft aria-hidden="true" size={17} /> Back to Session
          </a>
        ) : returnTo === 'review' ? (
          <a className="button" href={buildTeachingReviewHref(reviewReturn ?? {})}>
            <ArrowLeft aria-hidden="true" size={17} /> Back to Teaching Review
          </a>
        ) : (
          <a className="button" href="#/insights">
            <ArrowLeft aria-hidden="true" size={17} /> Back to Teaching Insights
          </a>
        )}
      </section>
    );
  }

  return (
    <section className="page">
      <TeachingReflectionEditor
        key={
          snapshot.kind === 'existing'
            ? `${snapshot.detail.reflection.id}-${snapshot.detail.reflection.updatedAt}`
            : `new-${snapshot.source.sessionOccurrence.id}`
        }
        sessionOccurrenceId={sessionOccurrenceId}
        returnTo={returnTo}
        reviewReturn={reviewReturn ?? undefined}
        detail={snapshot.kind === 'existing' ? snapshot.detail : undefined}
        createSource={snapshot.kind === 'create' ? snapshot.source : undefined}
      />
    </section>
  );
}

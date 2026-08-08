import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  learnerContextSchema,
  lessonPlanSchema,
  schoolYearSchema,
  sessionOccurrenceSchema,
  teachingReflectionRecordSchema,
} from '@/domain/models/entities';

import { TeachingReflectionEditor } from './TeachingReflectionEditor';
import type { TeachingReflectionDetailReadModel } from './teachingReflectionReadModel';

const schoolYear = schoolYearSchema.parse({
  id: 'school-year',
  label: '2026–2027',
  startsOn: '2026-07-01',
  endsOn: '2027-06-30',
  active: true,
  lifecycleState: 'active',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
});

const context = learnerContextSchema.parse({
  id: 'context',
  schoolYearId: schoolYear.id,
  kind: 'class',
  name: 'Grade 4 Math',
  status: 'active',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
});

const plan = lessonPlanSchema.parse({
  id: 'plan',
  contextId: context.id,
  title: 'Fraction strategies',
  subject: 'Mathematics',
  workflowState: 'ready',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
});

const session = sessionOccurrenceSchema.parse({
  id: 'session',
  lessonPlanId: plan.id,
  contextId: context.id,
  date: '2026-08-05',
  startMinute: 540,
  endMinute: 600,
  deliveryState: 'completed',
  completedAt: '2026-08-05T15:00:00.000Z',
  reflectionId: 'reflection',
});

const reflection = teachingReflectionRecordSchema.parse({
  id: 'reflection',
  sessionOccurrenceId: session.id,
  schoolYearId: schoolYear.id,
  contextId: context.id,
  lessonPlanId: plan.id,
  occurredOn: session.date,
  whatWorked: 'Students explained their strategy.',
  sourceSnapshots: {
    context: { kind: context.kind, name: context.name },
    lessonPlan: { title: plan.title },
    sessionOccurrence: {
      date: session.date,
      startMinute: session.startMinute,
      endMinute: session.endMinute,
    },
  },
  status: 'active',
  createdAt: '2026-08-05T15:00:00.000Z',
  updatedAt: '2026-08-05T15:00:00.000Z',
});

function detail(
  overrides: Partial<TeachingReflectionDetailReadModel> = {},
): TeachingReflectionDetailReadModel {
  return {
    reflection,
    source: {
      schoolYear: { state: 'available', current: schoolYear },
      context: {
        state: 'available',
        snapshot: reflection.sourceSnapshots.context,
        current: context,
      },
      lessonPlan: {
        state: 'available',
        snapshot: reflection.sourceSnapshots.lessonPlan,
        current: plan,
      },
      sessionOccurrence: {
        state: 'completed',
        linkState: 'linked',
        snapshot: reflection.sourceSnapshots.sessionOccurrence,
        current: session,
      },
      warnings: [],
    },
    relatedEvidence: {
      records: [],
      items: [],
      activeCount: 0,
      archivedCount: 0,
      countsByKind: { score: 0, proficiency: 0, observation: 0 },
    },
    nextSteps: {
      tasks: [],
      countsByStatus: { active: 0, waiting: 0, completed: 0, cancelled: 0 },
      openCount: 0,
      closedCount: 0,
    },
    ...overrides,
  };
}

describe('TeachingReflectionEditor', () => {
  it('creates a Reflection for a completed Session', async () => {
    const created = teachingReflectionRecordSchema.parse({
      ...reflection,
      id: 'created-reflection',
    });
    const create = vi.fn().mockResolvedValue(created);

    render(
      <TeachingReflectionEditor
        sessionOccurrenceId={session.id}
        returnTo="week"
        createSource={{ schoolYear, context, lessonPlan: plan, sessionOccurrence: session }}
        service={{
          create,
          update: vi.fn(),
          archive: vi.fn(),
          restore: vi.fn(),
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText('What worked?'), {
      target: { value: '  Students used the visual model.  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add reflection' }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(session.id, {
        whatWorked: 'Students used the visual model.',
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Teaching Reflection added.');
    expect(screen.getByRole('link', { name: 'Session Evidence' }).getAttribute('href')).toContain(
      'closeoutSource=reflection',
    );
    expect(screen.getByRole('link', { name: 'Return to Week' }).getAttribute('href')).toContain(
      '#/week?',
    );
    expect(screen.getByRole('link', { name: 'Back to Session' })).toHaveAttribute(
      'href',
      '#/planning/session?session=session&return=week',
    );
  });

  it('updates an active Reflection without changing its source facts', async () => {
    const updated = teachingReflectionRecordSchema.parse({
      ...reflection,
      whatWorked: 'Students compared two strategies.',
      updatedAt: '2026-08-05T16:00:00.000Z',
    });
    const update = vi.fn().mockResolvedValue(updated);

    render(
      <TeachingReflectionEditor
        sessionOccurrenceId={session.id}
        returnTo="learners"
        detail={detail()}
        service={{
          create: vi.fn(),
          update,
          archive: vi.fn(),
          restore: vi.fn(),
        }}
      />,
    );

    expect(screen.getByLabelText('What worked?')).toHaveValue('Students explained their strategy.');
    fireEvent.change(screen.getByLabelText('What worked?'), {
      target: { value: 'Students compared two strategies.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save reflection' }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(reflection.id, {
        whatWorked: 'Students compared two strategies.',
      }),
    );
  });

  it('keeps archived Reflection fields read-only and restores through the action menu', async () => {
    const archived = teachingReflectionRecordSchema.parse({
      ...reflection,
      status: 'archived',
      archivedAt: '2026-08-06T00:00:00.000Z',
      updatedAt: '2026-08-06T00:00:00.000Z',
    });
    const restored = teachingReflectionRecordSchema.parse({
      ...reflection,
      updatedAt: '2026-08-06T01:00:00.000Z',
    });
    const restore = vi.fn().mockResolvedValue(restored);

    render(
      <TeachingReflectionEditor
        sessionOccurrenceId={session.id}
        returnTo="today"
        detail={detail({ reflection: archived })}
        service={{
          create: vi.fn(),
          update: vi.fn(),
          archive: vi.fn(),
          restore,
        }}
      />,
    );

    expect(screen.getByLabelText('What worked?')).toBeDisabled();
    fireEvent.click(screen.getByText('More'));
    fireEvent.click(screen.getByRole('button', { name: 'Restore reflection' }));
    await waitFor(() => expect(restore).toHaveBeenCalledWith(reflection.id));
  });

  it('surfaces source warnings and linked-record counts without unsupported inference', () => {
    render(
      <TeachingReflectionEditor
        sessionOccurrenceId={session.id}
        returnTo="calendar"
        detail={detail({
          source: {
            ...detail().source,
            sessionOccurrence: {
              ...detail().source.sessionOccurrence,
              state: 'reopened',
            },
            warnings: ['session-reopened', 'lesson-plan-source-unavailable'],
          },
          relatedEvidence: {
            ...detail().relatedEvidence,
            activeCount: 2,
            archivedCount: 1,
            records: [
              {} as TeachingReflectionDetailReadModel['relatedEvidence']['records'][number],
              {} as TeachingReflectionDetailReadModel['relatedEvidence']['records'][number],
              {} as TeachingReflectionDetailReadModel['relatedEvidence']['records'][number],
            ],
          },
          nextSteps: {
            ...detail().nextSteps,
            openCount: 2,
            closedCount: 1,
          },
        })}
        service={{
          create: vi.fn(),
          update: vi.fn(),
          archive: vi.fn(),
          restore: vi.fn(),
        }}
      />,
    );

    expect(screen.getByText(/currently reopened/)).toBeVisible();
    expect(screen.getByText(/saved plan snapshot/)).toBeVisible();
    expect(screen.getByText(/does not score teaching quality/)).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Assessment Evidence' }).closest('section'),
    ).toHaveTextContent('3');
    expect(
      screen.getByRole('heading', { name: 'Next Step Tasks' }).closest('section'),
    ).toHaveTextContent('2 open');
  });
});

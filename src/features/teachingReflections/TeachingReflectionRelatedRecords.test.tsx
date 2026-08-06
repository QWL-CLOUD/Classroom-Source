import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  assessmentEvidenceRecordSchema,
  learnerContextSchema,
  lessonPlanSchema,
  schoolYearSchema,
  sessionOccurrenceSchema,
  studentRecordSchema,
  taskSchema,
  teachingReflectionRecordSchema,
} from '@/domain/models/entities';

import { TeachingReflectionRelatedRecords } from './TeachingReflectionRelatedRecords';
import type { TeachingReflectionDetailReadModel } from './teachingReflectionReadModel';

const now = '2026-08-06T12:00:00.000Z';

const schoolYear = schoolYearSchema.parse({
  id: 'year',
  label: '2026–2027',
  startsOn: '2026-07-01',
  endsOn: '2027-06-30',
  active: true,
  lifecycleState: 'active',
  createdAt: now,
  updatedAt: now,
});

const context = learnerContextSchema.parse({
  id: 'context',
  schoolYearId: schoolYear.id,
  kind: 'class',
  name: 'Grade 4 Math',
  status: 'active',
  createdAt: now,
  updatedAt: now,
});

const plan = lessonPlanSchema.parse({
  id: 'plan',
  contextId: context.id,
  title: 'Fraction strategies',
  subject: 'Mathematics',
  workflowState: 'ready',
  createdAt: now,
  updatedAt: now,
});

const session = sessionOccurrenceSchema.parse({
  id: 'session',
  lessonPlanId: plan.id,
  contextId: context.id,
  date: '2026-08-05',
  startMinute: 540,
  endMinute: 600,
  deliveryState: 'completed',
  completedAt: now,
  reflectionId: 'reflection',
});

const reflection = teachingReflectionRecordSchema.parse({
  id: 'reflection',
  sessionOccurrenceId: session.id,
  schoolYearId: schoolYear.id,
  contextId: context.id,
  lessonPlanId: plan.id,
  occurredOn: session.date,
  whatWorked: 'Students compared strategies.',
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
  createdAt: now,
  updatedAt: now,
});

const student = studentRecordSchema.parse({
  id: 'student',
  name: 'Ari Chen',
  preferredName: 'Ari',
  status: 'active',
  createdAt: now,
  updatedAt: now,
});

const evidence = assessmentEvidenceRecordSchema.parse({
  id: 'evidence',
  studentId: student.id,
  schoolYearId: schoolYear.id,
  occurredOn: session.date,
  title: 'Exit ticket',
  kind: 'score',
  score: { value: 3, maximum: 4 },
  sessionOccurrenceId: session.id,
  standardIds: ['standard-1'],
  status: 'active',
  createdAt: now,
  updatedAt: now,
});

const activeTask = taskSchema.parse({
  id: 'task-active',
  title: 'Prepare a visual model',
  notes: 'Use fraction strips.',
  scheduledDate: '2026-08-07',
  dueDate: '2026-08-08',
  contextId: context.id,
  linkedEntityType: 'teaching-reflection',
  linkedEntityId: reflection.id,
  status: 'active',
  order: 1,
  createdAt: now,
  updatedAt: now,
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
      records: [evidence],
      items: [{ record: evidence, student }],
      activeCount: 1,
      archivedCount: 0,
      countsByKind: { score: 1, proficiency: 0, observation: 0 },
    },
    nextSteps: {
      tasks: [activeTask],
      countsByStatus: { active: 1, waiting: 0, completed: 0, cancelled: 0 },
      openCount: 1,
      closedCount: 0,
    },
    ...overrides,
  };
}

function actions() {
  return {
    create: vi.fn(),
    complete: vi.fn(),
    wait: vi.fn(),
    cancel: vi.fn(),
    restore: vi.fn(),
    reopen: vi.fn(),
  };
}

describe('TeachingReflectionRelatedRecords', () => {
  it('presents learner-specific Evidence without treating it as Reflection narrative', () => {
    render(<TeachingReflectionRelatedRecords detail={detail()} actions={actions()} />);

    expect(screen.getByRole('heading', { name: 'Assessment Evidence' })).toBeVisible();
    expect(screen.getByText('Exit ticket')).toBeVisible();
    expect(screen.getByText('3 / 4')).toBeVisible();
    expect(screen.getByText('Ari')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open learner record' })).toHaveAttribute(
      'href',
      '#/learners?directory=students&student=student',
    );
  });

  it('creates a context-locked Next Step with scheduled and due values', async () => {
    const nextStepActions = actions();
    nextStepActions.create.mockResolvedValue(activeTask);
    render(<TeachingReflectionRelatedRecords detail={detail()} actions={nextStepActions} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Next Step' }));
    fireEvent.change(screen.getByLabelText('Next Step title'), {
      target: { value: 'Prepare comparison cards' },
    });
    fireEvent.change(screen.getByLabelText('Notes'), {
      target: { value: 'Print two sets.' },
    });
    const dateFields = screen.getAllByLabelText('Date');
    const timeFields = screen.getAllByLabelText('Time');
    fireEvent.change(dateFields[0]!, { target: { value: '2026-08-10' } });
    fireEvent.change(timeFields[0]!, { target: { value: '15:30' } });
    fireEvent.change(dateFields[1]!, { target: { value: '2026-08-11' } });
    fireEvent.change(timeFields[1]!, { target: { value: '09:15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Next Step' }));

    await waitFor(() =>
      expect(nextStepActions.create).toHaveBeenCalledWith(reflection.id, {
        title: 'Prepare comparison cards',
        notes: 'Print two sets.',
        scheduledDate: '2026-08-10',
        scheduledMinute: 930,
        dueDate: '2026-08-11',
        dueMinute: 555,
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Next Step added.');
  });

  it('uses the existing Task lifecycle for linked Next Steps', async () => {
    const nextStepActions = actions();
    nextStepActions.complete.mockResolvedValue({ ...activeTask, status: 'completed' });
    render(<TeachingReflectionRelatedRecords detail={detail()} actions={nextStepActions} />);

    fireEvent.click(screen.getByRole('button', { name: 'Complete' }));
    await waitFor(() => expect(nextStepActions.complete).toHaveBeenCalledWith(activeTask.id));
    expect(screen.getByRole('status')).toHaveTextContent('Next Step completed.');
  });

  it('keeps existing Tasks visible but blocks creation for archived Reflections', () => {
    const archived = teachingReflectionRecordSchema.parse({
      ...reflection,
      status: 'archived',
      archivedAt: now,
    });
    render(
      <TeachingReflectionRelatedRecords
        detail={detail({ reflection: archived })}
        actions={actions()}
      />,
    );

    expect(screen.getByText('Prepare a visual model')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add Next Step' })).toBeDisabled();
    expect(screen.getByText(/Restore this Reflection/)).toBeVisible();
  });
});

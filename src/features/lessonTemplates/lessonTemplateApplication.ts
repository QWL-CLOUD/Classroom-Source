import {
  lessonTemplateApplicationSchema,
  lessonTemplateSchema,
  type LessonTemplate,
  type LessonTemplateApplication,
} from '@/domain/models/entities';
import type {
  LessonFlowStepEditorValues,
  LessonPlanEditorValues,
} from '@/features/planning/planningEditorModel';

export interface LessonTemplateApplicationDependencies {
  createId?: () => string;
  now?: () => string;
}

function copyStep(
  step: LessonTemplate['lessonFlow'][number],
  createId: () => string,
): LessonFlowStepEditorValues {
  return {
    id: createId(),
    title: step.title,
    phase: step.phase,
    durationMinutes: step.durationMinutes?.toString() ?? '',
    details: step.details ?? '',
    teacherNotes: step.teacherNotes ?? '',
    libraryLinks: (step.libraryLinks ?? []).map((link) => ({
      ...link,
      snapshot: link.snapshot
        ? {
            ...link.snapshot,
            typedFields: link.snapshot.typedFields ? { ...link.snapshot.typedFields } : undefined,
          }
        : undefined,
    })),
  };
}

export function createLessonTemplateApplication(
  template: LessonTemplate,
  now: string,
): LessonTemplateApplication {
  const parsed = lessonTemplateSchema.parse(template);
  return lessonTemplateApplicationSchema.parse({
    templateId: parsed.id,
    templateTitle: parsed.title,
    sourceUpdatedAt: parsed.updatedAt,
    appliedAt: now,
  });
}

export function applyLessonTemplateToPlanEditorValues(
  current: LessonPlanEditorValues,
  template: LessonTemplate,
  dependencies: LessonTemplateApplicationDependencies = {},
): LessonPlanEditorValues {
  const parsed = lessonTemplateSchema.parse(template);
  if (parsed.status !== 'active') {
    throw new Error('Restore this lesson template before applying it to a plan.');
  }
  const createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
  const now = dependencies.now?.() ?? new Date().toISOString();

  return {
    ...current,
    title: parsed.defaultPlanTitle ?? current.title,
    subject: parsed.subject ?? '',
    durationMinutes: parsed.durationMinutes?.toString() ?? '',
    learningTarget: parsed.learningTarget ?? '',
    notes: parsed.notes ?? '',
    libraryLinks: (parsed.libraryLinks ?? []).map((link) => ({
      ...link,
      snapshot: link.snapshot
        ? {
            ...link.snapshot,
            typedFields: link.snapshot.typedFields ? { ...link.snapshot.typedFields } : undefined,
          }
        : undefined,
    })),
    lessonFlow: parsed.lessonFlow.map((step) => copyStep(step, createId)),
    templateApplication: createLessonTemplateApplication(parsed, now),
  };
}

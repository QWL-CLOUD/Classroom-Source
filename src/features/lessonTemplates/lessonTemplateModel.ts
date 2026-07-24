import { z } from 'zod';

import { lessonTemplateSchema, type LessonTemplate } from '@/domain/models/entities';
import {
  createLessonContentEditorValues,
  lessonContentEditorValuesSchema,
  parseLessonContentEditorValues,
  type LessonContentEditorValues,
} from '@/features/planning/planningEditorModel';

export interface LessonTemplateEditorValues extends LessonContentEditorValues {
  title: string;
  description: string;
  defaultPlanTitle: string;
  subject: string;
  durationMinutes: string;
}

const optionalDurationSchema = z.string().refine((value) => {
  if (!value.trim()) return true;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 1440;
}, 'Duration must be a whole number between 1 and 1440.');

export const lessonTemplateEditorValuesSchema = lessonContentEditorValuesSchema.extend({
  title: z.string().trim().min(1, 'Enter a template title.').max(240),
  description: z.string().max(5000),
  defaultPlanTitle: z.string().max(240),
  subject: z.string().max(240),
  durationMinutes: optionalDurationSchema,
});

export type LessonTemplateEditableFields = Pick<
  LessonTemplate,
  | 'title'
  | 'description'
  | 'defaultPlanTitle'
  | 'subject'
  | 'durationMinutes'
  | 'learningTarget'
  | 'notes'
  | 'libraryLinks'
  | 'lessonFlow'
>;

export function createLessonTemplateEditorValues(
  template?: Partial<LessonTemplate>,
): LessonTemplateEditorValues {
  return {
    title: template?.title ?? '',
    description: template?.description ?? '',
    defaultPlanTitle: template?.defaultPlanTitle ?? '',
    subject: template?.subject ?? '',
    durationMinutes: template?.durationMinutes?.toString() ?? '',
    ...createLessonContentEditorValues(template),
  };
}

export function toLessonTemplateEditorValues(template: LessonTemplate): LessonTemplateEditorValues {
  const parsed = lessonTemplateSchema.parse(template);
  return createLessonTemplateEditorValues(parsed);
}

export function parseLessonTemplateEditorValues(
  input: LessonTemplateEditorValues,
): LessonTemplateEditableFields {
  const values = lessonTemplateEditorValuesSchema.parse(input);
  const content = parseLessonContentEditorValues(values);
  return {
    title: values.title.trim(),
    description: values.description.trim() || undefined,
    defaultPlanTitle: values.defaultPlanTitle.trim() || undefined,
    subject: values.subject.trim() || undefined,
    durationMinutes: values.durationMinutes ? Number(values.durationMinutes) : undefined,
    ...content,
  };
}

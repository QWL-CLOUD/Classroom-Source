import type {
  CategoryAssignment,
  CategoryValue,
  LessonTemplate,
  LessonTemplateStatus,
} from '@/domain/models/entities';

export const lessonTemplateStatusLabels: Record<LessonTemplateStatus, string> = {
  active: 'Active',
  archived: 'Archived',
};

export interface LessonTemplateView extends LessonTemplate {
  templateFormatId?: string;
  templateFormatLabel?: string;
  focusLabels: string[];
  purposeLabels: string[];
  themeLabels: string[];
}

export interface LessonTemplateFilters {
  query: string;
  status: 'all' | LessonTemplateStatus;
  templateFormatId: string;
}

export function buildLessonTemplateViews(
  templates: readonly LessonTemplate[],
  assignments: readonly CategoryAssignment[],
  categoryValues: readonly CategoryValue[],
): LessonTemplateView[] {
  const valueById = new Map(categoryValues.map((value) => [value.id, value] as const));
  const assignmentsByTemplate = new Map<string, CategoryAssignment[]>();
  for (const assignment of assignments) {
    if (assignment.entityType !== 'lesson-template') continue;
    const group = assignmentsByTemplate.get(assignment.entityId) ?? [];
    group.push(assignment);
    assignmentsByTemplate.set(assignment.entityId, group);
  }

  return templates.map((template) => {
    const templateAssignments = assignmentsByTemplate.get(template.id) ?? [];
    const labelsFor = (familyId: CategoryAssignment['familyId']) =>
      templateAssignments
        .filter((assignment) => assignment.familyId === familyId)
        .map((assignment) => valueById.get(assignment.categoryValueId)?.name)
        .filter((value): value is string => Boolean(value))
        .sort((first, second) => first.localeCompare(second, 'en', { sensitivity: 'base' }));
    const formatAssignment = templateAssignments.find(
      (assignment) => assignment.familyId === 'template-format',
    );
    const formatValue = formatAssignment
      ? valueById.get(formatAssignment.categoryValueId)
      : undefined;

    return {
      ...template,
      templateFormatId: formatValue?.id,
      templateFormatLabel: formatValue?.name,
      focusLabels: labelsFor('focus-tag'),
      purposeLabels: labelsFor('purpose-tag'),
      themeLabels: labelsFor('theme-tag'),
    };
  });
}

function searchableText(template: LessonTemplateView): string {
  return [
    template.title,
    template.description ?? '',
    template.defaultPlanTitle ?? '',
    template.subject ?? '',
    template.learningTarget ?? '',
    template.notes ?? '',
    template.lessonFlow.map((step) => `${step.title} ${step.details ?? ''}`).join(' '),
    template.templateFormatLabel ?? '',
    template.focusLabels.join(' '),
    template.purposeLabels.join(' '),
    template.themeLabels.join(' '),
  ]
    .join(' ')
    .toLocaleLowerCase('en');
}

export function filterLessonTemplates(
  templates: readonly LessonTemplateView[],
  filters: LessonTemplateFilters,
): LessonTemplateView[] {
  const query = filters.query.trim().toLocaleLowerCase('en');
  return templates
    .filter((template) => {
      if (filters.status !== 'all' && template.status !== filters.status) return false;
      if (filters.templateFormatId && template.templateFormatId !== filters.templateFormatId) {
        return false;
      }
      return !query || searchableText(template).includes(query);
    })
    .sort(
      (first, second) =>
        (first.status === second.status ? 0 : first.status === 'active' ? -1 : 1) ||
        second.updatedAt.localeCompare(first.updatedAt) ||
        first.title.localeCompare(second.title, 'en', { sensitivity: 'base' }) ||
        first.id.localeCompare(second.id),
    );
}

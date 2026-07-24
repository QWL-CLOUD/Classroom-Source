import {
  categoryAssignableEntityTypeSchema,
  categoryFamilyIdSchema,
  type CategoryAssignableEntityType,
  type CategoryFamilyId,
} from '@/domain/models/entities';

export type CategorySelectionMode = 'single' | 'multiple';

export interface CategoryFamilyDefinition {
  id: CategoryFamilyId;
  label: string;
  description: string;
  selectionMode: CategorySelectionMode;
  entityTypes: readonly CategoryAssignableEntityType[];
  assignmentAvailability: 'current' | 'future';
}

export const CATEGORY_FAMILIES = [
  {
    id: 'template-format',
    label: 'Template Formats',
    description: 'Reusable structures for lesson templates.',
    selectionMode: 'single',
    entityTypes: ['lesson-template'],
    assignmentAvailability: 'current',
  },
  {
    id: 'focus-tag',
    label: 'Focus Tags',
    description: 'Instructional skills, language domains, or learning priorities.',
    selectionMode: 'multiple',
    entityTypes: ['lesson-plan', 'lesson-template'],
    assignmentAvailability: 'current',
  },
  {
    id: 'purpose-tag',
    label: 'Purpose Tags',
    description: 'The teaching purpose or intended use of a plan.',
    selectionMode: 'multiple',
    entityTypes: ['lesson-plan', 'lesson-template'],
    assignmentAvailability: 'current',
  },
  {
    id: 'theme-tag',
    label: 'Theme Tags',
    description: 'Topics, units, or recurring curricular themes.',
    selectionMode: 'multiple',
    entityTypes: ['lesson-plan', 'lesson-template'],
    assignmentAvailability: 'current',
  },
  {
    id: 'resource-format',
    label: 'Resource Formats',
    description: 'Stable format vocabulary for Library resources.',
    selectionMode: 'single',
    entityTypes: ['library-item'],
    assignmentAvailability: 'current',
  },
  {
    id: 'task-label',
    label: 'Task Labels',
    description: 'Reusable labels for organizing shared Task records.',
    selectionMode: 'multiple',
    entityTypes: ['task'],
    assignmentAvailability: 'current',
  },
  {
    id: 'support-area',
    label: 'Support Areas',
    description: 'Learner support, service, or notice areas.',
    selectionMode: 'multiple',
    entityTypes: ['learner-notice'],
    assignmentAvailability: 'current',
  },
] as const satisfies readonly CategoryFamilyDefinition[];

const familyById = new Map<CategoryFamilyId, CategoryFamilyDefinition>(
  CATEGORY_FAMILIES.map((family): [CategoryFamilyId, CategoryFamilyDefinition] => [
    categoryFamilyIdSchema.parse(family.id),
    family,
  ]),
);

export function getCategoryFamily(familyId: CategoryFamilyId): CategoryFamilyDefinition {
  const family = familyById.get(categoryFamilyIdSchema.parse(familyId));
  if (!family) throw new Error(`Unknown category family: ${familyId}`);
  return family;
}

export function categoryFamilySupportsEntity(
  familyId: CategoryFamilyId,
  entityType: CategoryAssignableEntityType,
): boolean {
  const parsedEntityType = categoryAssignableEntityTypeSchema.parse(entityType);
  return getCategoryFamily(familyId).entityTypes.includes(parsedEntityType);
}

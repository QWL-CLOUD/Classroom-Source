export interface StandardFrameworkIdentityInput {
  issuingOrganization: string;
  frameworkTitle: string;
  jurisdiction?: string;
  version?: string;
}

function normalizeIdentityPart(value: string | undefined): string {
  return (value ?? '').trim().normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase('en');
}

export function buildStandardFrameworkKey(input: StandardFrameworkIdentityInput): string {
  return [
    normalizeIdentityPart(input.issuingOrganization),
    normalizeIdentityPart(input.frameworkTitle),
    normalizeIdentityPart(input.jurisdiction),
    normalizeIdentityPart(input.version),
  ].join('|');
}

export function normalizeStandardCode(code: string): string {
  return code.trim().normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase('en');
}

export function buildStandardAlignmentScopeKey(input: {
  targetType: 'lesson-plan' | 'lesson-template';
  targetId: string;
  lessonFlowStepId?: string;
}): string {
  return input.lessonFlowStepId
    ? `${input.targetType}:${input.targetId}:step:${input.lessonFlowStepId}`
    : `${input.targetType}:${input.targetId}:root`;
}

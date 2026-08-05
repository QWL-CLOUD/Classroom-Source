import { importTypes, type ImportType } from './importTypes';

export interface ImportRouteState {
  importType?: ImportType;
  contextId?: string;
  issue?: string;
}

const importTypeSet = new Set<string>(importTypes);

function isImportType(value: string): value is ImportType {
  return importTypeSet.has(value);
}

export function parseImportRouteState(search: URLSearchParams): ImportRouteState {
  const typeValues = search.getAll('type').filter(Boolean);
  if (typeValues.length > 1) {
    return { issue: 'Choose one import type at a time.' };
  }

  const typeValue = typeValues[0];
  if (!typeValue) {
    return search.has('context')
      ? { issue: 'Choose Roster import before selecting a target context.' }
      : {};
  }
  if (!isImportType(typeValue)) {
    return { issue: `“${typeValue}” is not a supported import type.` };
  }

  const contextValues = search.getAll('context').filter(Boolean);
  if (contextValues.length > 1) {
    return { importType: typeValue, issue: 'Choose one roster target context at a time.' };
  }
  const contextId = contextValues[0]?.trim() || undefined;
  if (contextId && typeValue !== 'roster') {
    return {
      importType: typeValue,
      issue: 'Only Roster import accepts a target Class or Group context.',
    };
  }

  return { importType: typeValue, contextId };
}

export function buildImportCenterHref(importType?: ImportType, contextId?: string): string {
  if (!importType) return '/import';
  const parameters = new URLSearchParams({ type: importType });
  if (importType === 'roster' && contextId?.trim()) {
    parameters.set('context', contextId.trim());
  }
  return `/import?${parameters.toString()}`;
}

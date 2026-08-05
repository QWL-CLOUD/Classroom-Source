import { Link } from 'react-router-dom';

import type { CategoryValue } from '@/domain/models/entities';

import styles from './ImportCenterShared.module.css';

import type {
  ImportClassificationMappingPersistenceDecision,
  ImportClassificationMappingPersistenceDecisions,
} from './importClassificationMappingPresetPlan';
import type {
  ImportClassificationDecision,
  ImportClassificationDecisions,
  ImportClassificationReview as ImportClassificationReviewRecord,
} from './importClassificationResolution';

export interface ImportClassificationReviewProps {
  reviews: readonly ImportClassificationReviewRecord[];
  decisions: ImportClassificationDecisions;
  mappingPersistenceDecisions: ImportClassificationMappingPersistenceDecisions;
  categoryValues: readonly CategoryValue[];
  disabled?: boolean;
  onDecision: (reviewKey: string, decision: ImportClassificationDecision | undefined) => void;
  onMappingPersistenceDecision: (
    reviewKey: string,
    decision: ImportClassificationMappingPersistenceDecision | undefined,
  ) => void;
}

function encodeImportClassificationDecision(
  decision: ImportClassificationDecision | undefined,
): string {
  if (!decision) return '';
  if (
    decision.action === 'create' ||
    decision.action === 'generic-tag' ||
    decision.action === 'ignore'
  ) {
    return decision.action;
  }
  return `${decision.action}:${decision.categoryValueId}`;
}

function decodeImportClassificationDecision(
  value: string,
): ImportClassificationDecision | undefined {
  if (!value) return undefined;
  if (value === 'create' || value === 'generic-tag' || value === 'ignore') {
    return { action: value };
  }
  const separator = value.indexOf(':');
  if (separator < 0) return undefined;
  const action = value.slice(0, separator);
  const categoryValueId = value.slice(separator + 1);
  if (action === 'use' || action === 'restore') return { action, categoryValueId };
  return undefined;
}

function reviewExplanation(review: ImportClassificationReviewRecord): string {
  if (review.kind === 'mapping') {
    if (review.mappingIssue === 'inactive') {
      return 'A saved import mapping exists, but it is inactive.';
    }
    if (review.mappingIssue === 'target-archived') {
      return `The saved mapping targets archived value “${review.mappingTarget?.name ?? 'Unknown'}”.`;
    }
    if (review.mappingIssue === 'target-merged') {
      return review.replacementValue
        ? `The saved mapping target was merged into “${review.replacementValue.name}”.`
        : 'The saved mapping target is merged without an active replacement.';
    }
    if (review.mappingIssue === 'target-missing') {
      return 'The saved mapping target is missing.';
    }
    if (review.mappingIssue === 'wrong-family') {
      return 'The saved mapping target belongs to another classification family.';
    }
    return 'Multiple saved mappings match this imported value.';
  }
  if (review.kind === 'unknown') return 'No controlled value was found.';
  if (review.kind === 'archived') {
    return `Matches archived value “${review.matchedValue?.name ?? review.displayValue}”.`;
  }
  if (review.kind === 'merged') {
    return review.replacementValue
      ? `Merged into “${review.replacementValue.name}”.`
      : 'Matches merged history without an active replacement.';
  }
  return 'Matches multiple controlled values and cannot be resolved automatically.';
}

function selectedTarget(
  decision: ImportClassificationDecision | undefined,
  categoryValues: readonly CategoryValue[],
): CategoryValue | undefined {
  if (!decision || (decision.action !== 'use' && decision.action !== 'restore')) {
    return undefined;
  }
  return categoryValues.find((value) => value.id === decision.categoryValueId);
}

export function ImportClassificationReview({
  reviews,
  decisions,
  mappingPersistenceDecisions,
  categoryValues,
  disabled = false,
  onDecision,
  onMappingPersistenceDecision,
}: ImportClassificationReviewProps) {
  return (
    <>
      {reviews.map((review) => {
        const activeValues = categoryValues
          .filter(
            (value) => value.familyId === review.familyId && value.lifecycleState === 'active',
          )
          .sort(
            (first, second) =>
              first.sortOrder - second.sortOrder ||
              first.name.localeCompare(second.name) ||
              first.id.localeCompare(second.id),
          );
        const matchedArchived = review.matches.filter(
          (value) => value.familyId === review.familyId && value.lifecycleState === 'archived',
        );
        const resolutionDecision = decisions[review.key];
        const target = selectedTarget(resolutionDecision, categoryValues);
        const existingMappings = review.mappingPresets ?? [];
        const canSave =
          review.kind === 'unknown' &&
          existingMappings.length === 0 &&
          resolutionDecision?.action === 'use' &&
          target?.familyId === review.familyId &&
          target.lifecycleState === 'active';
        const canUpdate =
          existingMappings.length === 1 &&
          (resolutionDecision?.action === 'use' || resolutionDecision?.action === 'restore') &&
          target?.familyId === review.familyId;
        const persistenceDecision = mappingPersistenceDecisions[review.key];

        return (
          <div key={review.key} className={styles.classificationReview}>
            <label>
              <span>
                {review.fieldLabel}: “{review.displayValue}”
                <small>{reviewExplanation(review)}</small>
              </span>
              <select
                aria-label={`${review.fieldLabel} resolution for ${review.displayValue}`}
                value={encodeImportClassificationDecision(resolutionDecision)}
                disabled={disabled}
                onChange={(event) => {
                  onDecision(review.key, decodeImportClassificationDecision(event.target.value));
                  onMappingPersistenceDecision(review.key, undefined);
                }}
              >
                <option value="">Decision required</option>
                {review.replacementValue?.familyId === review.familyId &&
                review.replacementValue.lifecycleState === 'active' ? (
                  <option value={`use:${review.replacementValue.id}`}>
                    Use merged replacement “{review.replacementValue.name}”
                  </option>
                ) : null}
                {matchedArchived.map((value) => (
                  <option key={`restore-${value.id}`} value={`restore:${value.id}`}>
                    Restore and use “{value.name}”
                  </option>
                ))}
                {activeValues.map((value) => (
                  <option key={`use-${value.id}`} value={`use:${value.id}`}>
                    Use existing “{value.name}”
                  </option>
                ))}
                {review.kind === 'unknown' ? (
                  <option value="create">Create “{review.displayValue}”</option>
                ) : null}
                {review.genericTagPrefix ? (
                  <option value="generic-tag">Keep as a generic searchable tag</option>
                ) : null}
                <option value="ignore">Ignore this value — confirmed</option>
              </select>
            </label>

            {canSave || canUpdate ? (
              <label>
                <span>
                  Mapping behavior
                  <small>
                    Apply once keeps this decision local to the current import. Saved mappings are
                    shared by Activities, Resources, Assessments, and Calendar Events.
                  </small>
                </span>
                <select
                  aria-label={`${review.fieldLabel} mapping behavior for ${review.displayValue}`}
                  value={persistenceDecision ?? ''}
                  disabled={disabled}
                  onChange={(event) => {
                    const value = event.target.value;
                    onMappingPersistenceDecision(
                      review.key,
                      value === 'save' || value === 'update' ? value : undefined,
                    );
                  }}
                >
                  <option value="">Apply once</option>
                  {canSave ? <option value="save">Save as import mapping</option> : null}
                  {canUpdate ? (
                    <option value="update">Update and activate saved mapping</option>
                  ) : null}
                </select>
              </label>
            ) : null}

            {review.kind === 'mapping' || canSave || canUpdate ? (
              <small className={styles.mappingManageLink}>
                <Link to={`/categories?family=${review.familyId}&mode=mappings`}>
                  Manage mappings for {review.familyLabel}
                </Link>
              </small>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

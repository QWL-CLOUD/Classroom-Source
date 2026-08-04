import type { CategoryValue } from '@/domain/models/entities';

import type {
  ImportClassificationDecision,
  ImportClassificationDecisions,
  ImportClassificationReview as ImportClassificationReviewRecord,
} from './importClassificationResolution';

export interface ImportClassificationReviewProps {
  reviews: readonly ImportClassificationReviewRecord[];
  decisions: ImportClassificationDecisions;
  categoryValues: readonly CategoryValue[];
  disabled?: boolean;
  onDecision: (reviewKey: string, decision: ImportClassificationDecision | undefined) => void;
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

export function ImportClassificationReview({
  reviews,
  decisions,
  categoryValues,
  disabled = false,
  onDecision,
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
          (value) => value.lifecycleState === 'archived',
        );
        return (
          <label key={review.key}>
            <span>
              {review.fieldLabel}: “{review.displayValue}”<small>{reviewExplanation(review)}</small>
            </span>
            <select
              aria-label={`${review.fieldLabel} resolution for ${review.displayValue}`}
              value={encodeImportClassificationDecision(decisions[review.key])}
              disabled={disabled}
              onChange={(event) =>
                onDecision(review.key, decodeImportClassificationDecision(event.target.value))
              }
            >
              <option value="">Decision required</option>
              {review.replacementValue?.lifecycleState === 'active' ? (
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
              <option value="generic-tag">Keep as a generic searchable tag</option>
              <option value="ignore">Ignore this value — confirmed</option>
            </select>
          </label>
        );
      })}
    </>
  );
}

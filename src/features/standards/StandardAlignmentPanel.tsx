import { CheckSquare, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type {
  LessonFlowStep,
  Standard,
  StandardAlignment,
  StandardAlignmentTargetType,
} from '@/domain/models/entities';

import {
  buildStandardAlignmentDraft,
  toggleStandardAlignment,
  type StandardAlignmentDraft,
} from './standardAlignmentModel';
import {
  standardAlignmentMutationService,
  type StandardAlignmentMutationService,
} from './standardAlignmentMutationService';
import styles from './StandardAlignmentPanel.module.css';

function draftKey(draft: StandardAlignmentDraft): string {
  return JSON.stringify({
    root: [...draft.rootStandardIds].sort(),
    steps: Object.fromEntries(
      Object.entries(draft.stepStandardIds)
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([stepId, ids]) => [stepId, [...ids].sort()]),
    ),
  });
}

export function StandardAlignmentPanel({
  targetType,
  targetId,
  lessonFlow,
  standards,
  alignments,
  disabled = false,
  service = standardAlignmentMutationService,
}: {
  targetType: StandardAlignmentTargetType;
  targetId: string;
  lessonFlow: readonly LessonFlowStep[];
  standards: readonly Standard[];
  alignments: readonly StandardAlignment[];
  disabled?: boolean;
  service?: StandardAlignmentMutationService;
}) {
  const target = useMemo(
    () => ({ targetType, targetId, lessonFlow }),
    [lessonFlow, targetId, targetType],
  );
  const sourceDraft = useMemo(
    () => buildStandardAlignmentDraft(alignments, target),
    [alignments, target],
  );
  const [draft, setDraft] = useState(sourceDraft);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(sourceDraft);
  }, [sourceDraft]);

  const selectedIds = useMemo(
    () => new Set([...draft.rootStandardIds, ...Object.values(draft.stepStandardIds).flat()]),
    [draft],
  );
  const visibleStandards = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('en');
    return standards
      .filter((standard) => {
        if (standard.status === 'archived' && !selectedIds.has(standard.id)) return false;
        if (!normalizedQuery) return true;
        return [
          standard.code,
          standard.statement,
          standard.frameworkTitle,
          standard.subject ?? '',
          standard.gradeBand ?? '',
        ]
          .join(' ')
          .toLocaleLowerCase('en')
          .includes(normalizedQuery);
      })
      .sort(
        (first, second) =>
          (first.status === second.status ? 0 : first.status === 'active' ? -1 : 1) ||
          first.frameworkTitle.localeCompare(second.frameworkTitle, 'en', {
            sensitivity: 'base',
          }) ||
          first.sortOrder - second.sortOrder ||
          first.code.localeCompare(second.code, 'en', {
            numeric: true,
            sensitivity: 'base',
          }),
      );
  }, [query, selectedIds, standards]);

  const changed = draftKey(draft) !== draftKey(sourceDraft);

  async function save(): Promise<void> {
    if (busy || !changed) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await service.replaceTargetAlignments(target, draft);
      setMessage('Standards alignment saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Standards alignment could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  function renderScope(
    label: string,
    selectedStandardIds: readonly string[],
    lessonFlowStepId?: string,
    detail?: string,
  ) {
    return (
      <fieldset className={styles.scope}>
        <legend>{label}</legend>
        {detail ? <small>{detail}</small> : null}
        {visibleStandards.length === 0 ? (
          <p className={styles.empty}>No matching active Standards.</p>
        ) : (
          <div className={styles.options}>
            {visibleStandards.map((standard) => {
              const checked = selectedStandardIds.includes(standard.id);
              return (
                <label
                  key={standard.id}
                  className={`${styles.option} ${
                    standard.status === 'archived' ? styles.archived : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled || busy || (standard.status === 'archived' && !checked)}
                    onChange={() => {
                      setDraft((current) =>
                        toggleStandardAlignment(current, standard.id, lessonFlowStepId),
                      );
                      setMessage(null);
                      setError(null);
                    }}
                  />
                  <span>
                    <strong>
                      {standard.code}
                      {standard.status === 'archived' ? ' · Archived' : ''}
                    </strong>
                    <span>{standard.statement}</span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </fieldset>
    );
  }

  return (
    <section className={styles.panel} aria-label="Standards alignment">
      <div className={styles.heading}>
        <div>
          <p className="page-eyebrow">Explicit source links</p>
          <h2>Standards alignment</h2>
          <p>
            Alignments reference independent Standard records. Editing either side does not rewrite
            the other.
          </p>
        </div>
        <a href="#/standards">Manage Standards</a>
      </div>

      <label className={styles.search}>
        <span>Search Standards</span>
        <input
          value={query}
          disabled={disabled || busy}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Code, statement, framework, subject, or grade"
        />
      </label>

      <div className={styles.scopes}>
        {renderScope(
          targetType === 'lesson-plan' ? 'Plan-level alignment' : 'Template-level alignment',
          draft.rootStandardIds,
          undefined,
          'Applies to the overall reusable or planned lesson.',
        )}
        {lessonFlow.map((step, index) =>
          renderScope(
            `Step ${index + 1}: ${step.title}`,
            draft.stepStandardIds[step.id] ?? [],
            step.id,
            `${step.phase.replaceAll('-', ' ')}${step.durationMinutes ? ` · ${step.durationMinutes} min` : ''}`,
          ),
        )}
      </div>

      {lessonFlow.length === 0 ? (
        <p className={styles.message}>
          Add and save Lesson Flow steps before creating step-level alignments.
        </p>
      ) : null}
      {message ? (
        <p className={styles.message} role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.actions}>
        <button
          className="button button-primary"
          type="button"
          disabled={disabled || busy || !changed}
          onClick={() => void save()}
        >
          {busy ? (
            'Saving…'
          ) : (
            <>
              <Save size={17} aria-hidden="true" /> Save alignments
            </>
          )}
        </button>
        {changed ? (
          <button
            className="button"
            type="button"
            disabled={disabled || busy}
            onClick={() => setDraft(sourceDraft)}
          >
            <CheckSquare size={17} aria-hidden="true" /> Reset
          </button>
        ) : null}
      </div>
    </section>
  );
}

import { Save, X } from 'lucide-react';
import { useId, useMemo, useState, type FormEvent } from 'react';

import type { Standard } from '@/domain/models/entities';

import { createStandardEditorValues, type StandardEditorValues } from './standardModel';
import { buildStandardFrameworkKey } from './standardIdentity';
import styles from './StandardEditor.module.css';

export function StandardEditor({
  standard,
  standards,
  busy,
  onCancel,
  onSubmit,
}: {
  standard?: Standard;
  standards: readonly Standard[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (values: StandardEditorValues) => Promise<void>;
}) {
  const id = useId();
  const [values, setValues] = useState<StandardEditorValues>(() =>
    createStandardEditorValues(standard),
  );
  const [error, setError] = useState<string | null>(null);

  const frameworkKey = buildStandardFrameworkKey({
    issuingOrganization: values.issuingOrganization,
    frameworkTitle: values.frameworkTitle,
    jurisdiction: values.jurisdiction || undefined,
    version: values.version || undefined,
  });

  const parentChoices = useMemo(
    () =>
      standards
        .filter(
          (candidate) =>
            candidate.id !== standard?.id &&
            candidate.frameworkKey === frameworkKey &&
            candidate.status === 'active',
        )
        .sort(
          (first, second) =>
            first.sortOrder - second.sortOrder ||
            first.code.localeCompare(second.code, 'en', {
              numeric: true,
              sensitivity: 'base',
            }),
        ),
    [frameworkKey, standard?.id, standards],
  );

  function update<K extends keyof StandardEditorValues>(
    key: K,
    value: StandardEditorValues[K],
  ): void {
    setValues((current) => {
      const next: StandardEditorValues = { ...current, [key]: value };
      if (
        ['issuingOrganization', 'frameworkTitle', 'jurisdiction', 'version'].includes(key) &&
        current.parentStandardId &&
        !standards.some(
          (candidate) =>
            candidate.id === current.parentStandardId &&
            candidate.frameworkKey ===
              buildStandardFrameworkKey({
                issuingOrganization: next.issuingOrganization,
                frameworkTitle: next.frameworkTitle,
                jurisdiction: next.jurisdiction || undefined,
                version: next.version || undefined,
              }),
        )
      ) {
        next.parentStandardId = '';
      }
      return next;
    });
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    try {
      await onSubmit(values);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Standard could not be saved.');
    }
  }

  return (
    <form
      className={styles.editor}
      aria-label="Standard editor"
      onSubmit={(event) => void submit(event)}
    >
      <fieldset className={styles.identity}>
        <legend>Framework identity</legend>
        <p className={styles.help}>
          A code is unique only inside this issuing organization, framework, jurisdiction, and
          version.
        </p>
        <div className={styles.grid}>
          <label htmlFor={`${id}-organization`}>
            <span>Issuing organization</span>
            <input
              id={`${id}-organization`}
              value={values.issuingOrganization}
              maxLength={240}
              required
              autoFocus
              disabled={busy}
              onChange={(event) => update('issuingOrganization', event.target.value)}
            />
          </label>
          <label htmlFor={`${id}-framework`}>
            <span>Framework title</span>
            <input
              id={`${id}-framework`}
              value={values.frameworkTitle}
              maxLength={500}
              required
              disabled={busy}
              onChange={(event) => update('frameworkTitle', event.target.value)}
            />
          </label>
          <label htmlFor={`${id}-jurisdiction`}>
            <span>Jurisdiction or scope</span>
            <input
              id={`${id}-jurisdiction`}
              value={values.jurisdiction}
              maxLength={240}
              disabled={busy}
              onChange={(event) => update('jurisdiction', event.target.value)}
              placeholder="Optional"
            />
          </label>
          <label htmlFor={`${id}-version`}>
            <span>Version or publication year</span>
            <input
              id={`${id}-version`}
              value={values.version}
              maxLength={120}
              disabled={busy}
              onChange={(event) => update('version', event.target.value)}
              placeholder="Optional"
            />
          </label>
        </div>
      </fieldset>

      <div className={styles.grid}>
        <label htmlFor={`${id}-subject`}>
          <span>Subject</span>
          <input
            id={`${id}-subject`}
            value={values.subject}
            maxLength={240}
            disabled={busy}
            onChange={(event) => update('subject', event.target.value)}
            placeholder="Optional"
          />
        </label>
        <label htmlFor={`${id}-grade`}>
          <span>Grade band or level</span>
          <input
            id={`${id}-grade`}
            value={values.gradeBand}
            maxLength={120}
            disabled={busy}
            onChange={(event) => update('gradeBand', event.target.value)}
            placeholder="Optional"
          />
        </label>
        <label htmlFor={`${id}-code`}>
          <span>Standard code</span>
          <input
            id={`${id}-code`}
            value={values.code}
            maxLength={160}
            required
            disabled={busy}
            onChange={(event) => update('code', event.target.value)}
          />
        </label>
        <label htmlFor={`${id}-sort-order`}>
          <span>Sort order</span>
          <input
            id={`${id}-sort-order`}
            inputMode="numeric"
            value={values.sortOrder}
            disabled={busy}
            onChange={(event) => update('sortOrder', event.target.value)}
            placeholder="0"
          />
        </label>
        <label className={styles.fullWidth} htmlFor={`${id}-parent`}>
          <span>Parent Standard</span>
          <select
            id={`${id}-parent`}
            value={values.parentStandardId}
            disabled={busy}
            onChange={(event) => update('parentStandardId', event.target.value)}
          >
            <option value="">No parent</option>
            {standard?.parentStandardId &&
            !parentChoices.some((candidate) => candidate.id === standard.parentStandardId) ? (
              <option value={standard.parentStandardId}>
                Current parent (archived or unavailable)
              </option>
            ) : null}
            {parentChoices.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.code} — {candidate.statement}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.fullWidth} htmlFor={`${id}-statement`}>
          <span>Standard statement</span>
          <textarea
            id={`${id}-statement`}
            value={values.statement}
            maxLength={10_000}
            rows={6}
            required
            disabled={busy}
            onChange={(event) => update('statement', event.target.value)}
          />
        </label>
      </div>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.actions}>
        <button className="button button-primary" type="submit" disabled={busy}>
          <Save size={17} aria-hidden="true" />
          {busy ? 'Saving…' : standard ? 'Save Standard' : 'Create Standard'}
        </button>
        <button className="button" type="button" disabled={busy} onClick={onCancel}>
          <X size={17} aria-hidden="true" /> Cancel
        </button>
      </div>
    </form>
  );
}

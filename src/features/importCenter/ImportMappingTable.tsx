import { Import, RefreshCcw } from 'lucide-react';

import styles from './ImportCenterShared.module.css';

export interface ImportMappingField<TField extends string> {
  key: TField;
  label: string;
  required?: boolean;
}

export function ImportMappingTable<TField extends string>({
  headingId,
  stepLabel,
  title,
  helpText,
  headers,
  fields,
  mapping,
  mappedCount,
  busy,
  previewDisabled,
  onChange,
  onReset,
  onPreview,
}: {
  headingId: string;
  stepLabel: string;
  title: string;
  helpText: string;
  headers: readonly string[];
  fields: readonly ImportMappingField<TField>[];
  mapping: Record<TField, number | null>;
  mappedCount: number;
  busy: boolean;
  previewDisabled: boolean;
  onChange: (field: TField, column: number | null) => void;
  onReset: () => void;
  onPreview: () => void;
}) {
  return (
    <section className={`card ${styles.section}`} aria-labelledby={headingId}>
      <div className={styles.sectionHeading}>
        <div>
          <p className="page-eyebrow">{stepLabel}</p>
          <h3 id={headingId}>{title}</h3>
        </div>
        <span className={styles.meta}>{mappedCount} fields mapped</span>
      </div>
      <p className={styles.helpText}>{helpText}</p>
      <div className={styles.mappingGrid}>
        {fields.map((field) => {
          const labelId = `${headingId}-${field.key}`;
          return (
            <label key={field.key}>
              <span id={labelId}>
                {field.label}
                {field.required ? ' *' : ''}
              </span>
              <select
                aria-labelledby={labelId}
                value={mapping[field.key] ?? ''}
                disabled={busy}
                onChange={(event) =>
                  onChange(field.key, event.target.value === '' ? null : Number(event.target.value))
                }
              >
                <option value="">Not mapped</option>
                {headers.map((header, index) => (
                  <option key={`${field.key}-${index}`} value={index}>
                    {header}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
      <div className={styles.actions}>
        <button className="button button-quiet" type="button" disabled={busy} onClick={onReset}>
          <RefreshCcw size={16} aria-hidden="true" /> Reset suggestions
        </button>
        <button
          className="button button-primary"
          type="button"
          disabled={busy || previewDisabled}
          onClick={onPreview}
        >
          <Import size={16} aria-hidden="true" /> Generate reviewed preview
        </button>
      </div>
    </section>
  );
}

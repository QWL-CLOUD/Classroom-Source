import type {
  ActivityImportColumnMapping,
  UnmappedColumnDecisions,
} from '@/features/activityImport/activityImportModel';
import { listReviewableUnmappedColumns } from '@/features/activityImport/activityImportModel';

import type { ImportTable } from './importTableModel';
import styles from './ImportCenterShared.module.css';

export function ImportUnmappedColumnsReview({
  headingId,
  table,
  mapping,
  decisions,
  busy,
  onChange,
}: {
  headingId: string;
  table: ImportTable;
  mapping: ActivityImportColumnMapping;
  decisions: UnmappedColumnDecisions;
  busy: boolean;
  onChange: (column: number, decision: 'notes' | 'ignore' | undefined) => void;
}) {
  const columns = listReviewableUnmappedColumns(table, mapping);
  if (columns.length === 0) return null;

  return (
    <section className={`card ${styles.section}`} aria-labelledby={headingId}>
      <div className={styles.sectionHeading}>
        <div>
          <p className="page-eyebrow">Required review</p>
          <h3 id={headingId}>Resolve non-empty unmapped columns</h3>
        </div>
        <span className={styles.meta}>{columns.length} columns</span>
      </div>
      <p className={styles.helpText}>
        No non-empty source column is silently discarded. Preserve its values in Activity teacher
        notes or explicitly confirm that the column should be ignored.
      </p>
      <div className={styles.unmappedGrid}>
        {columns.map((column) => (
          <label key={column.column}>
            <span>
              {column.header} <small>({column.nonEmptyCount} non-empty rows)</small>
            </span>
            <select
              value={decisions[column.column] ?? ''}
              disabled={busy}
              onChange={(event) =>
                onChange(
                  column.column,
                  event.target.value === ''
                    ? undefined
                    : (event.target.value as 'notes' | 'ignore'),
                )
              }
            >
              <option value="">Review required</option>
              <option value="notes">Preserve values in teacher notes</option>
              <option value="ignore">Ignore this column — confirmed</option>
            </select>
          </label>
        ))}
      </div>
    </section>
  );
}

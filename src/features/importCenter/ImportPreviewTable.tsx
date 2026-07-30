import type { ReactNode } from 'react';

import styles from './ImportCenterShared.module.css';

export interface ImportPreviewColumn<TRow> {
  key: string;
  label: string;
  render: (row: TRow) => ReactNode;
}

export function ImportPreviewTable<TRow>({
  label,
  rows,
  columns,
  rowKey,
}: {
  label: string;
  rows: readonly TRow[];
  columns: readonly ImportPreviewColumn<TRow>[];
  rowKey: (row: TRow, index: number) => string;
}) {
  return (
    <div className={styles.tableScroller} tabIndex={0} aria-label={label}>
      <table className={styles.previewTable}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)}>
              {columns.map((column) => (
                <td key={column.key}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

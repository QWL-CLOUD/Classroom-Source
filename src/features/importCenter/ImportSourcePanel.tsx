import { FileSpreadsheet } from 'lucide-react';
import type { ChangeEvent } from 'react';

import type { ImportWorkbook } from './importTypes';
import styles from './ImportCenterShared.module.css';

export interface ImportSourcePanelProps {
  headingId: string;
  stepLabel: string;
  title: string;
  description: string;
  fileLabel: string;
  accept: string;
  inputLabel: string;
  busy: boolean;
  workbook: ImportWorkbook | null;
  selectedSheetIndex: number;
  worksheetInputId: string;
  onChooseFile: (file: File | undefined) => void | Promise<void>;
  onSelectWorksheet: (index: number) => void;
}

export function ImportSourcePanel({
  headingId,
  stepLabel,
  title,
  description,
  fileLabel,
  accept,
  inputLabel,
  busy,
  workbook,
  selectedSheetIndex,
  worksheetInputId,
  onChooseFile,
  onSelectWorksheet,
}: ImportSourcePanelProps) {
  function choose(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    void onChooseFile(file);
    event.target.value = '';
  }

  const isReadingXlsx = busy && fileLabel.toLocaleLowerCase('en').endsWith('.xlsx');
  const showWorksheetSelector =
    isReadingXlsx ||
    Boolean(workbook && (workbook.kind === 'xlsx' || workbook.worksheets.length > 1));

  return (
    <section className={`card ${styles.section}`} aria-labelledby={headingId}>
      <div className={styles.sectionHeading}>
        <div>
          <p className="page-eyebrow">{stepLabel}</p>
          <h3 id={headingId}>{title}</h3>
        </div>
        {fileLabel ? <span className={styles.fileBadge}>{fileLabel}</span> : null}
      </div>
      <div className={styles.sourcePicker}>
        <FileSpreadsheet size={28} aria-hidden="true" />
        <div>
          <strong>{description}</strong>
          <span>Files are parsed locally. No database write occurs during file review.</span>
        </div>
        <label className="button button-primary">
          Choose file
          <input
            className="sr-only"
            type="file"
            accept={accept}
            disabled={busy}
            aria-label={inputLabel}
            onChange={choose}
          />
        </label>
      </div>
      {showWorksheetSelector ? (
        <label className={styles.inlineField} htmlFor={worksheetInputId}>
          <span>Worksheet</span>
          <select
            id={worksheetInputId}
            value={selectedSheetIndex}
            disabled={busy || !workbook}
            onChange={(event) => onSelectWorksheet(Number(event.target.value))}
          >
            {workbook ? (
              workbook.worksheets.map((sheet, index) => (
                <option key={sheet.id} value={index}>
                  {sheet.name}
                </option>
              ))
            ) : (
              <option value={0}>Reading workbook…</option>
            )}
          </select>
        </label>
      ) : null}
    </section>
  );
}

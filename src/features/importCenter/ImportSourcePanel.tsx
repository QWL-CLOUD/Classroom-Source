import { ClipboardPaste, FileSpreadsheet } from 'lucide-react';
import type { ChangeEvent } from 'react';

import type { ImportWorkbook } from './importTypes';
import styles from './ImportCenterShared.module.css';

export type ImportSourcePanelMode = 'file' | 'paste-table';

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
  sourceModes?: readonly ImportSourcePanelMode[];
  sourceMode?: ImportSourcePanelMode;
  onSourceModeChange?: (mode: ImportSourcePanelMode) => void;
  pasteInputId?: string;
  pasteValue?: string;
  pasteLabel?: string;
  onPasteValueChange?: (value: string) => void;
  onParsePaste?: () => void;
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
  sourceModes = ['file'],
  sourceMode = 'file',
  onSourceModeChange,
  pasteInputId = `${headingId}-paste-table`,
  pasteValue = '',
  pasteLabel = 'Paste a table with one header row',
  onPasteValueChange,
  onParsePaste,
}: ImportSourcePanelProps) {
  function choose(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    void onChooseFile(file);
    event.target.value = '';
  }

  const isReadingXlsx = busy && fileLabel.toLocaleLowerCase('en').endsWith('.xlsx');
  const showWorksheetSelector =
    sourceMode === 'file' &&
    (isReadingXlsx ||
      Boolean(workbook && (workbook.kind === 'xlsx' || workbook.worksheets.length > 1)));

  return (
    <section className={`card ${styles.section}`} aria-labelledby={headingId}>
      <div className={styles.sectionHeading}>
        <div>
          <p className="page-eyebrow">{stepLabel}</p>
          <h3 id={headingId}>{title}</h3>
        </div>
        {fileLabel ? <span className={styles.fileBadge}>{fileLabel}</span> : null}
      </div>

      {sourceModes.length > 1 ? (
        <fieldset className={styles.sourceModeFieldset}>
          <legend>Source method</legend>
          <div className={styles.sourceModeOptions}>
            {sourceModes.map((mode) => (
              <label key={mode}>
                <input
                  type="radio"
                  name={`${headingId}-source-mode`}
                  value={mode}
                  checked={sourceMode === mode}
                  disabled={busy}
                  onChange={() => onSourceModeChange?.(mode)}
                />
                <span>{mode === 'file' ? 'File: CSV, XLSX, or JSON' : 'Pasted table'}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {sourceMode === 'file' ? (
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
      ) : (
        <div className={styles.pastePanel}>
          <label htmlFor={pasteInputId}>{pasteLabel}</label>
          <textarea
            id={pasteInputId}
            rows={9}
            value={pasteValue}
            disabled={busy}
            onChange={(event) => onPasteValueChange?.(event.target.value)}
            placeholder="title\tduration_minutes\tgrouping\nPartner retell\t12\tpartners"
          />
          <div className={styles.actions}>
            <button
              className="button button-primary"
              type="button"
              disabled={busy || !pasteValue.trim()}
              onClick={onParsePaste}
            >
              <ClipboardPaste size={16} aria-hidden="true" /> Review pasted table
            </button>
          </div>
          <p className={styles.helpText}>
            Paste tab-, comma-, or semicolon-delimited rows. Parsing stays local and preview writes
            nothing.
          </p>
        </div>
      )}

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

import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';

import type { LearnerContext, StudentRecord } from '@/domain/models/entities';

import {
  buildRosterImportPreview,
  downloadRosterImportTemplate,
  parseRosterImportFile,
  toRosterImportItems,
  type RosterImportDecision,
  type RosterImportPreviewRow,
} from './rosterImport';
import { rosterMutationService } from './rosterMutationService';
import styles from './RosterWorkspacePanel.module.css';

function statusLabel(row: RosterImportPreviewRow): string {
  switch (row.status) {
    case 'new':
      return 'New Student';
    case 'existing':
      return 'Existing Student';
    case 'already-in-roster':
      return 'Already in roster';
    case 'archived':
      return 'Archived match';
    case 'ambiguous':
      return 'Multiple matches';
    case 'duplicate-file':
      return 'Duplicate row';
    case 'invalid':
      return 'Invalid row';
  }
}

function allowedDecisions(row: RosterImportPreviewRow): RosterImportDecision[] {
  if (row.status === 'new') return ['create', 'skip'];
  if (row.status === 'existing') return ['reuse', 'create', 'skip'];
  return ['skip'];
}

function decisionLabel(decision: RosterImportDecision): string {
  if (decision === 'create') return 'Create new Student';
  if (decision === 'reuse') return 'Use existing Student';
  return 'Skip row';
}

export function RosterImportPanel({
  context,
  students,
  memberStudentIds,
  busy,
  onBusyChange,
  onError,
  onDone,
}: {
  context: LearnerContext;
  students: StudentRecord[];
  memberStudentIds: ReadonlySet<string>;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onError: (message: string | null) => void;
  onDone: (message: string) => void;
}) {
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<RosterImportPreviewRow[]>([]);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    setFileName('');
    setRows([]);
    setReading(false);
  }, [context.id]);

  const importItems = useMemo(() => toRosterImportItems(rows), [rows]);
  const summary = useMemo(
    () => ({
      create: rows.filter((row) => row.decision === 'create').length,
      reuse: rows.filter((row) => row.decision === 'reuse').length,
      skip: rows.filter((row) => row.decision === 'skip').length,
    }),
    [rows],
  );

  async function readFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setReading(true);
    onError(null);
    try {
      const parsed = await parseRosterImportFile(file);
      setRows(buildRosterImportPreview(parsed, students, memberStudentIds));
      setFileName(file.name);
    } catch (cause) {
      setRows([]);
      setFileName('');
      onError(cause instanceof Error ? cause.message : 'The roster file could not be read.');
    } finally {
      setReading(false);
    }
  }

  function updateDecision(key: string, decision: RosterImportDecision): void {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, decision } : row)));
  }

  async function commitImport(): Promise<void> {
    if (busy || importItems.length === 0) return;
    onBusyChange(true);
    onError(null);
    try {
      const result = await rosterMutationService.importRoster(context.id, importItems);
      onDone(
        `Imported ${result.memberships.length} student${
          result.memberships.length === 1 ? '' : 's'
        }: ${result.createdStudents} new and ${result.reusedStudents} existing.`,
      );
      setRows([]);
      setFileName('');
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'The roster import failed.');
    } finally {
      onBusyChange(false);
    }
  }

  return (
    <section className={styles.importPanel} aria-label="Import roster">
      <div className={styles.importHeader}>
        <div>
          <p className="page-eyebrow">Batch import</p>
          <h3>Preview before adding students</h3>
          <p>CSV and Excel files are processed locally. Nothing is uploaded.</p>
        </div>
        <div className={styles.templateActions}>
          <button
            className="button"
            type="button"
            onClick={() => void downloadRosterImportTemplate('xlsx')}
          >
            <Download aria-hidden="true" size={16} /> Excel template
          </button>
          <button
            className="button"
            type="button"
            onClick={() => void downloadRosterImportTemplate('csv')}
          >
            <Download aria-hidden="true" size={16} /> CSV template
          </button>
        </div>
      </div>

      <label className={styles.filePicker}>
        <Upload aria-hidden="true" size={20} />
        <span>
          <strong>{reading ? 'Reading file…' : 'Choose CSV or Excel file'}</strong>
          <small>Name is required. Preferred Name, Role, and Notes are optional.</small>
        </span>
        <input
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          disabled={busy || reading}
          aria-label="Choose CSV or Excel roster file"
          onChange={(event) => void readFile(event)}
        />
      </label>

      {rows.length > 0 ? (
        <>
          <div className={styles.previewSummary} role="status">
            <FileSpreadsheet aria-hidden="true" size={18} />
            <span>
              <strong>{fileName}</strong> · {summary.create} new · {summary.reuse} existing ·{' '}
              {summary.skip} skipped
            </span>
          </div>

          <ol className={styles.previewList} aria-label="Roster import preview">
            {rows.map((row) => (
              <li key={row.key} className={styles.previewRow}>
                <span className={styles.previewRowNumber}>{row.sourceRow}</span>
                <div className={styles.previewIdentity}>
                  <strong>{row.name || 'Missing name'}</strong>
                  {row.preferredName ? <span>{row.preferredName}</span> : null}
                  <small>{row.message}</small>
                </div>
                <span
                  className={`${styles.previewStatus} ${
                    row.decision === 'skip' ? styles.previewStatusMuted : styles.previewStatusReady
                  }`}
                >
                  {row.decision === 'skip' ? (
                    <AlertTriangle aria-hidden="true" size={14} />
                  ) : (
                    <CheckCircle2 aria-hidden="true" size={14} />
                  )}
                  {statusLabel(row)}
                </span>
                <label className={styles.previewDecision}>
                  <span className="visually-hidden">Action for {row.name}</span>
                  <select
                    value={row.decision}
                    disabled={busy || allowedDecisions(row).length === 1}
                    aria-label={`Import action for ${row.name || `row ${row.sourceRow}`}`}
                    onChange={(event) =>
                      updateDecision(row.key, event.target.value as RosterImportDecision)
                    }
                  >
                    {allowedDecisions(row).map((decision) => (
                      <option key={decision} value={decision}>
                        {decisionLabel(decision)}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            ))}
          </ol>

          <div className={styles.importFooter}>
            <p>Confirming creates one global Undo action for the entire import.</p>
            <button
              className="button button-primary"
              type="button"
              disabled={busy || importItems.length === 0}
              onClick={() => void commitImport()}
            >
              <Upload aria-hidden="true" size={16} />
              {busy
                ? 'Importing…'
                : `Import ${importItems.length} student${importItems.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

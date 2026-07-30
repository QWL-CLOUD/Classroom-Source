import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, CheckCircle2, Download, Import } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { classroomDb } from '@/data/db/ClassroomDatabase';
import {
  learnerContextSchema,
  rosterMembershipSchema,
  studentRecordSchema,
  type LearnerContext,
} from '@/domain/models/entities';
import {
  buildRosterImportPreview,
  downloadRosterImportTemplate,
  parseRosterImportFile,
  parseRosterImportWorksheet,
  toRosterImportItems,
  type RosterImportDecision,
  type RosterImportPreviewRow,
  type RosterImportWorkbook,
} from '@/features/rosters/rosterImport';
import { rosterMutationService } from '@/features/rosters/rosterMutationService';

import { ImportPreviewTable, type ImportPreviewColumn } from './ImportPreviewTable';
import { ImportSourcePanel } from './ImportSourcePanel';
import styles from './ImportCenterShared.module.css';

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

function contextReturnHref(context: LearnerContext): string {
  const parameters = new URLSearchParams({
    schoolYear: context.schoolYearId,
    context: context.id,
    workspace: 'roster',
  });
  return `/learners?${parameters.toString()}`;
}

export function RosterImportWorkspace({
  contextId,
  onContextChange,
}: {
  contextId?: string;
  onContextChange: (contextId?: string) => void;
}) {
  const data = useLiveQuery(async () => {
    const [contexts, students, memberships] = await Promise.all([
      classroomDb.learnerContexts.toArray(),
      classroomDb.studentRecords.toArray(),
      classroomDb.rosterMemberships.toArray(),
    ]);
    return {
      contexts: contexts
        .map((value) => learnerContextSchema.parse(value))
        .filter((context) => context.kind === 'class' || context.kind === 'group')
        .sort((first, second) => first.name.localeCompare(second.name, 'en')),
      students: students.map((value) => studentRecordSchema.parse(value)),
      memberships: memberships.map((value) => rosterMembershipSchema.parse(value)),
    };
  }, []);
  const [workbook, setWorkbook] = useState<RosterImportWorkbook | null>(null);
  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);
  const [fileLabel, setFileLabel] = useState('');
  const [rows, setRows] = useState<RosterImportPreviewRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmCommit, setConfirmCommit] = useState(false);

  const selectedContext = data?.contexts.find((context) => context.id === contextId);
  const invalidContextId = Boolean(contextId && data && !selectedContext);
  const memberStudentIds = useMemo(
    () =>
      new Set(
        data?.memberships
          .filter((membership) => membership.contextId === selectedContext?.id)
          .map((membership) => membership.studentId) ?? [],
      ),
    [data, selectedContext?.id],
  );
  const importItems = useMemo(() => toRosterImportItems(rows), [rows]);
  const summary = useMemo(
    () => ({
      create: rows.filter((row) => row.decision === 'create').length,
      reuse: rows.filter((row) => row.decision === 'reuse').length,
      skip: rows.filter((row) => row.decision === 'skip').length,
    }),
    [rows],
  );
  const selectedSheet = workbook?.worksheets[selectedSheetIndex] ?? null;

  useEffect(() => {
    setWorkbook(null);
    setSelectedSheetIndex(0);
    setFileLabel('');
    setRows([]);
    setBusy(false);
    setError(null);
    setSuccess(null);
    setConfirmCommit(false);
  }, [contextId]);

  function loadSheet(nextWorkbook: RosterImportWorkbook, index: number): void {
    const worksheet = nextWorkbook.worksheets[index];
    if (!worksheet) throw new Error('The selected worksheet is no longer available.');
    if (!data) throw new Error('Student records are still loading.');
    const parsed = parseRosterImportWorksheet(worksheet.rows);
    setSelectedSheetIndex(index);
    setRows(buildRosterImportPreview(parsed, data.students, memberStudentIds));
    setSuccess(null);
    setConfirmCommit(false);
  }

  async function chooseFile(file: File | undefined): Promise<void> {
    if (!file || busy || !selectedContext || !data) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    setFileLabel(file.name);
    try {
      const parsed = await parseRosterImportFile(file);
      setWorkbook(parsed);
      try {
        loadSheet(parsed, 0);
      } catch (cause) {
        setSelectedSheetIndex(0);
        setRows([]);
        setConfirmCommit(false);
        setError(
          cause instanceof Error
            ? cause.message
            : 'Select another worksheet to continue the review.',
        );
      }
    } catch (cause) {
      setWorkbook(null);
      setFileLabel('');
      setRows([]);
      setError(cause instanceof Error ? cause.message : 'The roster file could not be read.');
      setConfirmCommit(false);
    } finally {
      setBusy(false);
    }
  }

  function updateDecision(key: string, decision: RosterImportDecision): void {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, decision } : row)));
    setSuccess(null);
    setConfirmCommit(false);
  }

  async function commitImport(): Promise<void> {
    if (
      busy ||
      !selectedContext ||
      selectedContext.status !== 'active' ||
      !workbook ||
      !selectedSheet ||
      importItems.length === 0 ||
      !confirmCommit
    )
      return;

    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await rosterMutationService.importRoster(selectedContext.id, importItems, {
        sourceKind: workbook.kind,
        sourceLabel: workbook.sourceLabel ?? fileLabel,
        worksheetName: selectedSheet.name,
        totalRows: rows.length,
        skippedCount: summary.skip,
      });
      setSuccess(
        `Imported ${result.memberships.length} student${
          result.memberships.length === 1 ? '' : 's'
        }: ${result.createdStudents} new and ${result.reusedStudents} existing.`,
      );
      setWorkbook(null);
      setSelectedSheetIndex(0);
      setFileLabel('');
      setRows([]);
      setConfirmCommit(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The roster import failed.');
    } finally {
      setBusy(false);
    }
  }

  const columns: Array<ImportPreviewColumn<RosterImportPreviewRow>> = [
    { key: 'row', label: 'Row', render: (row) => row.sourceRow },
    {
      key: 'status',
      label: 'Classification',
      render: (row) => (
        <span
          className={styles.classification}
          data-tone={row.decision === 'skip' ? 'skip' : row.status === 'new' ? 'new' : 'update'}
        >
          {statusLabel(row)}
        </span>
      ),
    },
    {
      key: 'student',
      label: 'Student',
      render: (row) => (
        <>
          <strong>{row.name || 'Missing name'}</strong>
          {row.preferredName ? <small>{row.preferredName}</small> : null}
        </>
      ),
    },
    { key: 'result', label: 'Review result', render: (row) => row.message },
    {
      key: 'action',
      label: 'Action',
      render: (row) => (
        <label className={styles.previewDecision}>
          <span className="sr-only">Action for {row.name || `row ${row.sourceRow}`}</span>
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
      ),
    },
  ];

  return (
    <section className={styles.workspace} aria-labelledby="roster-import-title">
      <div className={styles.workspaceHeader}>
        <div>
          <p className="page-eyebrow">Canonical workspace</p>
          <h2 id="roster-import-title">Import a Class or Group roster</h2>
          <p>
            Select one independent roster, review every Student decision, then commit the complete
            batch as one global Undo action.
          </p>
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

      <section className={`card ${styles.section}`} aria-labelledby="roster-target-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className="page-eyebrow">Step 1</p>
            <h3 id="roster-target-heading">Choose the target roster</h3>
          </div>
          {selectedContext ? (
            <span className={styles.meta}>
              {selectedContext.kind === 'class' ? 'Class' : 'Group'}
            </span>
          ) : null}
        </div>
        <label className={styles.contextField}>
          <span>Class or Group *</span>
          <select
            value={selectedContext?.id ?? ''}
            disabled={!data || busy}
            onChange={(event) => onContextChange(event.target.value || undefined)}
          >
            <option value="">Select a target roster</option>
            {data?.contexts.map((context) => (
              <option key={context.id} value={context.id}>
                {context.name} · {context.kind === 'class' ? 'Class' : 'Group'}
                {context.status === 'archived' ? ' · Archived' : ''}
              </option>
            ))}
          </select>
        </label>
        {invalidContextId ? (
          <p className={styles.error} role="alert">
            The requested roster context does not exist or is not a Class or Group.
          </p>
        ) : null}
        {selectedContext?.status === 'archived' ? (
          <div className={styles.blocked} role="status">
            <AlertTriangle aria-hidden="true" size={18} />
            <span>Restore this {selectedContext.kind} before importing Students.</span>
          </div>
        ) : null}
        {selectedContext ? (
          <div className={styles.contextSummary}>
            <p>
              {memberStudentIds.size} current roster member{memberStudentIds.size === 1 ? '' : 's'}.
              Student records remain canonical and independent from membership.
            </p>
            <Link className="button" to={contextReturnHref(selectedContext)}>
              Open roster
            </Link>
          </div>
        ) : null}
      </section>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <div className={styles.success} role="status">
          <CheckCircle2 aria-hidden="true" size={20} />
          <span>{success}</span>
          {selectedContext ? (
            <Link to={contextReturnHref(selectedContext)}>Open roster</Link>
          ) : null}
        </div>
      ) : null}

      {selectedContext?.status === 'active' ? (
        <ImportSourcePanel
          headingId="roster-import-file-heading"
          stepLabel="Step 2"
          title="Choose the reviewed roster file"
          description="CSV or XLSX, up to 20 MB. Name is required; Preferred Name, Role, and Notes are optional."
          fileLabel={fileLabel}
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          inputLabel="Choose CSV or XLSX roster file"
          busy={busy || !data}
          workbook={workbook}
          selectedSheetIndex={selectedSheetIndex}
          worksheetInputId="roster-import-worksheet"
          onChooseFile={chooseFile}
          onSelectWorksheet={(index) => {
            try {
              setError(null);
              if (!workbook) return;
              loadSheet(workbook, index);
            } catch (cause) {
              setRows([]);
              setError(cause instanceof Error ? cause.message : 'The worksheet could not be read.');
            }
          }}
        />
      ) : null}

      {rows.length > 0 ? (
        <section className={`card ${styles.section}`} aria-labelledby="roster-preview-heading">
          <div className={styles.sectionHeading}>
            <div>
              <p className="page-eyebrow">Step 3</p>
              <h3 id="roster-preview-heading">Review every Student decision</h3>
            </div>
            <span className={styles.meta}>No database writes yet</span>
          </div>
          <div className={styles.summary} aria-label="Roster import preview summary">
            <div>
              <strong>{summary.create}</strong>
              <span>New Students</span>
            </div>
            <div>
              <strong>{summary.reuse}</strong>
              <span>Existing Students</span>
            </div>
            <div>
              <strong>{summary.skip}</strong>
              <span>Skipped</span>
            </div>
          </div>
          <ImportPreviewTable
            label="Scrollable roster import preview"
            rows={rows}
            columns={columns}
            rowKey={(row) => row.key}
          />
          {importItems.length === 0 ? (
            <div className={styles.blocked} role="status">
              <AlertTriangle aria-hidden="true" size={18} />
              <span>No reviewed Student rows are selected for import.</span>
            </div>
          ) : (
            <div className={styles.confirmation} aria-label="Roster import confirmation">
              <label>
                <input
                  type="checkbox"
                  checked={confirmCommit}
                  onChange={(event) => setConfirmCommit(event.target.checked)}
                />
                Commit the selected Student rows and roster memberships as one atomic, globally
                undoable import.
              </label>
              <button
                className="button button-primary"
                type="button"
                disabled={busy || importItems.length === 0 || !confirmCommit}
                onClick={() => void commitImport()}
              >
                <Import aria-hidden="true" size={16} />
                {busy
                  ? 'Importing…'
                  : `Import ${importItems.length} student${importItems.length === 1 ? '' : 's'}`}
              </button>
            </div>
          )}
        </section>
      ) : null}
    </section>
  );
}

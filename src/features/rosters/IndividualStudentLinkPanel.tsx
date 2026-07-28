import { AlertTriangle, Check, Link2, Link2Off, Plus, Search, UserRound, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ZodError } from 'zod';

import type { LearnerContext, StudentRecord } from '@/domain/models/entities';

import { rosterMutationService, type StudentRecordValues } from './rosterMutationService';
import { useIndividualStudentLink } from './useIndividualStudentLink';
import styles from './IndividualStudentLinkPanel.module.css';

type LinkMode = 'existing' | 'create';

function getLinkError(cause: unknown): string {
  if (cause instanceof ZodError) {
    return cause.issues[0]?.message ?? 'Check the Student details.';
  }
  return cause instanceof Error ? cause.message : 'The Student link could not be updated.';
}

function displayStudentName(student: StudentRecord): string {
  return student.preferredName ?? student.name;
}

function studentMatches(student: StudentRecord, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase('en');
  if (!normalized) return true;
  return [student.name, student.preferredName, student.notes]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLocaleLowerCase('en').includes(normalized));
}

function LinkedStudentSummary({
  context,
  student,
  busy,
  onUnlink,
  unlinkArmed,
  onCancelUnlink,
}: {
  context: LearnerContext;
  student: StudentRecord;
  busy: boolean;
  onUnlink: () => void;
  unlinkArmed: boolean;
  onCancelUnlink: () => void;
}) {
  const displayName = displayStudentName(student);

  return (
    <article className={styles.linkedCard} aria-label={`Linked Student ${displayName}`}>
      <div className={styles.studentAvatar}>
        <UserRound aria-hidden="true" size={22} />
      </div>
      <div className={styles.studentSummary}>
        <div className={styles.studentHeading}>
          <div>
            <p className="page-eyebrow">Linked Student</p>
            <h3>{displayName}</h3>
            {student.preferredName ? <span>{student.name}</span> : null}
          </div>
          <span
            className={student.status === 'archived' ? styles.archivedStatus : styles.activeStatus}
          >
            {student.status === 'archived' ? 'Archived' : 'Active'}
          </span>
        </div>
        {student.notes ? (
          <p className={styles.studentNotes}>{student.notes}</p>
        ) : (
          <p className={styles.emptyNotes}>No Student-level notes.</p>
        )}
        <dl className={styles.linkFacts}>
          <div>
            <dt>Planning context</dt>
            <dd>{context.name}</dd>
          </div>
          <div>
            <dt>Relationship</dt>
            <dd>Optional Student link</dd>
          </div>
          <div>
            <dt>Roster effect</dt>
            <dd>None</dd>
          </div>
        </dl>
      </div>
      <div className={styles.unlinkActions}>
        <button
          className={unlinkArmed ? styles.dangerButton : 'button'}
          type="button"
          disabled={busy}
          onClick={onUnlink}
        >
          <Link2Off aria-hidden="true" size={16} />
          {busy ? 'Updating…' : unlinkArmed ? `Confirm unlink ${displayName}` : 'Unlink Student'}
        </button>
        {unlinkArmed ? (
          <button className="button" type="button" disabled={busy} onClick={onCancelUnlink}>
            Keep link
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function IndividualStudentLinkPanel({ context }: { context: LearnerContext }) {
  const state = useIndividualStudentLink(context.id);
  const [mode, setMode] = useState<LinkMode>('existing');
  const [query, setQuery] = useState('');
  const [studentId, setStudentId] = useState('');
  const [createValues, setCreateValues] = useState({
    name: '',
    preferredName: '',
    notes: '',
  });
  const [editing, setEditing] = useState(false);
  const [changeArmed, setChangeArmed] = useState(false);
  const [unlinkArmed, setUnlinkArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMode('existing');
    setQuery('');
    setStudentId('');
    setCreateValues({ name: '', preferredName: '', notes: '' });
    setEditing(false);
    setChangeArmed(false);
    setUnlinkArmed(false);
    setBusy(false);
    setError(null);
  }, [context.id]);

  const data = state.status === 'ready' ? state.data : null;
  const linkedStudent = data?.linkedStudent;
  const candidates = useMemo(
    () =>
      (data?.activeStudents ?? []).filter(
        (student) => student.id !== linkedStudent?.id && studentMatches(student, query),
      ),
    [data, linkedStudent?.id, query],
  );

  useEffect(() => {
    if (candidates.some((student) => student.id === studentId)) return;
    setStudentId('');
    setChangeArmed(false);
  }, [candidates, studentId]);

  const canEdit = context.status === 'active';
  const selectedStudent = candidates.find((student) => student.id === studentId);

  async function linkExisting(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!studentId || busy || !canEdit) return;

    if (linkedStudent && !changeArmed) {
      setChangeArmed(true);
      setError(null);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await rosterMutationService.linkIndividualContext(context.id, studentId);
      setQuery('');
      setStudentId('');
      setEditing(false);
      setChangeArmed(false);
      setUnlinkArmed(false);
    } catch (cause) {
      setError(getLinkError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function createAndLink(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy || !canEdit || linkedStudent) return;

    setBusy(true);
    setError(null);
    try {
      const values: StudentRecordValues = createValues;
      await rosterMutationService.createStudentAndLinkIndividual(context.id, values);
      setCreateValues({ name: '', preferredName: '', notes: '' });
      setEditing(false);
      setMode('existing');
    } catch (cause) {
      setError(getLinkError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function unlink(): Promise<void> {
    if (!linkedStudent || busy || !canEdit) return;
    if (!unlinkArmed) {
      setUnlinkArmed(true);
      setChangeArmed(false);
      setError(null);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await rosterMutationService.unlinkIndividualContext(context.id);
      setUnlinkArmed(false);
      setEditing(false);
      setStudentId('');
      setQuery('');
    } catch (cause) {
      setError(getLinkError(cause));
    } finally {
      setBusy(false);
    }
  }

  if (context.kind !== 'individual') return null;

  return (
    <section
      className={`card ${styles.linkWorkspace}`}
      aria-label={`Student link for ${context.name}`}
    >
      <div className={styles.linkHeader}>
        <div>
          <p className="page-eyebrow">Individual Student Link</p>
          <h2>Student identity</h2>
          <p>
            Optionally connect this one-on-one planning context to one canonical Student record.
            Linking does not create Class or Group membership.
          </p>
        </div>
        {linkedStudent && canEdit ? (
          <button
            className="button"
            type="button"
            aria-expanded={editing}
            onClick={() => {
              setEditing((current) => !current);
              setChangeArmed(false);
              setUnlinkArmed(false);
              setError(null);
            }}
          >
            {editing ? <X aria-hidden="true" size={16} /> : <Link2 aria-hidden="true" size={16} />}
            {editing ? 'Close link editor' : 'Change linked Student'}
          </button>
        ) : null}
      </div>

      {state.status === 'loading' ? (
        <p className={styles.stateMessage} role="status">
          Loading Student link…
        </p>
      ) : state.status === 'error' ? (
        <div className={styles.readError} role="alert">
          <AlertTriangle aria-hidden="true" size={18} />
          <span>{state.message}</span>
        </div>
      ) : (
        <>
          {linkedStudent ? (
            <>
              {linkedStudent.status === 'archived' ? (
                <div className={styles.archivedWarning} role="status">
                  <AlertTriangle aria-hidden="true" size={18} />
                  <span>
                    The linked Student is archived. The link is preserved until you explicitly
                    unlink it; restore the Student before linking another Individual context to this
                    record.
                  </span>
                </div>
              ) : null}
              <LinkedStudentSummary
                context={context}
                student={linkedStudent}
                busy={busy}
                unlinkArmed={unlinkArmed}
                onUnlink={() => void unlink()}
                onCancelUnlink={() => setUnlinkArmed(false)}
              />
            </>
          ) : (
            <div className={styles.emptyLink}>
              <UserRound aria-hidden="true" size={26} />
              <div>
                <h3>No Student linked</h3>
                <p>
                  Planning remains fully usable. Add a link only when this Individual context
                  represents a known Student record.
                </p>
              </div>
            </div>
          )}

          {!canEdit ? (
            <p className={styles.archivedRestriction}>
              Restore this Individual context before changing its Student link.
            </p>
          ) : !linkedStudent || editing ? (
            <div className={styles.editor}>
              {!linkedStudent ? (
                <div className={styles.modeTabs} role="tablist" aria-label="Student link method">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'existing'}
                    className={mode === 'existing' ? styles.activeMode : ''}
                    onClick={() => {
                      setMode('existing');
                      setError(null);
                    }}
                  >
                    Link existing Student
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'create'}
                    className={mode === 'create' ? styles.activeMode : ''}
                    onClick={() => {
                      setMode('create');
                      setError(null);
                    }}
                  >
                    Create Student and link
                  </button>
                </div>
              ) : null}

              {mode === 'existing' || linkedStudent ? (
                <form className={styles.linkForm} onSubmit={(event) => void linkExisting(event)}>
                  <div>
                    <h3>
                      {linkedStudent ? 'Choose a different Student' : 'Link an existing Student'}
                    </h3>
                    <p>
                      Search active Student records. The Student may independently belong to any
                      Class or Group roster.
                    </p>
                  </div>
                  <label>
                    <span>Search Student records</span>
                    <div className={styles.searchField}>
                      <Search aria-hidden="true" size={16} />
                      <input
                        value={query}
                        type="search"
                        disabled={busy}
                        placeholder="Name, preferred name, or notes"
                        onChange={(event) => {
                          setQuery(event.target.value);
                          setChangeArmed(false);
                        }}
                      />
                    </div>
                  </label>
                  <label>
                    <span>Student *</span>
                    <select
                      value={studentId}
                      disabled={busy || candidates.length === 0}
                      onChange={(event) => {
                        setStudentId(event.target.value);
                        setChangeArmed(false);
                      }}
                    >
                      <option value="">Select a Student</option>
                      {candidates.map((student) => (
                        <option key={student.id} value={student.id}>
                          {displayStudentName(student)}
                          {student.preferredName ? ` · ${student.name}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  {candidates.length === 0 ? (
                    <p className={styles.formNotice}>
                      No active Student records match this search.
                    </p>
                  ) : null}
                  <div className={styles.formActions}>
                    <button
                      className={changeArmed ? styles.confirmChangeButton : 'button button-primary'}
                      type="submit"
                      disabled={busy || !studentId}
                    >
                      {changeArmed ? (
                        <Check aria-hidden="true" size={16} />
                      ) : (
                        <Link2 aria-hidden="true" size={16} />
                      )}
                      {busy
                        ? 'Linking…'
                        : changeArmed && selectedStudent
                          ? `Confirm change to ${displayStudentName(selectedStudent)}`
                          : linkedStudent
                            ? 'Change linked Student'
                            : 'Link Student'}
                    </button>
                    {changeArmed ? (
                      <button
                        className="button"
                        type="button"
                        disabled={busy}
                        onClick={() => setChangeArmed(false)}
                      >
                        Cancel change
                      </button>
                    ) : null}
                  </div>
                </form>
              ) : (
                <form className={styles.linkForm} onSubmit={(event) => void createAndLink(event)}>
                  <div>
                    <h3>Create one Student record</h3>
                    <p>
                      The Student is created independently and linked to this Individual context in
                      one undoable action.
                    </p>
                  </div>
                  <label>
                    <span>Student name *</span>
                    <input
                      value={createValues.name}
                      disabled={busy}
                      maxLength={200}
                      placeholder="e.g. Amy Chen"
                      onChange={(event) =>
                        setCreateValues((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>Preferred name</span>
                    <input
                      value={createValues.preferredName}
                      disabled={busy}
                      maxLength={200}
                      placeholder="Optional"
                      onChange={(event) =>
                        setCreateValues((current) => ({
                          ...current,
                          preferredName: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>Student notes</span>
                    <textarea
                      value={createValues.notes}
                      disabled={busy}
                      rows={3}
                      maxLength={5000}
                      placeholder="Optional Student-level notes"
                      onChange={(event) =>
                        setCreateValues((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <button
                    className="button button-primary"
                    type="submit"
                    disabled={busy || !createValues.name.trim()}
                  >
                    <Plus aria-hidden="true" size={16} />
                    {busy ? 'Creating…' : 'Create Student and link'}
                  </button>
                </form>
              )}
            </div>
          ) : null}
        </>
      )}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

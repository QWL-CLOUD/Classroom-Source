import {
  AlertTriangle,
  Archive,
  FileSpreadsheet,
  Plus,
  Search,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ZodError } from 'zod';

import type { LearnerContext, StudentRecord } from '@/domain/models/entities';
import { buildImportCenterHref } from '@/features/importCenter/importRouteState';

import { rosterMutationService, type StudentRecordValues } from './rosterMutationService';
import { useRosterWorkspace } from './useRosterWorkspace';
import styles from './RosterWorkspacePanel.module.css';

function getRosterError(cause: unknown): string {
  if (cause instanceof ZodError) {
    return cause.issues[0]?.message ?? 'Check the student details.';
  }
  return cause instanceof Error ? cause.message : 'The roster could not be updated.';
}

function displayStudentName(student: StudentRecord): string {
  return student.preferredName ?? student.name;
}

interface ExistingStudentFormProps {
  context: LearnerContext;
  students: StudentRecord[];
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onError: (message: string | null) => void;
  onDone: () => void;
}

function ExistingStudentForm({
  context,
  students,
  busy,
  onBusyChange,
  onError,
  onDone,
}: ExistingStudentFormProps) {
  const [studentId, setStudentId] = useState('');
  const [studentQuery, setStudentQuery] = useState('');
  const [role, setRole] = useState('');
  const normalizedQuery = studentQuery.trim().toLocaleLowerCase('en');
  const filteredStudents = useMemo(
    () =>
      students.filter((student) =>
        [student.name, student.preferredName, student.notes]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.toLocaleLowerCase('en').includes(normalizedQuery)),
      ),
    [normalizedQuery, students],
  );

  useEffect(() => {
    if (filteredStudents.some((student) => student.id === studentId)) return;
    setStudentId('');
  }, [filteredStudents, studentId]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!studentId || busy) return;

    onBusyChange(true);
    onError(null);
    try {
      await rosterMutationService.addToRoster({
        contextId: context.id,
        studentId,
        role,
      });
      setStudentId('');
      setStudentQuery('');
      setRole('');
      onDone();
    } catch (cause) {
      onError(getRosterError(cause));
    } finally {
      onBusyChange(false);
    }
  }

  return (
    <form className={styles.addCard} onSubmit={(event) => void submit(event)}>
      <div>
        <p className="page-eyebrow">Existing student</p>
        <h3>Add from Student records</h3>
        <p>
          Search all active Student records, then add one to this independent {context.kind} roster.
        </p>
      </div>
      <label>
        <span>Search all Student records</span>
        <input
          value={studentQuery}
          type="search"
          disabled={busy || students.length === 0}
          placeholder="Name, preferred name, or notes"
          onChange={(event) => setStudentQuery(event.target.value)}
        />
      </label>
      <label>
        <span>Student *</span>
        <select
          value={studentId}
          disabled={busy || filteredStudents.length === 0}
          onChange={(event) => setStudentId(event.target.value)}
        >
          <option value="">Select a student</option>
          {filteredStudents.map((student) => (
            <option key={student.id} value={student.id}>
              {displayStudentName(student)}
              {student.preferredName ? ` · ${student.name}` : ''}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Role or roster note</span>
        <input
          value={role}
          disabled={busy}
          maxLength={200}
          placeholder="Optional"
          onChange={(event) => setRole(event.target.value)}
        />
      </label>
      {students.length === 0 ? (
        <p className={styles.formNotice}>
          Every active Student is already in this roster, or no Student records have been created
          yet.
        </p>
      ) : filteredStudents.length === 0 ? (
        <p className={styles.formNotice}>No active Student records match.</p>
      ) : null}
      <button className="button button-primary" type="submit" disabled={busy || !studentId}>
        <UserPlus aria-hidden="true" size={16} />
        {busy ? 'Adding…' : 'Add student'}
      </button>
    </form>
  );
}

interface CreateStudentFormProps {
  context: LearnerContext;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onError: (message: string | null) => void;
  onDone: () => void;
}

function CreateStudentForm({
  context,
  busy,
  onBusyChange,
  onError,
  onDone,
}: CreateStudentFormProps) {
  const [values, setValues] = useState({
    name: '',
    preferredName: '',
    notes: '',
    role: '',
  });

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;

    onBusyChange(true);
    onError(null);
    try {
      const studentValues: StudentRecordValues = {
        name: values.name,
        preferredName: values.preferredName,
        notes: values.notes,
      };
      await rosterMutationService.createStudentAndAddToRoster(
        context.id,
        studentValues,
        values.role,
      );
      setValues({ name: '', preferredName: '', notes: '', role: '' });
      onDone();
    } catch (cause) {
      onError(getRosterError(cause));
    } finally {
      onBusyChange(false);
    }
  }

  return (
    <form className={styles.addCard} onSubmit={(event) => void submit(event)}>
      <div>
        <p className="page-eyebrow">New Student record</p>
        <h3>Create and add</h3>
        <p>
          The Student record remains independent from this {context.kind} and from every Individual
          planning context.
        </p>
      </div>
      <label>
        <span>Student name *</span>
        <input
          value={values.name}
          disabled={busy}
          maxLength={200}
          placeholder="e.g. Amy Chen"
          onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
        />
      </label>
      <label>
        <span>Preferred name</span>
        <input
          value={values.preferredName}
          disabled={busy}
          maxLength={200}
          placeholder="Optional"
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              preferredName: event.target.value,
            }))
          }
        />
      </label>
      <label>
        <span>Role or roster note</span>
        <input
          value={values.role}
          disabled={busy}
          maxLength={200}
          placeholder="Optional"
          onChange={(event) => setValues((current) => ({ ...current, role: event.target.value }))}
        />
      </label>
      <label className={styles.notesField}>
        <span>Student notes</span>
        <textarea
          value={values.notes}
          disabled={busy}
          rows={3}
          maxLength={5000}
          placeholder="Optional Student-level notes"
          onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))}
        />
      </label>
      <button
        className="button button-primary"
        type="submit"
        disabled={busy || !values.name.trim()}
      >
        <Plus aria-hidden="true" size={16} />
        {busy ? 'Creating…' : 'Create and add student'}
      </button>
    </form>
  );
}

type RosterTool = 'add' | null;

export function RosterWorkspacePanel({ context }: { context: LearnerContext }) {
  const state = useRosterWorkspace(context.id);
  const [query, setQuery] = useState('');
  const [activeTool, setActiveTool] = useState<RosterTool>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeArmedId, setRemoveArmedId] = useState<string | null>(null);

  useEffect(() => {
    setQuery('');
    setActiveTool(null);
    setBusy(false);
    setError(null);
    setRemoveArmedId(null);
  }, [context.id]);

  const data = state.status === 'ready' ? state.data : null;
  const memberStudentIds = useMemo(
    () => new Set(data?.snapshot.members.map((member) => member.student.id) ?? []),
    [data],
  );
  const availableStudents = useMemo(
    () => data?.activeStudents.filter((student) => !memberStudentIds.has(student.id)) ?? [],
    [data, memberStudentIds],
  );
  const normalizedQuery = query.trim().toLocaleLowerCase('en');
  const filteredMembers = useMemo(
    () =>
      data?.snapshot.members.filter(({ membership, student }) => {
        if (!normalizedQuery) return true;
        return [student.name, student.preferredName, student.notes, membership.role]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.toLocaleLowerCase('en').includes(normalizedQuery));
      }) ?? [],
    [data, normalizedQuery],
  );
  const archivedMemberCount =
    data?.snapshot.members.filter(({ student }) => student.status === 'archived').length ?? 0;
  const canEdit = context.status === 'active';

  async function removeMembership(membershipId: string): Promise<void> {
    if (!canEdit || busy) return;
    if (removeArmedId !== membershipId) {
      setRemoveArmedId(membershipId);
      setError(null);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await rosterMutationService.removeFromRoster(membershipId);
      setRemoveArmedId(null);
    } catch (cause) {
      setError(getRosterError(cause));
    } finally {
      setBusy(false);
    }
  }

  function toggleTool(tool: Exclude<RosterTool, null>): void {
    setActiveTool((current) => (current === tool ? null : tool));
    setError(null);
  }

  if (context.kind === 'individual') return null;

  return (
    <section className={`card ${styles.rosterWorkspace}`} aria-label={`Roster for ${context.name}`}>
      <div className={styles.rosterHeader}>
        <div>
          <p className="page-eyebrow">Roster</p>
          <div className={styles.titleRow}>
            <h2>Students</h2>
            <span aria-label={`${data?.snapshot.members.length ?? 0} students`}>
              {data?.snapshot.members.length ?? 0}
            </span>
          </div>
          <p>
            This {context.kind} owns an independent roster. Membership does not create a
            Class–Group–Individual hierarchy.
          </p>
        </div>
        {canEdit ? (
          <div className={styles.headerActions}>
            <button
              className={activeTool === 'add' ? 'button' : 'button button-primary'}
              type="button"
              aria-expanded={activeTool === 'add'}
              onClick={() => toggleTool('add')}
            >
              {activeTool === 'add' ? (
                <X aria-hidden="true" size={16} />
              ) : (
                <UserPlus aria-hidden="true" size={16} />
              )}
              {activeTool === 'add' ? 'Close add forms' : 'Add students'}
            </button>
            <Link className="button" to={buildImportCenterHref('roster', context.id)}>
              <FileSpreadsheet aria-hidden="true" size={16} />
              Import students
            </Link>
          </div>
        ) : (
          <span className={styles.archivedRestriction}>
            Restore this {context.kind} to change its roster.
          </span>
        )}
      </div>

      {activeTool === 'add' && canEdit && data ? (
        <div className={styles.addGrid} aria-label="Add students to roster">
          <ExistingStudentForm
            context={context}
            students={availableStudents}
            busy={busy}
            onBusyChange={setBusy}
            onError={setError}
            onDone={() => setActiveTool(null)}
          />
          <CreateStudentForm
            context={context}
            busy={busy}
            onBusyChange={setBusy}
            onError={setError}
            onDone={() => setActiveTool(null)}
          />
        </div>
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {archivedMemberCount > 0 ? (
        <div className={styles.archivedWarning} role="status">
          <AlertTriangle aria-hidden="true" size={18} />
          <span>
            {archivedMemberCount} archived Student
            {archivedMemberCount === 1 ? '' : 's'} remain in this roster. Restore or remove them
            explicitly; no membership is changed automatically.
          </span>
        </div>
      ) : null}

      <div className={styles.rosterTools}>
        <div className={styles.searchControl} role="search" aria-label="Current roster search">
          <Search aria-hidden="true" size={16} />
          <input
            className={styles.rosterSearchInput}
            value={query}
            type="search"
            placeholder="Search this roster"
            aria-label="Search this roster"
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? (
            <button
              className={styles.clearSearch}
              type="button"
              aria-label="Clear roster search"
              onClick={() => setQuery('')}
            >
              <X aria-hidden="true" size={15} />
            </button>
          ) : null}
        </div>
        <span role="status">
          Showing {filteredMembers.length} of {data?.snapshot.members.length ?? 0}
        </span>
      </div>

      {state.status === 'loading' ? (
        <p className={styles.stateMessage} role="status">
          Loading roster…
        </p>
      ) : state.status === 'error' ? (
        <div className={styles.readError} role="alert">
          <AlertTriangle aria-hidden="true" size={18} />
          <span>{state.message}</span>
        </div>
      ) : filteredMembers.length > 0 ? (
        <ul className={styles.memberList} aria-label={`Students in ${context.name}`}>
          {filteredMembers.map(({ membership, student }) => {
            const displayName = displayStudentName(student);
            const armed = removeArmedId === membership.id;
            return (
              <li key={membership.id}>
                <article
                  className={styles.memberCard}
                  aria-label={`${displayName}, ${
                    student.status === 'archived' ? 'archived' : 'active'
                  } student`}
                >
                  <span className={styles.studentIcon}>
                    <Users aria-hidden="true" size={18} />
                  </span>
                  <div className={styles.studentIdentity}>
                    <div>
                      <h3>{displayName}</h3>
                      {student.preferredName ? <span>{student.name}</span> : null}
                    </div>
                    <div className={styles.memberBadges}>
                      {membership.role ? <span>{membership.role}</span> : null}
                      {student.status === 'archived' ? (
                        <span className={styles.archivedBadge}>
                          <Archive aria-hidden="true" size={13} /> Archived
                        </span>
                      ) : null}
                    </div>
                    {student.notes ? <p>{student.notes}</p> : null}
                  </div>
                  {canEdit ? (
                    <div className={styles.removeActions}>
                      <button
                        className={armed ? styles.confirmRemove : 'button'}
                        type="button"
                        disabled={busy}
                        onClick={() => void removeMembership(membership.id)}
                      >
                        {armed ? `Confirm remove ${displayName}` : 'Remove'}
                      </button>
                      {armed ? (
                        <button
                          className="button"
                          type="button"
                          disabled={busy}
                          onClick={() => setRemoveArmedId(null)}
                        >
                          Keep
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ul>
      ) : data?.snapshot.members.length === 0 ? (
        <div className={styles.emptyRoster}>
          <Users aria-hidden="true" size={26} />
          <div>
            <h3>No students in this roster</h3>
            <p>Add an existing Student record, create one, or import a CSV or Excel roster.</p>
          </div>
        </div>
      ) : (
        <div className={styles.emptyRoster}>
          <Search aria-hidden="true" size={24} />
          <div>
            <h3>No matching students</h3>
            <p>Change the search or clear it to show the full roster.</p>
          </div>
        </div>
      )}
    </section>
  );
}

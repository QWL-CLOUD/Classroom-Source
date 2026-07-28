import {
  AlertTriangle,
  Archive,
  BookOpen,
  CalendarCheck2,
  CheckCircle2,
  ClipboardList,
  Layers3,
  Link2,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { ZodError } from 'zod';

import type { StudentRecord } from '@/domain/models/entities';

import { rosterMutationService, type StudentRecordValues } from './rosterMutationService';
import type {
  StudentContextReference,
  StudentProfileSnapshot,
} from './studentDirectoryReadService';
import { useStudentDirectory } from './useStudentDirectory';
import styles from './StudentDirectoryWorkspace.module.css';

type StudentStatus = StudentRecord['status'];

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

function getStudentError(cause: unknown): string {
  if (cause instanceof ZodError) {
    return cause.issues[0]?.message ?? 'Check the Student details.';
  }
  return cause instanceof Error ? cause.message : 'The Student record could not be updated.';
}

function contextHref(reference: StudentContextReference): string {
  const parameters = new URLSearchParams({
    directory: 'contexts',
    schoolYear: reference.context.schoolYearId,
    context: reference.context.id,
    status: reference.context.status,
    workspace: reference.context.kind === 'individual' ? 'student' : 'roster',
  });
  return `#/learners?${parameters.toString()}`;
}

function RelationshipSection({
  title,
  emptyMessage,
  references,
  icon,
}: {
  title: string;
  emptyMessage: string;
  references: readonly StudentContextReference[];
  icon: ReactNode;
}) {
  return (
    <section className={styles.relationshipSection}>
      <div className={styles.sectionHeading}>
        <span>{icon}</span>
        <h3>{title}</h3>
        <strong>{references.length}</strong>
      </div>
      {references.length > 0 ? (
        <ul aria-label={title}>
          {references.map((reference) => (
            <li key={reference.context.id}>
              <a
                href={contextHref(reference)}
                aria-label={`Open ${reference.context.name} ${
                  reference.context.kind === 'individual' ? 'Student link' : 'roster'
                }`}
              >
                <span>
                  <strong>{reference.context.name}</strong>
                  <small>
                    {reference.schoolYearLabel}
                    {reference.role ? ` · ${reference.role}` : ''}
                  </small>
                </span>
                <span
                  className={
                    reference.context.status === 'archived'
                      ? styles.archivedBadge
                      : styles.activeBadge
                  }
                >
                  {reference.context.status === 'archived' ? 'Archived' : 'Active'}
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.emptyRelationship}>{emptyMessage}</p>
      )}
    </section>
  );
}

function StudentCreatePanel({
  busy,
  onBusyChange,
  onCreated,
  onCancel,
}: {
  busy: boolean;
  onBusyChange: (value: boolean) => void;
  onCreated: (student: StudentRecord) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState({
    name: '',
    preferredName: '',
    notes: '',
  });
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    onBusyChange(true);
    setError(null);
    try {
      const created = await rosterMutationService.createStudent(values);
      onCreated(created);
    } catch (cause) {
      setError(getStudentError(cause));
      onBusyChange(false);
    }
  }

  return (
    <section className={`card ${styles.createPanel}`} aria-label="Add Student">
      <div className={styles.createHeading}>
        <div>
          <p className="page-eyebrow">New canonical identity</p>
          <h2>Add Student</h2>
          <p>
            Create one Student record. No Class, Group, or Individual relationship is added
            automatically.
          </p>
        </div>
        <button className="button" type="button" disabled={busy} onClick={onCancel}>
          <X aria-hidden="true" size={16} /> Cancel
        </button>
      </div>
      <form onSubmit={(event) => void submit(event)}>
        <label>
          <span>Student name *</span>
          <input
            autoFocus
            value={values.name}
            disabled={busy}
            maxLength={200}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
          />
        </label>
        <label>
          <span>Preferred name</span>
          <input
            value={values.preferredName}
            disabled={busy}
            maxLength={200}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                preferredName: event.target.value,
              }))
            }
          />
        </label>
        <label className={styles.notesField}>
          <span>Student notes</span>
          <textarea
            value={values.notes}
            disabled={busy}
            rows={4}
            maxLength={5000}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                notes: event.target.value,
              }))
            }
          />
        </label>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.formActions}>
          <button
            className="button button-primary"
            type="submit"
            disabled={busy || !values.name.trim()}
          >
            <Plus aria-hidden="true" size={16} />
            {busy ? 'Adding…' : 'Add Student'}
          </button>
        </div>
      </form>
    </section>
  );
}

function StudentProfile({ profile }: { profile: StudentProfileSnapshot }) {
  const { student } = profile;
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState({
    name: student.name,
    preferredName: student.preferredName ?? '',
    notes: student.notes ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [archiveArmed, setArchiveArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEditing(false);
    setValues({
      name: student.name,
      preferredName: student.preferredName ?? '',
      notes: student.notes ?? '',
    });
    setBusy(false);
    setArchiveArmed(false);
    setError(null);
  }, [student.id, student.name, student.notes, student.preferredName]);

  async function save(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await rosterMutationService.updateStudent(student.id, values);
      setEditing(false);
    } catch (cause) {
      setError(getStudentError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(): Promise<void> {
    if (busy) return;
    if (student.status === 'active' && !archiveArmed) {
      setArchiveArmed(true);
      setEditing(false);
      setError(null);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (student.status === 'active') {
        await rosterMutationService.archiveStudent(student.id);
      } else {
        await rosterMutationService.restoreStudent(student.id);
      }
      setArchiveArmed(false);
    } catch (cause) {
      setError(getStudentError(cause));
    } finally {
      setBusy(false);
    }
  }

  const relationshipCount =
    profile.classMemberships.length +
    profile.groupMemberships.length +
    profile.individualContexts.length;

  return (
    <section
      className={styles.profile}
      aria-label={`Student profile for ${displayStudentName(student)}`}
    >
      <section className={`card ${styles.profileHeader}`}>
        <div className={styles.profileIdentity}>
          <span className={styles.profileAvatar}>
            <UserRound aria-hidden="true" size={26} />
          </span>
          <div>
            <p className="page-eyebrow">Student profile</p>
            <h2>{displayStudentName(student)}</h2>
            {student.preferredName ? <span>{student.name}</span> : null}
          </div>
        </div>
        <div className={styles.profileActions}>
          <span
            aria-label={`Student status: ${student.status === 'archived' ? 'Archived' : 'Active'}`}
            className={student.status === 'archived' ? styles.archivedBadge : styles.activeBadge}
          >
            {student.status === 'archived' ? 'Archived' : 'Active'}
          </span>
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={() => {
              setEditing((current) => !current);
              setArchiveArmed(false);
              setError(null);
            }}
          >
            {editing ? <X aria-hidden="true" size={16} /> : <Pencil aria-hidden="true" size={16} />}
            {editing ? 'Cancel edit' : 'Edit Student'}
          </button>
          <button
            className={archiveArmed ? styles.confirmArchive : 'button'}
            type="button"
            disabled={busy}
            onClick={() => void toggleStatus()}
          >
            {student.status === 'archived' ? (
              <RotateCcw aria-hidden="true" size={16} />
            ) : (
              <Archive aria-hidden="true" size={16} />
            )}
            {busy
              ? 'Updating…'
              : student.status === 'archived'
                ? 'Restore Student'
                : archiveArmed
                  ? 'Confirm archive Student'
                  : 'Archive Student'}
          </button>
        </div>
      </section>

      {archiveArmed ? (
        <div className={styles.archiveNotice} role="alert">
          <AlertTriangle aria-hidden="true" size={18} />
          <span>
            Archive this Student? {relationshipCount} Class, Group, or Individual relationship
            {relationshipCount === 1 ? '' : 's'} will remain attached and visible. Nothing is
            deleted.
          </span>
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={() => setArchiveArmed(false)}
          >
            Keep active
          </button>
        </div>
      ) : null}

      {editing ? (
        <section className={`card ${styles.editPanel}`} aria-label="Edit Student">
          <label>
            <span>Student name *</span>
            <input
              autoFocus
              value={values.name}
              disabled={busy}
              maxLength={200}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </label>
          <label>
            <span>Preferred name</span>
            <input
              value={values.preferredName}
              disabled={busy}
              maxLength={200}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  preferredName: event.target.value,
                }))
              }
            />
          </label>
          <label className={styles.notesField}>
            <span>Student notes</span>
            <textarea
              value={values.notes}
              disabled={busy}
              rows={4}
              maxLength={5000}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
            />
          </label>
          <div className={styles.formActions}>
            <button
              className="button button-primary"
              type="button"
              disabled={busy || !values.name.trim()}
              onClick={() => void save()}
            >
              <Save aria-hidden="true" size={16} />
              {busy ? 'Saving…' : 'Save Student'}
            </button>
          </div>
        </section>
      ) : (
        <section className={`card ${styles.notesCard}`}>
          <p className="page-eyebrow">Student notes</p>
          {student.notes ? (
            <p>{student.notes}</p>
          ) : (
            <p className={styles.emptyNotes}>No Student-level notes.</p>
          )}
        </section>
      )}

      <section className={styles.summaryGrid} aria-label="Student record summary">
        <article>
          <BookOpen aria-hidden="true" size={19} />
          <strong>{profile.teachingSummary.planCount}</strong>
          <span>Plans</span>
        </article>
        <article>
          <CalendarCheck2 aria-hidden="true" size={19} />
          <strong>{profile.teachingSummary.sessionCount}</strong>
          <span>Sessions</span>
          <small>{profile.teachingSummary.completedSessionCount} completed</small>
        </article>
        <article>
          <Link2 aria-hidden="true" size={19} />
          <strong>{profile.teachingSummary.supportRecordCount}</strong>
          <span>Support records</span>
        </article>
        <article>
          <ClipboardList aria-hidden="true" size={19} />
          <strong>{profile.teachingSummary.openTaskCount}</strong>
          <span>Open tasks</span>
        </article>
      </section>

      <div className={styles.relationshipGrid}>
        <RelationshipSection
          title="Class memberships"
          emptyMessage="This Student is not in a Class roster."
          references={profile.classMemberships}
          icon={<Users aria-hidden="true" size={18} />}
        />
        <RelationshipSection
          title="Group memberships"
          emptyMessage="This Student is not in a Group roster."
          references={profile.groupMemberships}
          icon={<Layers3 aria-hidden="true" size={18} />}
        />
        <RelationshipSection
          title="Individual workspaces"
          emptyMessage="No Individual planning context links to this Student."
          references={profile.individualContexts}
          icon={<UserRound aria-hidden="true" size={18} />}
        />
      </div>

      <div className={styles.ownershipNotice} role="note">
        <CheckCircle2 aria-hidden="true" size={18} />
        <span>
          These are read-through summaries. Plans, Sessions, Tasks, and Support records remain owned
          by their original Class, Group, or Individual context.
        </span>
      </div>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

export function StudentDirectoryWorkspace({
  selectedStudentId,
  onSelectStudent,
}: {
  selectedStudentId?: string;
  onSelectStudent: (student: StudentRecord) => void;
}) {
  const state = useStudentDirectory(selectedStudentId);
  const [status, setStatus] = useState<StudentStatus>('active');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const data = state.status === 'ready' ? state.data : null;
  const selectedStudent = data?.selectedProfile?.student;

  useEffect(() => {
    if (selectedStudent) setStatus(selectedStudent.status);
  }, [selectedStudent?.id, selectedStudent?.status]);

  const filteredRows = useMemo(
    () =>
      (data?.rows ?? []).filter(
        ({ student }) => student.status === status && studentMatches(student, query),
      ),
    [data, query, status],
  );

  useEffect(() => {
    const firstRow = filteredRows[0];
    if (selectedStudentId || !firstRow) return;
    onSelectStudent(firstRow.student);
  }, [filteredRows, onSelectStudent, selectedStudentId]);

  function chooseStatus(nextStatus: StudentStatus): void {
    setStatus(nextStatus);
    setQuery('');
    const first = data?.rows.find(({ student }) => student.status === nextStatus);
    if (first) onSelectStudent(first.student);
  }

  if (state.status === 'loading') {
    return (
      <div className={`card ${styles.statePanel}`} role="status">
        Loading Students…
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className={`card ${styles.errorPanel}`} role="alert">
        <AlertTriangle aria-hidden="true" size={22} />
        <span>{state.message}</span>
      </div>
    );
  }

  const readyData = state.data;

  return (
    <section className={styles.studentsWorkspace} aria-label="Students directory">
      {creating ? (
        <StudentCreatePanel
          busy={busy}
          onBusyChange={setBusy}
          onCancel={() => {
            setCreating(false);
            setBusy(false);
          }}
          onCreated={(student) => {
            setBusy(false);
            setCreating(false);
            setStatus('active');
            onSelectStudent(student);
          }}
        />
      ) : null}

      <div className={styles.layout}>
        <section className={`card ${styles.directory}`} aria-label="Student records">
          <div className={styles.directoryHeader}>
            <div>
              <p className="page-eyebrow">Canonical identities</p>
              <h2>Students</h2>
            </div>
            <button
              className="button button-primary"
              type="button"
              onClick={() => setCreating(true)}
            >
              <Plus aria-hidden="true" size={16} /> Add Student
            </button>
          </div>

          <div className={styles.searchControl} role="search">
            <Search aria-hidden="true" size={16} />
            <input
              type="search"
              value={query}
              aria-label="Search Students"
              placeholder="Search Students"
              onChange={(event) => setQuery(event.target.value)}
            />
            {query ? (
              <button type="button" aria-label="Clear Student search" onClick={() => setQuery('')}>
                <X aria-hidden="true" size={15} />
              </button>
            ) : null}
          </div>

          <div className={styles.statusTabs} role="group" aria-label="Student lifecycle">
            <button
              type="button"
              aria-pressed={status === 'active'}
              className={status === 'active' ? styles.activeStatusTab : ''}
              onClick={() => chooseStatus('active')}
            >
              Active <span>{readyData.activeCount}</span>
            </button>
            <button
              type="button"
              aria-pressed={status === 'archived'}
              className={status === 'archived' ? styles.activeStatusTab : ''}
              onClick={() => chooseStatus('archived')}
            >
              Archived <span>{readyData.archivedCount}</span>
            </button>
          </div>

          {filteredRows.length > 0 ? (
            <ul className={styles.studentList} aria-label={`${status} Students`}>
              {filteredRows.map((row) => {
                const selected = row.student.id === selectedStudentId;
                return (
                  <li key={row.student.id}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      aria-label={`Open Student ${displayStudentName(row.student)}`}
                      className={selected ? styles.selectedStudent : ''}
                      onClick={() => onSelectStudent(row.student)}
                    >
                      <span className={styles.studentIcon}>
                        <UserRound aria-hidden="true" size={18} />
                      </span>
                      <span>
                        <strong>{displayStudentName(row.student)}</strong>
                        {row.student.preferredName ? <small>{row.student.name}</small> : null}
                        <em>
                          {row.classCount} Class · {row.groupCount} Group · {row.individualCount}{' '}
                          Individual
                        </em>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={styles.emptyDirectory} role="status">
              No matching {status} Students.
            </p>
          )}
        </section>

        {readyData.selectedProfile ? (
          <StudentProfile profile={readyData.selectedProfile} />
        ) : (
          <div className={`card ${styles.emptyProfile}`}>
            <UserRound aria-hidden="true" size={30} />
            <div>
              <h2>No Student selected</h2>
              <p>Select a Student record or add a new one.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

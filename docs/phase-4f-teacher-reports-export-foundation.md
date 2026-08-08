# Phase 4F — Teacher Reports & Export Foundation

## Goal

Turn existing source-traceable learner Evidence into a safe teacher-internal report without adding a
new persisted report domain or inferring instructional judgments that the teacher did not record.

## Product contract

The Phase 4F foundation includes one report: **Learner Evidence Summary**.

Its scope is explicit and URL-backed:

- School Year;
- one learner;
- School Year / This Week / Last Week / custom period;
- Active / Archived / All Evidence lifecycle status;
- All / Score / Proficiency / Observation kind.

The report consumes the existing Learner Progress v1 read model. It does not query a parallel source
of truth or reinterpret Evidence.

## Preview and provenance

The report preview presents:

- recorded Evidence count and separate Score / Proficiency / Observation counts;
- Evidence date, title, lifecycle status, and explicit recorded value;
- teacher-authored observation and notes when present;
- linked Context, Assessment, Session, and Standards;
- Current / Archived / Historical snapshot / Unavailable source provenance.

An empty report means only that no recorded Evidence matches the selected filters. It is not an
Evidence-gap inference and does not imply learner failure.

## CSV export

CSV export is local browser download only. It:

- uses UTF-8 with BOM for spreadsheet compatibility;
- quotes commas, quotes, and multiline teacher-authored text;
- protects formula-like cell prefixes (`=`, `+`, `-`, `@`) from spreadsheet execution;
- includes report scope and source-status provenance;
- performs no upload, sharing, or background transmission.

## Print

The same report representation is print-ready. Print media hides Classroom navigation, top bar,
filters, and actions while retaining the report title, learner, School Year, period/filter disclosure,
Evidence rows, provenance, and Teacher Internal boundary. Browser Save as PDF is sufficient for the
foundation; there is no PDF-generation dependency.

## Navigation

- Reports appears under **Reflect**.
- Learner Progress exposes **Open report** only when a learner scope is selected and carries the
  selected School Year, learner, period, lifecycle, and kind filters.
- `#/export` remains stable for compatibility, but its user-facing label is **Backup & Recovery**.

## Explicit non-goals

Phase 4F does not add:

- saved reports, report templates, snapshots, export history, or report persistence;
- family/student-facing reports, email, sharing, publishing, or cloud upload;
- PDF generation;
- grades, mastery, readiness, ranking, universal progress/growth scores;
- expected-Evidence models or true Evidence-gap inference;
- averaging/normalization across heterogeneous scores or proficiency scales;
- AI interpretation or summarization of teacher-authored narrative.

## Persistence and compatibility

- Database schema: v17 unchanged.
- Portable Backup schema: v17 unchanged.
- Learner Progress contract: v1 unchanged.
- App version: `20.0.0-pilot.1` unchanged.

Phase 4F is read/derive/present/download/print only. Any future request that requires saved report
state is a separate persistence decision and must be audited before a DB migration.

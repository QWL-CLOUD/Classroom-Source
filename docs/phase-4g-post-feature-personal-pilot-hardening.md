# Phase 4G — Post-Feature Personal Pilot Hardening

## Goal

Bring the current Phase 4A–4F product surface back under one personal-pilot reliability contract
without adding a new business domain, persisted workflow state, or product inference.

## Baseline

- canonical baseline: `main @ f3b8481459d29853e9037ddf0a7b38ad76c16751`;
- app version: `20.0.0-pilot.1`;
- DB schema: v17;
- Portable Backup schema: v17.

## Scope

### Current pilot readiness coverage

The dedicated `personal-pilot-readiness.spec.ts` remains the only WebKit pilot specification. It now
protects the current critical surface rather than the earlier pre-Insights pilot only:

- first School Year persistence;
- privacy-safe System Health diagnostics;
- portable Backup download;
- Today and Calendar;
- Teaching Reflection;
- Teaching Insights;
- Teaching Review;
- Learner Progress;
- Teacher Reports;
- 390px containment, navigation focus, and critical accessibility;
- Session completion → Session Evidence → Learner Progress → Session → Teaching Reflection → Today;
- Learner Progress → Reports → CSV handoff.

The full historical E2E suite still runs only in Chromium. WebKit remains a targeted Safari-relevant
pilot contract rather than a duplicate of every Chromium scenario.

### Long-running synthetic dataset regression

A Chromium-only deterministic scenario seeds a synthetic three-School-Year teacher workspace with:

- 24 Students;
- 96 explicit roster memberships;
- 60 Lesson Plans;
- 180 Sessions;
- retained Teaching Reflections;
- 576 Assessment Evidence records across Score, Proficiency, and Observation;
- 120 Tasks;
- 90 Calendar Events;
- 15 Library items;
- 12 Standards.

The scenario verifies that Today, Week, Learner Progress, Reports, System Health, Backup download,
reload, and historical-year Reports remain usable. It is a functional data-volume regression, not a
timing benchmark.

### Recovery failure regression

Backup & Recovery now has explicit browser-level coverage that malformed JSON and integrity-tampered
backup files:

- do not create a restore preview;
- do not replace current user data;
- do not create safety snapshots, restore runs, or restore quarantine records.

The BackupRecoveryService also explicitly verifies that repeated restores retain only the five most
recent safety snapshots while restore history remains available.

### Release documentation closure

Personal-pilot, testing, README, and roadmap documentation are aligned with the current v17 product
surface and the post-Phase-4F release contract.

## Retained boundaries

Phase 4G does not add:

- a DB or backup migration;
- saved pilot/release state;
- new Reports or Insights;
- grades, mastery, readiness, learner ranking, progress/growth scores, or Evidence-gap inference;
- AI interpretation or recommendations;
- service worker/PWA/offline asset caching;
- cloud sync, accounts, tenancy, permissions, or school-wide publishing;
- automatic scheduling;
- bundle splitting or XLSX warning cleanup unless a measured pilot defect requires it later.

DB schema v17, Portable Backup v17, and app version `20.0.0-pilot.1` remain unchanged.

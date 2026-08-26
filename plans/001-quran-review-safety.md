# Plan 001: Prevent malformed Quran state and duplicate review folding

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If a STOP condition occurs, stop and report; do not improvise.
> This plan is for an isolated executor worktree. Do not commit, push, deploy,
> change Firebase, or alter user data.

> **Drift check (run first)**: `git diff --stat c3ca4b0 --
> src/lib/syncDecision.ts src/lib/syncDecision.test.ts
> src/lib/quran/session.ts src/lib/quran/session.test.ts
> src/lib/quran/schedule.ts src/lib/quran/schedule.test.ts`
> The planned baseline is commit `c3ca4b0` from 2026-08-26. If any listed
> file differs from that baseline, compare the live code before proceeding.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `c3ca4b0`, 2026-08-26
- **Issue**: none
- **Status**: REJECTED — the scoped findings were fixed independently in the current approved hardening change; dispatching this stale plan would duplicate edits.

## Why this matters

Quran state is partly persisted in localStorage and partly represented in the
sync snapshot. A malformed saved session can otherwise pass the current shape
check and reach UI code with an invalid index or malformed step. Separately,
cloud adoption must notice Quran-only changes, and repeated same-day ratings
for the same page range must not inflate the spaced-review interval or lapse
count. The safe result keeps every original record and changes only validation,
comparison, and the pure schedule calculation.

## Current state

- `src/lib/syncDecision.ts` — pure cloud-adoption predicates. `cloudHasUnseen`
  checks many id/date sets and deletion maps but, at the planned baseline,
  does not inspect `quranHifz` or `quranKhatma`.
- `src/lib/quran/session.ts` — localStorage resume snapshot. At the planned
  baseline, `loadSession` parses JSON, checks only date/array/non-empty/index,
  and returns the unvalidated value.
- `src/lib/quran/schedule.ts` — folds all rated `sessions` and `reviews` after
  sorting by date. At the planned baseline, two events with the same date and
  page range are both folded.

The existing project convention is pure helpers with Vitest coverage in the
adjacent `*.test.ts` file. Preserve Arabic comments, existing types, local
storage keys, AppData shapes, and the current review ladder. Do not introduce a
new persisted field or migration.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Target tests | `npx vitest run src/lib/syncDecision.test.ts src/lib/quran/session.test.ts src/lib/quran/schedule.test.ts` | All target tests pass |
| Lint | `npm run lint` | Exit 0 |
| Full tests | `npm test` | All repository tests pass |
| Build | `npm run build` | Static export succeeds and version check passes |

## Scope

**In scope** (the only files to modify):

- `src/lib/syncDecision.ts`
- `src/lib/syncDecision.test.ts`
- `src/lib/quran/session.ts`
- `src/lib/quran/session.test.ts`
- `src/lib/quran/schedule.ts`
- `src/lib/quran/schedule.test.ts`

**Out of scope**:

- Firebase rules, Firestore/R2 data, Worker deployment, or any cloud state.
- `src/lib/sync.ts` media upload protocol and attachment URL handling.
- Backup/import formats and `src/components/settings/BackupCard.tsx`.
- UI components, styles, `CLAUDE.md`, `AGENTS.md`, package dependencies, and
  version files.
- Deleting, rewriting, or migrating existing Quran records.

## Steps

### Step 1: Validate a saved session defensively

Add a small pure/runtime validation path used by `loadSession`. Validate the
date, non-empty steps, index bounds, and the discriminated shape of each
`SessionStep` (including finite numeric ids/page values where the current
types require them). Validate the numeric `SessionTally` fields as finite
non-negative integers. If any check fails, return `null` and leave the raw
localStorage value untouched. Keep valid old snapshots loadable.

Add tests for valid resume, malformed JSON, wrong date, negative/out-of-range
index, missing/unknown step kind, and malformed tally. Use the existing
localStorage test setup in `src/lib/quran/session.test.ts`.

**Verify**: `npx vitest run src/lib/quran/session.test.ts` → all tests pass.

### Step 2: Include Quran state in unseen-cloud detection

Extend `cloudHasUnseen` without changing merge or deletion semantics:

- Detect a cloud Hifz plan/state that is newer or has a plan identifier not
  present locally.
- Detect new session, review, mistake, or deleted-record identifiers.
- Detect Khatma page-log dates and forward progress/completion that local state
  lacks.
- Do not treat a cloud snapshot that is merely missing data as unseen; this
  function must not erase or downgrade local state.

Add symmetric tests that prove Quran-only cloud changes are detected and a
cloud snapshot with no forward change is not falsely adopted. Preserve the
existing guard comment that new AppData collections must be added to both
`hasData` and `cloudHasUnseen`.

**Verify**: `npx vitest run src/lib/syncDecision.test.ts` → all tests pass.

### Step 3: Deduplicate same-day same-range schedule events

In the pure event preparation path, retain the original sessions/reviews but
fold at most the latest event for the same calendar date and page range. Use
the event timestamp/order only to select the winner; do not delete records or
change the AppData schema. Events on different dates, ranges, or with a
different selected latest rating must continue to contribute normally.

Add tests showing that repeated same-day ratings do not inflate `lapses` or
the folded interval, while a different date/range still folds independently.

**Verify**: `npx vitest run src/lib/quran/schedule.test.ts` → all tests pass.

### Step 4: Run repository gates and inspect scope

Run the target tests, then `npm run lint`, `npm test`, and `npm run build`.
Review `git diff --check` and `git status --short`; only the six in-scope
files may be modified in the executor worktree.

**Verify**: all commands exit 0; no Firebase or user-data file is changed.

## Test plan

- `src/lib/quran/session.test.ts`: malformed localStorage is ignored without
  throwing; valid snapshots remain resumable.
- `src/lib/syncDecision.test.ts`: Quran Hifz/Khatma forward changes wake cloud
  adoption; no false positive for equal or older cloud state.
- `src/lib/quran/schedule.test.ts`: same-day same-range duplicate ratings are
  latest-wins for scheduling, while independent events still fold.
- Model the tests after the existing pure-function tests in the same files; do
  not require Firebase, R2, or a browser network.

## Done criteria

- [ ] Malformed session snapshots return `null` without changing localStorage.
- [ ] Quran-only forward cloud changes return `true` from `cloudHasUnseen`.
- [ ] Same-day same-range duplicate ratings do not inflate schedule state.
- [ ] `npm test`, `npm run lint`, and `npm run build` exit 0.
- [ ] No files outside the six-file scope are modified.
- [ ] No Firebase/R2/backup data or rules are changed.

## STOP conditions

- The baseline symbols or types differ materially from the current-state
  description.
- Correct validation appears to require changing persisted data or a public
  backup format.
- Quran sync changes appear to require changing Firebase rules or deployment.
- A verification command fails twice or reveals an unrelated pre-existing
  failure; report it instead of broadening the patch.

## Maintenance notes

Future Quran collections must be added to both `hasData` and
`cloudHasUnseen`. If event timestamps become optional in imported historical
records, preserve deterministic input order as the tie-breaker. If the
persisted session schema changes, add a deliberate compatibility test instead
of weakening the validator.

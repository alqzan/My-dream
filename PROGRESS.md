# PROGRESS

Owner-approved scope after the Stage 0 review. The owner chose to implement
**only item 11**; everything else was reviewed and deliberately left out
(most of the "critical" items were already implemented, differently or
better — see reasons below).

## Approved / in scope

- [ ] **11. Edit habits and reading logs**
      - Add `updateHabit` and `updateReadingLog` store actions.
      - Habits: edit name/icon/color from the "manage" mode in HabitTracker.
      - Reading logs: a reading-sessions list on the reading page with
        edit + delete; ReadingLogForm gains an edit mode. Editing a log does
        not re-advance the book's `currentPage` (kept decoupled, matching the
        existing `deleteReadingLog` behavior; `currentPage` stays editable via
        the book form).

## Reviewed and NOT implemented (owner's decision: do only 11)

- 1. Firestore 1MB photo risk — SKIPPED. Already solved: photos live in
     per-hash docs under `userData/{space}/photos/{hash}` with a manifest;
     the main doc stays small. A Firebase Storage migration would regress the
     login-free model.
- 2. Surface sync errors (toast + retry) — DEFERRED. Errors are caught and
     shown as an "offline" indicator; toast + backoff not added.
- 3. Multi-device merge before save — DEFERRED. Live subscription + hasData
     guard already reduce the risk; per-collection id merge not added.
- 4. JSON backup — SKIPPED. Already implemented in BackupCard (export +
     validated import + undo); only a merge-vs-replace choice is missing.
- 5. Mood cleanup — DEFERRED. Form no longer writes mood; display/analytics
     leftovers remain but are harmless.
- 6. Local-time date strings — SKIPPED. Already implemented app-wide
     (`toDateStr`/`parseDate`/`today`/`calcStreak`/`getMonthDates`).
- 7. Recurring (yearly month / dayOfMonth up to 31) — DEFERRED. Backfill of
     all missed periods already works; day cap and yearly month picker not added.
- 8. Dark mode audit — SKIPPED. Handled centrally via `.dark` remaps in
     globals.css; per-component `dark:` variants unnecessary.
- 9. Service worker — SKIPPED. Already present (public/sw.js + SWRegister,
     basePath-scoped).
- 10. uid → crypto.randomUUID — DEFERRED. Cosmetic; current uid is fine.
- 12. Vitest + CI — DEFERRED.
- 13. bankParser (Arabic digits) — DEFERRED. Thousands separators already
      handled; Arabic-Indic digit amounts still unsupported.
- 14. Journal filter chips — DEFERRED. Text search + month grouping exist.
- 15. Income-vs-expense chart — DROPPED. App is expense-only; no income data
      to chart.
- 16. README — DEFERRED.

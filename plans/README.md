# Implementation Plans

Generated for the approved `/improve execute` review on 2026-08-26. Execute the
plan in the order below. The plan is intentionally limited to Quran state
validation, sync-adoption detection, and review scheduling; it must not alter
Firebase, user data, backup formats, or deployed services.

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 001 | Prevent malformed Quran state and duplicate review folding | P1 | M | — | REJECTED — findings fixed independently in the approved security-hardening change |

## Dependency notes

- None.

## Findings considered and rejected

- Attachment URL scheme handling and R2 body-digest validation are not in this
  plan because they are handled by the separate approved security hardening
  change; do not duplicate or broaden those changes.
- Firebase production rules are not a source-code task here; they remain a
  read-only follow-up requiring Firebase Console access and explicit review.

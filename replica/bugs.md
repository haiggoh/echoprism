# EchoPrism Bug Tracker

Format: `ID | Severity | Flow | Title | Steps to Reproduce | Expected | Actual | Evidence | Status | Fixed By`

---

## Fixed 2026-11-02 (parity-audit batch 3)

| ID | Severity | Flow | Title | Status | Fixed By |
|----|----------|------|-------|--------|----------|
| E2E-1 | S3 | Smart Links | axe scan failed on heading level in the Smart Links panel | Fixed | `67ef910c` |
| E2E-2 | S3 | F04 podcast | spec waited for a "Subscribed to …" button that the directory row no longer shows | Fixed | `67ef910c` |

Current state: full e2e suite 33/33 green (8 capture-only skips), vitest/cargo/tsc/eslint all green on `fix/parity-audit-2026-11-02` @ `041cdb6e`. No open S1-S4 entries.

---

## S1 - Critical (Data Loss, Security, Payments, Core Flow Blocked)

*None yet*

---

## S2 - Major (Feature Broken, No Workaround)

*None yet*

---

## S3 - Minor (Broken with Workaround, Visibly Wrong)

*None yet*

---

## S4 - Cosmetic

*None yet*

---

## To Check (Might Be Issues)

*None yet*

---

## Fixed Bugs

*None yet*

---

## Bug Report Template

```markdown
## BUG-XXXX | S? | F? | Title

### Steps to Reproduce
1. Step one
2. Step two
3. Step three

### Expected
What should happen

### Actual
What actually happens

### Evidence
- Screenshot: `replica/clone-screens/BUG-XXXX.png`
- Video: `replica/clone-screens/BUG-XXXX.mp4`
- Console logs: ```
  [paste relevant logs]
  ```

### Severity
S1/S2/S3/S4

### Flow
F01-F12

### Status
Open / In Progress / Fixed / Won't Fix

### Fixed By
Commit hash / PR #
```
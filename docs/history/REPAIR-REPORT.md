# ProNotes critical repair report

## Changes made
- `src/storage/backup.ts`: hardened `mergeBankMax` against dangerous property names, prototype pollution, primitive nested bucket values, non-finite/negative counts, and malformed input. Valid counts merge by maximum.
- `src/app/prefs.ts`: backup preference restoration now skips all keys ending in `consent` (case-insensitive), preserving the local user's consent decisions.
- `tests/unit/layout-import.test.ts`: OpenBangla import fixture now reads the legacy Probhat fixture directly from `builtin-layouts.json` instead of assuming Probhat is part of the currently enabled `BUILTIN_LAYOUTS` catalogue. This preserves the catalogue policy while continuing to test the parser against a complete real layout.
- `tests/unit/audit-fixes.test.ts`: added regression coverage for malformed nested bank data. Existing security, idempotence, and consent assertions remain intact.

## Root causes
1. Layout test assumed `probhat` was in the active public catalogue; the catalogue intentionally exposes only approved layouts, so `.find()` returned `undefined`.
2. `mergeBankMax` used `for...in` and direct assignment on untrusted nested objects, allowing `__proto__` assignment and primitive nested targets.
3. `restorePrefs` restored every syntactically valid key, including voice/AI consent keys.

## Verification
`npm ci --ignore-scripts --no-audit --no-fund` timed out in this environment. Therefore TypeScript, Vitest, production build, and Playwright were not run here. The patch is source-reviewed but **not verified green**. Run the required commands in the local repository before merge/deploy.

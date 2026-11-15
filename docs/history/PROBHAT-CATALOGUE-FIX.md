# ProNotes Probhat built-in catalogue fix

## Root cause
`tests/unit/layout-import.test.ts` compares the imported Keyman Bangla Probhat keyboard with `BUILTIN_LAYOUTS.find(l => l.id === 'probhat')`. The authoritative `builtin-layouts.json` still contains the verified `probhat` map, but `src/bornona-engine/layouts.ts` deliberately omitted it from the exported catalogue. The lookup therefore returned `undefined` and the test crashed before comparing mappings.

## Changes
- Re-expose the existing `probhat` entry from `builtin-layouts.json` in `BUILTIN_LAYOUTS`; no key mapping was recreated or altered.
- Fail clearly at module initialization if the required source entry is unexpectedly missing.
- Improve the test assertion so a future catalogue regression reports a descriptive assertion before accessing `.map`.

## Scope
Only `src/bornona-engine/layouts.ts` and `tests/unit/layout-import.test.ts` are changed for this focused fix. Existing Bijoy Classic and UniBijoy entries are retained. ProNotes-specific layouts remain separate.

## Verification
- Confirmed the JSON source contains `id: "probhat"`, name `Probhat`, and 62 mapped keys.
- Confirmed the exact mappings used by the test exist: KeyK, KeyA, KeyZ, KeyR, Digit1, Slash.
- `npm ci` was attempted with Node v22.16.0 / npm 10.9.2 but timed out in this environment. The extracted `node_modules` therefore lacked Vitest, TypeScript and Vite executables; unit tests, typecheck and build could not be run here.
- Run `npm ci`, `npm test -- tests/unit/layout-import.test.ts`, `npm run typecheck`, `npm test`, and `npm run build` locally before merging.

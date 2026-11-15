# ProNotes Probhat catalogue exposure repair

## Root cause
The previous fix added the historical `probhat` mapping to `BUILTIN_LAYOUTS`. That catalogue is intentionally limited to the four approved public layouts: `pronotes`, `pronotes-phonetic`, `bijoy-classic`, and `unibijoy`. Adding `probhat` fixed the importer test by violating the public catalogue contract, causing `engine.test.ts` to fail.

## Correct repair
- Removed `probhat` from the public `BUILTIN_LAYOUTS` catalogue.
- Kept the historical Probhat source mapping in `builtin-layouts.json` for the OpenBangla import compatibility test only.
- Made the legacy test fixture lookup explicit so a missing source fixture produces a clear assertion rather than an undefined `.map` crash.
- Did not expose Probhat through `availableLayouts()` or `findLayout()`.

## Verification
Static source review confirms the public catalogue contains only the two approved built-in entries, which combine with the two ProNotes layouts to make exactly four. Automated tests/typecheck/build were not run in this environment. Run:
`npm test -- tests/unit/engine.test.ts tests/unit/layout-import.test.ts`
`npm run typecheck`
`npm test`
`npm run build`

# ProNotes ZIP Repair Audit

## Scope
Reconciled the uploaded `ProNotes-mobile-keyboard-ui-shortcuts-ready-to-push.zip` against the uploaded `pronotes -Backup.zip`, targeting the TypeScript API mismatches shown in the supplied GitHub Actions log. No Git push or deployment was performed.

## Identified causes
1. The new archive omitted the prior `src/app/layout-files.ts`, `src/bornona-engine/kmx.ts`, `src/bornona-engine/openbangla.ts`, and `src/editor/rules-typing.ts` modules that exist in the backup. This left import sites referring to missing Bornona/KMX APIs.
2. `src/bornona-engine/index.ts` in the new archive no longer re-exported `parseOpenBanglaLayout` or the KMX module exports.
3. `layout-files.ts` constructs imported layouts with `format` and `kmx`, but the `NewLayout` type did not declare those optional properties.
4. `src/editor/ansi-typing.ts` had made `bijoyFontAt` and `marksWithFont` module-private although the restored rules typing implementation imports them.
5. `src/storage/backup.ts` had made `mergeBankMax` private although the prior test imports it.
6. The new archive omitted `tests/unit/layout-import.test.ts`, `tests/unit/audit-fixes.test.ts`, and `tests/e2e/v2-layout-files.spec.ts` that are present in the backup; restored these coverage files.

## Repairs applied
- Restored the omitted KMX parser, OpenBangla parser, layout file importer, rules-based typing implementation, and corresponding tests from the supplied backup.
- Re-exported the OpenBangla and KMX APIs from the Bornona engine barrel.
- Extended `NewLayout` with optional `format` and `kmx` metadata, retaining compatibility with ordinary Avro/OpenBangla layouts.
- Re-exported the ANSI typing helpers and backup merge helper used by the restored implementation/tests.

## Verification status
- ZIP integrity is checked after packaging.
- Full `npm ci`, TypeScript typecheck, unit tests, lint, and production build were **not verified** in this environment. Dependency installation did not complete before timeout. Do not treat this archive as CI-passing until those commands run in the target Node environment.
- No behavior outside the reported compile/API mismatch was intentionally modified during this repair pass. Review the four requested UI/keyboard feature changes separately before deployment.

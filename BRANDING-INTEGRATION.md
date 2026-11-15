# ProNotes branding integration patch

Integrates the six supplied SVG logo masters into the uploaded ProNotes source.

## Changes
- Adds all six original SVG masters under `public/branding/`.
- Adds runtime aliases for transparent light logo, dark-surface logo, monogram and app icon.
- Replaces text-only branding in the empty-document header and sidebar with the official logo.
- Selects the dark logo for explicit dark theme and OS dark preference.
- Regenerates PWA/app icons from the supplied app-icon SVG master.
- Adds favicon and Apple Home Screen metadata.
- Updates PWA theme colour and precaches SVG branding assets for offline use.
- Adds E2E assertions for branding asset availability.

## Apply
Copy the contents of `pronotes-main/` over the repository root, preserving directory structure. A unified patch is also supplied separately.

## Validation status
Source changes and asset paths were reviewed. Automated TypeScript/build/test validation is **not confirmed**: `npm ci` timed out in this environment, and the available partial `node_modules` tree lacks `vite/client`. Do not treat this package as CI-green until `npm ci`, `npm run typecheck`, `npm test`, and `npm run build` pass in the target environment.

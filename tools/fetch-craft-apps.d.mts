/** Types for the parts of fetch-craft-apps.mjs the unit tests use. */
interface CraftRef { id: string; repo: string; version: string }
export const zipName: (a: CraftRef) => string;
export const zipUrl: (a: CraftRef) => string;
export function fetchApps(outDir: string, opts?: { manifest?: string; cacheDir?: string }): Promise<unknown>;

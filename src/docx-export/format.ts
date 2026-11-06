/** Page format settings. Kept apart from the exporter so the app can load the (large) exporter only when needed. */
export interface DocFormat {
  /** Font name written into the file (SutonnyOMJ by default; it need not be installed here). */
  font: string;
  /** Body text, points (owner's drafts: 14). */
  size: number;
  /** "বড় শিরোনাম" style, points (owner's drafts: 23). */
  titleSize: number;
  /** 1.5 or 2.0 */
  lineSpacing: number;
}
export const DEFAULT_FORMAT: DocFormat = { font: 'SutonnyOMJ', size: 14, titleSize: 23, lineSpacing: 1.5 };

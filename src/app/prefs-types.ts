/** Voice settings kept with the other preferences (corrections live in IndexedDB). */
export interface VoicePrefs {
  /** 'auto' = follow the typing mode (bn-BD / en-US). */
  lang: string;
  commands: boolean;
  banglaDigits: boolean;
}

export const DEFAULT_VOICE_PREFS: VoicePrefs = { lang: 'auto', commands: true, banglaDigits: true };

export function voiceLang(v: VoicePrefs, bangla: boolean): string {
  return v.lang && v.lang !== 'auto' ? v.lang : bangla ? 'bn-BD' : 'en-US';
}

/** Gridlines (screen only; never printed or exported). Numbers follow the owner's chosen list (53.x). */
export interface GridPrefs {
  on: boolean;
  /** 53.1–53.4 */
  size: 'sm' | 'md' | 'lg' | 'custom';
  /** custom spacing in cm */
  custom: number;
  /** 53.5–53.8 */
  dir: 'grid' | 'h' | 'v' | 'dots';
  /** 53.9: horizontal lines follow the line spacing */
  lineGrid: boolean;
  /** 53.10 */
  margins: boolean;
  /** 53.11 */
  center: boolean;
  /** 53.13 */
  tables: boolean;
  /** 53.15 */
  strength: 'light' | 'medium' | 'dark';
}
export const DEFAULT_GRID: GridPrefs = { on: false, size: 'md', custom: 0.5, dir: 'grid', lineGrid: false, margins: true, center: false, tables: true, strength: 'light' };
export const GRID_CM: Record<Exclude<GridPrefs['size'], 'custom'>, number> = { sm: 0.25, md: 0.5, lg: 1 };

export interface ViewPrefs {
  /** Print Layout (pages) or Web Layout (one long sheet). */
  layout: 'print' | 'web';
  /** 'width' = fit the page width, 'page' = whole page, or a percentage. */
  zoom: 'width' | 'page' | number;
  ruler: boolean;
  rulerUnit: 'cm' | 'in';
  grid: GridPrefs;
}
export const DEFAULT_VIEW: ViewPrefs = { layout: 'print', zoom: 'width', ruler: false, rulerUnit: 'cm', grid: DEFAULT_GRID };

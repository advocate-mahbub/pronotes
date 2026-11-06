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

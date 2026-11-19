/** Voice modes (decisions.md 77): Live and record-to-text, each on or off, each with its own model. */
export interface VoiceModes {
  /** Live voice: words appear while speaking (a tap on 🎙). */
  live: boolean;
  /** Record, then Gemini writes it (🎙 held, or the only mode when Live is off). */
  rec: boolean;
  /** Live model; '' = the default (gemini-3.1-flash-live-preview). */
  liveModel: string;
  /** Model for record-to-text; '' = the same as the AI model. */
  recModel: string;
}
export const DEFAULT_VOICE_MODES: VoiceModes = { live: true, rec: true, liveModel: '', recModel: '' };

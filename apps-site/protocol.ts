/** What ProNotes and the apps site say to each other (decisions.md 81). Types only. */
import type { LayoutMap } from '../src/bornona-engine/layouts';
import type { ToggleKey } from '../src/bornona-engine/engine';

/** ProNotes' typing settings, sent to every app page: { pn: 'cfg', cfg }. */
export interface BridgeConfig {
  bangla: boolean;
  map: LayoutMap;
  vowelForming: boolean;
  oldReph: boolean;
  fixChandra?: boolean;
  hasantaRules?: boolean;
  toggleKey?: ToggleKey;
}
/** From an app page to ProNotes: { pn: 'hello' } (send me the settings) or { pn: 'toggle' } (switch the language). */
export type FromApp = { pn: 'hello' } | { pn: 'toggle' };

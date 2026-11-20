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
/**
 * From an app page to ProNotes: 'hello' (send me the settings), 'toggle' (switch the language), 'ctx' (a text
 * box has focus or not, and the text before its caret — for ProNotes' on-screen keyboard; decisions.md 82).
 */
export type FromApp = { pn: 'hello' } | { pn: 'toggle' } | { pn: 'ctx'; editable: boolean; before: string };
/** From ProNotes' on-screen keyboard to the app page with the text box (decisions.md 82). */
export type ToApp = { pn: 'cfg'; cfg: BridgeConfig } | { pn: 'type'; text: string } | { pn: 'back' } | { pn: 'enter' } | { pn: 'tab' }
  | { pn: 'move'; dx: number; dy: number; select: boolean } | { pn: 'osk'; on: boolean };

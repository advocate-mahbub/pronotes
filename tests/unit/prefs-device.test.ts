// @vitest-environment happy-dom
import { it, expect } from 'vitest';
import { allPrefs, restorePrefs, save } from '../../src/app/prefs';

it("this device's name stays out of backups and is never restored onto another device", () => {
  localStorage.clear();
  save('device.name', 'Office PC');
  save('drive.keep', 5);
  expect(allPrefs()).toEqual({ 'drive.keep': 5 });
  localStorage.clear();
  save('device.name', 'iPad');
  restorePrefs({ 'device.name': 'Office PC', 'drive.keep': 20 });
  expect(JSON.parse(localStorage.getItem('pronotes.device.name')!)).toBe('iPad');
  expect(JSON.parse(localStorage.getItem('pronotes.drive.keep')!)).toBe(20);
});

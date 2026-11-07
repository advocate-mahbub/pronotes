/** Save a file, or hand it to the device's share sheet (WhatsApp, Mail, Files …) where that is possible. */
import { saveFile } from '../storage/download';

export const canShareFiles = (): boolean => {
  try {
    const f = new File(['x'], 'x.txt', { type: 'text/plain' });
    return typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [f] });
  } catch {
    return false;
  }
};

export type DeliverResult = 'saved' | 'shared' | 'cancelled' | 'failed';

export async function deliver(blob: Blob, filename: string, mode: 'save' | 'share', title?: string): Promise<DeliverResult> {
  if (mode === 'share') {
    const file = new File([blob], filename, { type: blob.type });
    if (canShareFiles() && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: title ?? filename });
        return 'shared';
      } catch (e) {
        if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
        // fall back to saving
      }
    }
  }
  return (await saveFile(filename, blob)) ? 'saved' : 'cancelled';
}

export const MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  txt: 'text/plain;charset=utf-8',
  md: 'text/markdown;charset=utf-8',
  html: 'text/html;charset=utf-8',
  png: 'image/png',
  zip: 'application/zip',
} as const;

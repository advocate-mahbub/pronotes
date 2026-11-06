/**
 * Offer a file to the user. In a normal browser this is a download (on iPad: the Files "Save" sheet).
 * Inside a claude.ai preview, downloads go through the viewer's `downloads` capability.
 */
type Downloads = { save: (r: { filename: string; data: Blob }) => Promise<unknown> };
type ClaudeHost = { use?: (name: string) => Promise<Downloads | null> };

export async function saveFile(filename: string, blob: Blob): Promise<boolean> {
  const host = (window as unknown as { claude?: ClaudeHost }).claude;
  if (host && typeof host.use === 'function') {
    try {
      const dl = await host.use('downloads');
      if (dl) {
        await dl.save({ filename, data: blob });
        return true;
      }
    } catch (err) {
      if ((err as { code?: string })?.code === 'declined') return false;
      throw err;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
  return true;
}

/** File name for a draft title (keeps Bangla, removes characters Windows/iOS do not allow). Small on purpose: no exporter code. */
export function docxFileName(title: string, ext = '.docx'): string {
  return (title.replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim() || 'ProNotes') + ext;
}

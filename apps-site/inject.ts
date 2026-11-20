/** Every page of an installed app gets the ProNotes bridge first, before its own scripts. */
export function withBridge(html: string): string {
  const tag = '<script src="/bridge.js"></script>';
  const m = html.match(/<head[^>]*>/i);
  if (m) return html.replace(m[0], m[0] + tag);
  const h = html.match(/<html[^>]*>/i);
  return h ? html.replace(h[0], h[0] + '<head>' + tag + '</head>') : tag + html;
}

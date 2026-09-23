/** A rendered piece of a release note's body. */
export type ReleaseBodyBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] };

/**
 * Parses a plain-text body: blank lines separate paragraphs, lines starting
 * with `- ` are bullets (consecutive bullets form one list). Single line breaks
 * inside a paragraph are kept as `\n`. The result is text only — the panel
 * renders it as React text nodes, never as HTML.
 */
export function parseReleaseBody(body: string | null | undefined): ReleaseBodyBlock[] {
  if (!body) return [];
  const blocks: ReleaseBodyBlock[] = [];
  for (const chunk of body.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/)) {
    let para: string[] = [];
    let list: string[] = [];
    const flushPara = () => { if (para.length) blocks.push({ type: 'paragraph', text: para.join('\n') }); para = []; };
    const flushList = () => { if (list.length) blocks.push({ type: 'list', items: list }); list = []; };
    for (const raw of chunk.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('- ')) {
        flushPara();
        const item = line.slice(2).trim();
        if (item) list.push(item);
      } else {
        flushList();
        para.push(line);
      }
    }
    flushPara();
    flushList();
  }
  return blocks;
}

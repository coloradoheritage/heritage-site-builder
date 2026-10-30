// Split a page's markdown into editable "sections" for the visual editor.
//
// Pages are stored as a single markdown string; the visual editor historically
// turned that into ONE big "Existing page text" block, so staff could not move,
// insert, or edit parts of a page independently. These helpers split the markdown
// at headings so each heading-led chunk becomes its own section block (and any
// leading text before the first heading becomes a section too). Joining the
// sections back reproduces the markdown, so this is a lossless, reversible view
// transform — the stored markdown is never mutated by the split itself.

const HEADING = /^#{1,6}\s/;
const FENCE = /^\s*(```|~~~)/;

function normalize(markdown: string): string {
  return (markdown ?? "")
    .replace(/\r\n?/g, "\n") // normalize line endings
    .replace(/\n{3,}/g, "\n\n") // collapse runs of blank lines
    .trim();
}

function trimBlankEdges(lines: string[]): string {
  return lines.join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
}

/**
 * Split markdown into section strings, cutting before each top-level heading.
 * Content before the first heading is its own section. Headings inside fenced
 * code blocks are ignored. Returns [] for empty/whitespace-only input.
 */
export function splitMarkdownIntoSections(markdown: string): string[] {
  const text = normalize(markdown);
  if (!text) return [];
  const lines = text.split("\n");
  const sections: string[] = [];
  let current: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (FENCE.test(line)) inFence = !inFence;
    const isHeading = !inFence && HEADING.test(line);
    if (isHeading && current.some((l) => l.trim() !== "")) {
      sections.push(trimBlankEdges(current));
      current = [];
    }
    current.push(line);
  }
  if (current.some((l) => l.trim() !== "")) sections.push(trimBlankEdges(current));
  return sections;
}

/**
 * Join section strings back into a single markdown document. Inverse of
 * splitMarkdownIntoSections for rendering purposes: joinSections(split(md))
 * equals normalize(md).
 */
export function joinSections(sections: string[]): string {
  return sections
    .map((section) => section.replace(/^\n+/, "").replace(/\n+$/, ""))
    .filter((section) => section.trim() !== "")
    .join("\n\n");
}

/** A page is "already split" once it holds more than one text section block. */
export function hasMultipleSections(markdown: string): boolean {
  return splitMarkdownIntoSections(markdown).length > 1;
}

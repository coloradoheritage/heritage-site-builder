import "@puckeditor/core/puck.css";
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import {
  Link as LinkIcon, Unlink, Monitor, Smartphone, PanelLeftOpen, ExternalLink, Settings,
  Bold, Italic, Underline as UnderlineIcon, Heading2, Heading3, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Plus, Minus, ImagePlus, Table as TableIcon, ArrowUp, ArrowDown, Trash2, Check, X,
} from "lucide-react";
import { marked } from "marked";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { TextAlign } from "@tiptap/extension-text-align";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import type { CmsArticle, CmsPage, CmsStaff, SiteContentState } from "@workspace/api-client-react";
import { asPuckPayload, PuckBlockRenderer, type PuckPayload } from "./puck-render";
import { PhotoUploader } from "./site-editors";
import { SiteImage } from "./site-image";
import { AnnouncementBar, PublicSiteFooter, PublicSiteHeader } from "./site-chrome";
import { DocumentsContext } from "./markdown";
import { HomePage } from "./home-page";
import type { SiteContentExt } from "../lib/cms";
import { splitMarkdownIntoSections, joinSections } from "../lib/sections";
import { staffProfilePath } from "../../directory-helpers.mjs";

type SectionBlock = PuckPayload["content"][number];

function safeLinkHref(value: string) {
  const href = value.trim();
  if (!href || /^\s*(javascript|vbscript|data):/i.test(href) || href.startsWith("//")) return "";
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(href)) return href;
  if (/^[a-z][a-z\d+.-]*:/i.test(href)) return "";
  return `https://${href}`;
}

function markdownToRichText(markdown: string) {
  const result = marked(markdown, { async: false, gfm: true, breaks: false });
  return typeof result === "string" ? result : "";
}
function htmlToMarkdown(html: string) {
  let value = html
    .replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (_match, table: string) => {
      const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
        [...row[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)].map((cell) => cell[1]
          .replace(/<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, "[$3]($2)")
          .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**")
          .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*")
          .replace(/<[^>]*>/g, "").trim()),
      ).filter((row) => row.length);
      if (!rows.length) return "";
      const width = Math.max(...rows.map((row) => row.length));
      const rowText = (row: string[]) => `| ${Array.from({ length: width }, (_, index) => row[index] ?? "").join(" | ")} |`;
      return `${rowText(rows[0])}\n| ${Array.from({ length: width }, () => "---").join(" | ")} |\n${rows.slice(1).map(rowText).join("\n")}\n\n`;
    })
    .replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, "# $1\n\n")
    .replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, "## $1\n\n")
    .replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi, "### $1\n\n")
    .replace(/<h[4-6]\b[^>]*>([\s\S]*?)<\/h[4-6]>/gi, "#### $1\n\n")
    .replace(/<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, "[$3]($2)")
    .replace(/<img\b[^>]*alt=(["'])(.*?)\1[^>]*src=(["'])(.*?)\3[^>]*\/?>/gi, "![$2]($4)")
    .replace(/<img\b[^>]*src=(["'])(.*?)\1[^>]*alt=(["'])(.*?)\3[^>]*\/?>/gi, "![$4]($2)")
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*")
    .replace(/<u\b[^>]*>([\s\S]*?)<\/u>/gi, "$1")
    .replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_m, text: string) => text.replace(/<p\b[^>]*>|<\/p>/gi, "").split(/<br\s*\/?>/i).map((line) => `> ${line}`).join("\n") + "\n\n")
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n")
    .replace(/<\/(ul|ol)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "  \n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<p\b[^>]*>/gi, "")
    .replace(/<hr\b[^>]*\/?>/gi, "\n\n---\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, "\"").replace(/&#39;/gi, "'");
  return value.replace(/\n{3,}/g, "\n\n").trim();
}

// --- In-canvas (Google Sites style) editing -------------------------------
// We render the editable page ourselves instead of inside Puck's draggable
// canvas: Puck's block wrapper owns the click (select block) and the drag (move
// block) on every component, which is why typing never reached the text. Here
// each text section is its own Tiptap editor on the page, so staff click and
// type in place. A floating toolbar (BubbleMenu) appears over the selection.
// StarterKit already bundles bold/italic/underline/link/lists/headings; we add
// alignment and brand-only text color. Everything saves back through the same
// draft/publish pipeline that Puck used.
const sectionExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] }, // guardrail: no H1 (reserved for the page title)
    link: { openOnClick: false, autolink: false, HTMLAttributes: { rel: "noopener noreferrer" } },
  }),
  TextStyle,
  Color,
  TextAlign.configure({ types: ["heading", "paragraph"] }),
];

const SECTION_COLORS: Array<[string, string]> = [["Navy", "#1A365D"], ["Gold", "#D4AF37"], ["Slate", "#2D3748"]];

function FmtButton({ active, onClick, title, children, wide }: { active?: boolean; onClick: () => void; title: string; children: ReactNode; wide?: boolean }) {
  return <button type="button" className={`cms-fmt-btn${wide ? " is-wide" : ""}${active ? " is-active" : ""}`} title={title} aria-label={title} aria-pressed={!!active}
    onMouseDown={(event) => event.preventDefault()} onClick={onClick}>{children}</button>;
}

function SectionToolbar({ editor, pages }: { editor: Editor; pages: CmsPage[] }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [pagePath, setPagePath] = useState("");
  const [href, setHref] = useState("");
  const [newTab, setNewTab] = useState(false);
  const [linkError, setLinkError] = useState("");
  const applyLink = () => {
    const target = safeLinkHref(pagePath || href);
    if (!target) { setLinkError("Choose a page or enter a supported web address."); return; }
    editor.chain().focus().extendMarkRange("link").setLink({ href: target, target: newTab ? "_blank" : null, rel: newTab ? "noopener noreferrer" : null }).run();
    setLinkOpen(false); setPagePath(""); setHref(""); setNewTab(false); setLinkError("");
  };
  return <div className="cms-fmt-bar" role="toolbar" aria-label="Text formatting" onMouseDown={(event) => event.preventDefault()}>
    <FmtButton active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold"><Bold size={15} /></FmtButton>
    <FmtButton active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic"><Italic size={15} /></FmtButton>
    <FmtButton active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline"><UnderlineIcon size={15} /></FmtButton>
    <span className="cms-fmt-sep" />
    <FmtButton wide active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading"><Heading2 size={15} /> Heading</FmtButton>
    <FmtButton wide active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Subheading"><Heading3 size={15} /> Subheading</FmtButton>
    <FmtButton active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bulleted list"><List size={15} /></FmtButton>
    <FmtButton active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list"><ListOrdered size={15} /></FmtButton>
    <span className="cms-fmt-sep" />
    <FmtButton active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()} title="Align left"><AlignLeft size={15} /></FmtButton>
    <FmtButton active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()} title="Align center"><AlignCenter size={15} /></FmtButton>
    <FmtButton active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()} title="Align right"><AlignRight size={15} /></FmtButton>
    <span className="cms-fmt-sep" />
    <FmtButton active={editor.isActive("link")} onClick={() => setLinkOpen((value) => !value)} title="Add or edit link"><LinkIcon size={15} /></FmtButton>
    <FmtButton onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()} title="Remove link"><Unlink size={15} /></FmtButton>
    <span className="cms-fmt-colors" aria-label="Text color">
      <span className="cms-fmt-colors-label" aria-hidden="true">Color</span>
      {SECTION_COLORS.map(([label, color]) => <button key={color} type="button" className="cms-fmt-color" title={`${label} text`} aria-label={`${label} text`}
        onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().setColor(color).run()}><span style={{ backgroundColor: color }} /></button>)}
    </span>
    {linkOpen && <div className="cms-link-pop" onMouseDown={(event) => event.stopPropagation()}>
      <label>Link to a page
        <select value={pagePath} onChange={(event) => { setPagePath(event.target.value); setHref(""); setLinkError(""); }} data-testid="section-link-page">
          <option value="">Choose a page…</option>
          {pages.map((page) => <option key={page.path} value={page.path}>{page.label || page.title || page.path}</option>)}
        </select>
      </label>
      <label>Or a web address
        <input value={href} onChange={(event) => { setHref(event.target.value); setPagePath(""); setLinkError(""); }} placeholder="https://…" data-testid="section-link-url" />
      </label>
      <label className="cms-link-newtab"><input type="checkbox" checked={newTab} onChange={(event) => setNewTab(event.target.checked)} /> Open in a new tab</label>
      {linkError && <p className="cms-link-error" role="alert">{linkError}</p>}
      <div className="cms-link-actions">
        <button type="button" className="cms-btn cms-btn-primary" onClick={applyLink}>Add link</button>
        <button type="button" className="cms-btn" onClick={() => { setLinkOpen(false); setLinkError(""); }}>Cancel</button>
      </div>
    </div>}
  </div>;
}

// One Tiptap editor on the page. Commits on blur, but only when the content
// actually changed from the editor's own baseline — so merely clicking through a
// section (or a stray teardown blur) never marks an untouched section as edited.
function EditableSection({ id, richText, pages, onCommit, autoFocus }: {
  id: string;
  richText?: string;
  pages: CmsPage[];
  onCommit: (id: string, html: string) => void;
  autoFocus?: boolean;
}) {
  const baseline = useRef<string>("");
  const editor = useEditor({
    extensions: sectionExtensions,
    content: typeof richText === "string" && richText.trim() ? richText : "<p></p>",
    editable: true,
    immediatelyRender: false,
    editorProps: { attributes: { class: "chess-prose cms-section-editor" } },
    // Move the caret into a freshly inserted section so the keyboard (and the
    // space bar) go to the text, not to the "Add a text section" button that
    // was just clicked — otherwise every space press re-inserts a section.
    onCreate: ({ editor }) => { baseline.current = editor.getHTML(); if (autoFocus) editor.commands.focus("end"); },
    onBlur: ({ editor }) => {
      if (!id) return;
      const html = editor.getHTML();
      if (html === baseline.current) return;
      baseline.current = html;
      onCommit(id, html);
    },
  });
  if (!editor) return <div className="chess-prose" dangerouslySetInnerHTML={{ __html: String(richText ?? "") }} />;
  return <>
    {/* Sit BELOW the selection so the toolbar (and the link popover under it) never
        cover the line being edited or the "Add …" buttons above the section; flip
        above only when there is no room below. shouldShow requires this editor to be
        focused, so only the active section shows a toolbar (no stale second toolbar). */}
    <BubbleMenu editor={editor} className="cms-fmt-pop" options={{ placement: "bottom", offset: 28, flip: true, shift: { padding: 8 } }}
      shouldShow={({ editor, from, to }) => editor.isEditable && editor.isFocused && from !== to}>
      <SectionToolbar editor={editor} pages={pages} />
    </BubbleMenu>
    <EditorContent editor={editor} />
  </>;
}

function PhotoAssetField({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
  const image = value && typeof value === "object" ? value as { url?: string; alt?: string; focalX?: number; focalY?: number } : {};
  const patch = (next: Partial<typeof image>) => onChange({ ...image, ...next });
  return <div className="puck-photo-field">
    <PhotoUploader label="Choose or upload this photo" defaultAlt={image.alt ?? ""} onUploaded={(url, alt) => patch({ url, alt })} />
    {image.url && <>
      <SiteImage src={image.url} alt={image.alt ?? ""} loading="lazy" style={{ objectPosition: `${image.focalX ?? 50}% ${image.focalY ?? 50}%` }} />
      <label>Photo description (required)<input value={image.alt ?? ""} onChange={(event) => patch({ alt: event.target.value })} required /></label>
      <label>Horizontal crop: {image.focalX ?? 50}%<input type="range" min="0" max="100" value={image.focalX ?? 50} onChange={(event) => patch({ focalX: Number(event.target.value) })} /></label>
      <label>Vertical crop: {image.focalY ?? 50}%<input type="range" min="0" max="100" value={image.focalY ?? 50} onChange={(event) => patch({ focalY: Number(event.target.value) })} /></label>
      <button type="button" onClick={() => onChange({ url: "", alt: "", focalX: 50, focalY: 50 })}>Remove photo</button>
    </>}
  </div>;
}

// A photo-with-text block, edited in place: heading, caption (its own Tiptap
// editor), the photo picker, and which side the photo sits on.
function PhotoBlockEditor({ block, pages, onCommit, onPatch, autoFocus }: {
  block: SectionBlock;
  pages: CmsPage[];
  onCommit: (id: string, html: string) => void;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  autoFocus?: boolean;
}) {
  const id = String(block.props.id ?? "");
  const heading = String(block.props.heading ?? "");
  const imageSide = block.props.imageSide === "right" ? "right" : "left";
  const headingRef = useRef<HTMLInputElement | null>(null);
  // Move focus into a freshly inserted photo block so the space bar does not
  // re-click the "Add a photo" button.
  useEffect(() => { if (autoFocus) headingRef.current?.focus(); }, [autoFocus]);
  return <div className={`cms-photo-block is-${imageSide}`}>
    <div className="cms-photo-media"><PhotoAssetField value={block.props.image} onChange={(value) => onPatch(id, { image: value })} /></div>
    <div className="cms-photo-body">
      <input ref={headingRef} className="cms-photo-heading" value={heading} placeholder="Heading (optional)" onChange={(event) => onPatch(id, { heading: event.target.value })} />
      <EditableSection id={id} richText={typeof block.props.richText === "string" ? block.props.richText : "<p></p>"} pages={pages} onCommit={onCommit} />
      <label className="cms-photo-side">Photo position
        <select value={imageSide} onChange={(event) => onPatch(id, { imageSide: event.target.value })}>
          <option value="left">Left of the text</option>
          <option value="right">Right of the text</option>
        </select>
      </label>
    </div>
  </div>;
}

// Flexible table: 1-4 columns, any number of rows. Uses the same data shape the
// public site already renders (TuitionTable render in puck-render.tsx), so a
// pricing table OR a typed class schedule both come out as one clean, even,
// brand-styled grid for parents.
function TableBlockEditor({ block, onPatch, autoFocus }: {
  block: SectionBlock;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  autoFocus?: boolean;
}) {
  const id = String(block.props.id ?? "");
  const heading = String(block.props.heading ?? "");
  const columns = (Array.isArray(block.props.columns) ? block.props.columns : []) as Array<{ label?: string }>;
  const rows = (Array.isArray(block.props.rows) ? block.props.rows : []) as Array<Record<string, string>>;
  const titleRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { if (autoFocus) titleRef.current?.focus(); }, [autoFocus]);
  const setCol = (i: number, label: string) => onPatch(id, { columns: columns.map((c, ci) => (ci === i ? { ...c, label } : c)) });
  const addCol = () => { if (columns.length < 4) onPatch(id, { columns: [...columns, { label: "Column" }] }); };
  const removeCol = () => { if (columns.length > 1) onPatch(id, { columns: columns.slice(0, -1) }); };
  const setCell = (r: number, c: number, val: string) => onPatch(id, { rows: rows.map((row, ri) => (ri === r ? { ...row, [`cell${c + 1}`]: val } : row)) });
  const addRow = () => onPatch(id, { rows: [...rows, { cell1: "", cell2: "", cell3: "", cell4: "" }] });
  const removeRow = (r: number) => { if (rows.length > 1) onPatch(id, { rows: rows.filter((_, ri) => ri !== r) }); };
  // Focus the clicked cell input directly on pointer-down; the surrounding
  // contentEditable=false wrapper otherwise swallows the first click.
  const focusCell = (event: ReactMouseEvent<HTMLElement>) => {
    const input = (event.target as HTMLElement).closest("td, th")?.querySelector("input");
    if (input && document.activeElement !== input) (input as HTMLInputElement).focus();
  };
  return <div className="cms-table-block" contentEditable={false} onMouseDown={focusCell}>
    <input ref={titleRef} className="cms-table-title" value={heading} placeholder="Table title (e.g. Tuition, Weekly schedule)" onChange={(event) => onPatch(id, { heading: event.target.value })} />
    <div className="cms-table-scroll"><table className="cms-edit-table">
      <thead><tr>
        {columns.map((column, ci) => <th key={ci}><input value={column.label ?? ""} placeholder={`Column ${ci + 1}`} onChange={(event) => setCol(ci, event.target.value)} aria-label={`Column ${ci + 1} heading`} /></th>)}
        <th className="cms-table-rowctl" aria-hidden="true"></th>
      </tr></thead>
      <tbody>{rows.map((row, ri) => <tr key={ri}>
        {columns.map((_column, ci) => <td key={ci}><input value={row[`cell${ci + 1}`] ?? ""} onChange={(event) => setCell(ri, ci, event.target.value)} aria-label={`Row ${ri + 1}, ${columns[ci]?.label || `column ${ci + 1}`}`} /></td>)}
        <td className="cms-table-rowctl"><button type="button" onClick={() => removeRow(ri)} disabled={rows.length <= 1} title="Remove this row" aria-label={`Remove row ${ri + 1}`}><X size={13} /></button></td>
      </tr>)}</tbody>
    </table></div>
    <div className="cms-table-controls">
      <button type="button" onClick={addRow}><Plus size={13} /> Row</button>
      <button type="button" onClick={addCol} disabled={columns.length >= 4}><Plus size={13} /> Column</button>
      <button type="button" onClick={removeCol} disabled={columns.length <= 1}><Minus size={13} /> Column</button>
    </div>
  </div>;
}

function InsertRow({ onText, onPhoto, onTable }: { onText: () => void; onPhoto: () => void; onTable: () => void }) {
  return <div className="cms-insert-row" contentEditable={false}>
    <button type="button" className="cms-insert-btn" onClick={onText}><Plus size={14} /> Add a text section</button>
    <button type="button" className="cms-insert-btn" onClick={onPhoto}><ImagePlus size={14} /> Add a photo</button>
    <button type="button" className="cms-insert-btn" onClick={onTable}><TableIcon size={14} /> Add a table</button>
  </div>;
}

let seq = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

// The editable page. Internal block state is the source of truth while mounted;
// it is persisted up through onChange (the draft/publish pipeline) but never read
// back into state, so saving never resets a live editor's caret. The parent keys
// this by the selected page so switching pages remounts with fresh content.
function SectionsEditor({ initial, base, pages, onChange }: {
  initial: SectionBlock[];
  base: PuckPayload;
  pages: CmsPage[];
  onChange: (next: PuckPayload) => void;
}) {
  const [blocks, setBlocks] = useState<SectionBlock[]>(initial);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  // Id of a just-inserted section: its editor/first field focuses on mount so the
  // keyboard goes to the new section instead of re-triggering the "Add…" button.
  const [focusId, setFocusId] = useState<string | null>(null);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  const commit = useCallback((next: SectionBlock[]) => {
    setBlocks(next);
    onChange({ ...base, content: next } as PuckPayload);
  }, [base, onChange]);

  const commitText = useCallback((id: string, html: string) => {
    commit(blocksRef.current.map((b) => (String(b.props.id) === id
      ? { ...b, props: { ...b.props, richText: html, richTextEdited: true } }
      : b)));
  }, [commit]);

  const patchBlock = useCallback((id: string, patch: Record<string, unknown>) => {
    commit(blocksRef.current.map((b) => (String(b.props.id) === id ? { ...b, props: { ...b.props, ...patch } } : b)));
  }, [commit]);

  const insertAt = (index: number, block: SectionBlock) => {
    const next = [...blocksRef.current];
    next.splice(index, 0, block);
    setFocusId(String(block.props.id ?? ""));
    commit(next);
  };
  const textBlock = (): SectionBlock => ({ type: "LegacyMarkdown", props: { id: newId("section"), markdown: "", originalMarkdown: "", richText: "<p></p>", richTextEdited: true } });
  const photoBlock = (url = "", alt = ""): SectionBlock => ({ type: "PhotoWithText", props: { id: newId("photo"), heading: "", richText: "<p></p>", richTextEdited: true, image: { url, alt, focalX: 50, focalY: 50 }, imageSide: "left" } });
  const tableBlock = (): SectionBlock => ({ type: "TuitionTable", props: { id: newId("table"), heading: "", columns: [{ label: "Column 1" }, { label: "Column 2" }], rows: [{ cell1: "", cell2: "", cell3: "", cell4: "" }, { cell1: "", cell2: "", cell3: "", cell4: "" }] } });
  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= blocksRef.current.length) return;
    const next = [...blocksRef.current];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  };
  const remove = (id: string) => {
    commit(blocksRef.current.filter((b) => String(b.props.id) !== id));
    setConfirmingId(null);
  };

  return <div className="cms-sections" data-testid="sections-editor">
    <InsertRow onText={() => insertAt(0, textBlock())} onPhoto={() => insertAt(0, photoBlock())} onTable={() => insertAt(0, tableBlock())} />
    {blocks.map((block, index) => {
      const id = String(block.props.id ?? `block-${index}`);
      return <div className="cms-section" key={id} data-testid={`section-${index}`} data-block-type={block.type}>
        {confirmingId === id
          ? <div className="cms-section-controls is-confirm" contentEditable={false}>
              <span>Delete this section?</span>
              <button type="button" className="cms-confirm-yes" onClick={() => remove(id)} data-testid={`confirm-delete-${index}`}><Check size={14} /> Delete</button>
              <button type="button" onClick={() => setConfirmingId(null)}><X size={14} /> Keep</button>
            </div>
          : <div className="cms-section-controls" contentEditable={false}>
              <button type="button" title="Move up" aria-label="Move section up" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></button>
              <button type="button" title="Move down" aria-label="Move section down" disabled={index === blocks.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></button>
              <button type="button" title="Remove section" aria-label="Remove section" onClick={() => setConfirmingId(id)} data-testid={`delete-${index}`}><Trash2 size={14} /></button>
            </div>}
        {block.type === "LegacyMarkdown"
          ? <EditableSection id={id} richText={typeof block.props.richText === "string" ? block.props.richText : undefined} pages={pages} onCommit={commitText} autoFocus={focusId === id} />
          : block.type === "PhotoWithText"
            ? <PhotoBlockEditor block={block} pages={pages} onCommit={commitText} onPatch={patchBlock} autoFocus={focusId === id} />
            : block.type === "TuitionTable"
              ? <TableBlockEditor block={block} onPatch={patchBlock} autoFocus={focusId === id} />
              : <div className="cms-nontext" contentEditable={false}><PuckBlockRenderer blocks={{ ...base, content: [block] }} /></div>}
        <InsertRow onText={() => insertAt(index + 1, textBlock())} onPhoto={() => insertAt(index + 1, photoBlock())} onTable={() => insertAt(index + 1, tableBlock())} />
      </div>;
    })}
  </div>;
}

// A text section with no real content (e.g. the starter block a brand-new page
// begins with). Used to keep empty sections out of both the editor and storage.
function isBlankTextBlock(block: SectionBlock): boolean {
  return block.type === "LegacyMarkdown"
    && !String(block.props.richText ?? "").replace(/<p>\s*<\/p>/gi, "").replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim()
    && !String(block.props.originalMarkdown ?? block.props.markdown ?? "").trim();
}

function editorPayload(input: unknown, markdown: string): PuckPayload {
  const payload = asPuckPayload(input, markdown);
  // First load of a legacy page: the whole body is one big text block. Split it at
  // headings so each heading-led chunk becomes its own movable, in-place-editable
  // section (the Google Sites feel). Once the page is saved it holds multiple blocks
  // and takes the per-block normalize path below instead, so this runs only once.
  const first = payload.content[0];
  if (payload.content.length === 1 && first.type === "LegacyMarkdown" && first.props.richTextEdited !== true) {
    const bodyBase = String(first.props.originalMarkdown ?? first.props.markdown ?? markdown);
    const sections = splitMarkdownIntoSections(bodyBase);
    if (sections.length > 1) {
      return {
        ...payload,
        content: sections.map((section, index) => ({
          type: "LegacyMarkdown",
          props: { id: `section-${index}`, markdown: section, originalMarkdown: section, richText: markdownToRichText(section), richTextEdited: false },
        })),
      } as unknown as PuckPayload;
    }
  }
  const normalized = payload.content.map((block) => {
    if (block.type !== "LegacyMarkdown") return block;
    const original = String(block.props.originalMarkdown ?? block.props.markdown ?? markdown);
    const isEdited = block.props.richTextEdited === true;
    return { ...block, props: { ...block.props, markdown: original, originalMarkdown: original, richText: isEdited && typeof block.props.richText === "string" ? block.props.richText : markdownToRichText(original), richTextEdited: isEdited } };
  }) as SectionBlock[];
  // Drop empty text sections so a brand-new page opens with no lingering blank
  // block between the "Add …" rows (staff just pick what to add first).
  return { ...payload, content: normalized.filter((block) => !isBlankTextBlock(block)) } as unknown as PuckPayload;
}

type Entry = { label: string; subtitle: string; kind: "home" | "page" | "staff" | "news" | "events"; index?: number };
type ContentState = { home?: CmsPage; pages: CmsPage[]; staff: CmsStaff[]; news: CmsArticle[]; events: CmsArticle[] };

export function VisualPageEditor({ draft, update, renderPhotoUploader, requestedKey, requestedNonce, onSelectionChange, renderSettings }: {
  draft: ContentState;
  update: (fn: (d: ContentState) => ContentState) => void;
  renderPhotoUploader?: (onUploaded: (url: string, alt: string) => void) => ReactNode;
  requestedKey?: string | null;
  requestedNonce?: number;
  onSelectionChange?: (path: string) => void;
  renderSettings?: (pageIndex: number, onClose: () => void) => ReactNode;
}) {
  const [selected, setSelected] = useState(() => requestedKey ?? "home");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [editing, setEditing] = useState(() => Boolean(requestedKey));
  const [settingsOpen, setSettingsOpen] = useState(false);
  // When another tab asks to open a specific page here (e.g. "Edit this page"
  // after creating one), jump to it and drop straight into the editing canvas.
  useEffect(() => {
    if (requestedKey) { setSelected(requestedKey); setEditing(true); }
  }, [requestedKey, requestedNonce]);
  const entries: Entry[] = [
    ...(draft.home ? [{ label: "Home page", subtitle: "/", kind: "home" as const }] : []),
    ...draft.pages.map((p, index) => ({ label: p.label || "Untitled page", subtitle: p.path, kind: "page" as const, index })).filter((entry) => !draft.pages[entry.index].archived),
    ...draft.staff.map((s, index) => ({ label: s.name, subtitle: `Staff biography · ${s.role}`, kind: "staff" as const, index })),
    ...draft.news.map((a, index) => ({ label: a.title, subtitle: `News · ${a.date}`, kind: "news" as const, index })).filter((entry) => !draft.news[entry.index].archived),
    ...draft.events.map((a, index) => ({ label: a.title, subtitle: `Event · ${a.date}`, kind: "events" as const, index })).filter((entry) => !draft.events[entry.index].archived),
  ];
  const entry = entries.find((item) => `${item.kind}:${item.index ?? ""}` === selected) ?? entries[0];
  const record = entry?.kind === "home" ? draft.home : entry?.kind === "page" ? draft.pages[entry.index!] : entry?.kind === "staff" ? draft.staff[entry.index!] : draft[entry?.kind ?? "page"]?.[entry?.index ?? 0];
  // Report the selected content's public path so the top-bar "Preview as a parent"
  // opens the page being edited, not the home page.
  const currentPath = !entry || !record ? "/"
    : entry.kind === "home" ? "/"
    : entry.kind === "staff" ? staffProfilePath(record as CmsStaff)
    : (record as CmsPage | CmsArticle).path;
  useEffect(() => { onSelectionChange?.(currentPath); }, [currentPath, onSelectionChange]);
  if (!entry || !record) return <div className="puck-empty">Add a page, profile, story, or event to begin.</div>;
  const markdown = "markdown" in record ? record.markdown : "bio" in record ? record.bio : "";
  const payload = editorPayload(record.blocks, markdown);
  const saveBlocks = (next: PuckPayload) => {
    const normalized = next.content.map((block) => {
      if (block.type !== "LegacyMarkdown") return block;
      const base = String(block.props.originalMarkdown ?? block.props.markdown ?? "");
      const richText = String(block.props.richText ?? "");
      const edited = block.props.richTextEdited === true || richText !== markdownToRichText(base);
      return { ...block, props: { ...block.props, markdown: base, originalMarkdown: base, richText, richTextEdited: edited } };
    });
    // Drop blank text sections (e.g. the empty starter block a new page begins
    // with, left behind after the real content is typed into another section) so
    // the stored page never carries an empty section.
    const savedBlocks = {
      ...next,
      content: normalized.filter((block) => !isBlankTextBlock(block as SectionBlock)),
    } as unknown as PuckPayload;
    // Rebuild the stored markdown mirror from every text section in document order,
    // so reordered/added/removed sections stay in sync. Media blocks render from
    // `blocks`; markdown is only the text fallback.
    const legacyBlocks = savedBlocks.content.filter((item) => item.type === "LegacyMarkdown");
    const hasLegacy = legacyBlocks.length > 0;
    const legacy = joinSections(legacyBlocks.map((block) => block.props.richTextEdited === true
      ? htmlToMarkdown(String(block.props.richText ?? ""))
      : String(block.props.originalMarkdown ?? block.props.markdown ?? "")));
    if (entry.kind === "home") update((d) => ({ ...d, home: { ...d.home!, blocks: savedBlocks, ...(hasLegacy ? { markdown: legacy } : {}) } }));
    else if (entry.kind === "page") update((d) => ({ ...d, pages: d.pages.map((x, i) => i === entry.index ? { ...x, blocks: savedBlocks, ...(hasLegacy ? { markdown: legacy } : {}) } : x) }));
    else if (entry.kind === "staff") update((d) => ({ ...d, staff: d.staff.map((x, i) => i === entry.index ? { ...x, blocks: savedBlocks, ...(hasLegacy ? { bio: legacy } : {}) } : x) }));
    else if (entry.kind === "news") update((d) => ({ ...d, news: d.news.map((x, i) => i === entry.index ? { ...x, blocks: savedBlocks, ...(hasLegacy ? { markdown: legacy } : {}) } : x) }));
    else if (entry.kind === "events") update((d) => ({ ...d, events: d.events.map((x, i) => i === entry.index ? { ...x, blocks: savedBlocks, ...(hasLegacy ? { markdown: legacy } : {}) } : x) }));
  };
  return <section className="cms-visual-editor">
    <header className="cms-visual-head">
      <div><span className="cms-eyebrow">Visual page editor</span><h2>Make a change, see it in place.</h2><p>Everything here stays in your private draft until you publish. Your changes save automatically as you type.</p></div>
      <div className="cms-visual-actions">
      <button type="button" className="cms-settings-toggle" aria-pressed={editing} onClick={() => setEditing((value) => !value)} data-testid="toggle-page-settings">
        {editing ? <><ExternalLink size={15} /> Preview as a parent</> : <><PanelLeftOpen size={15} /> Edit this page</>}
      </button>
      {entry.kind === "page" && renderSettings && <button type="button" className="cms-settings-toggle" aria-pressed={settingsOpen} onClick={() => setSettingsOpen((v) => !v)} data-testid="open-page-settings"><Settings size={15} /> Page settings</button>}
      <div className="cms-device-switch" aria-label="Preview size">
        <button type="button" className={device === "desktop" ? "is-selected" : ""} onClick={() => setDevice("desktop")} data-testid="preview-desktop"><Monitor size={15} /> Desktop</button>
        <button type="button" className={device === "phone" ? "is-selected" : ""} onClick={() => setDevice("phone")} data-testid="preview-phone"><Smartphone size={15} /> Phone</button>
      </div>
      </div>
    </header>
    <label className="cms-page-picker"><span>Choose content</span><select value={selected} onChange={(e) => setSelected(e.target.value)} data-testid="select-visual-content">
      {entries.map((item) => <option key={`${item.kind}:${item.index ?? ""}`} value={`${item.kind}:${item.index ?? ""}`}>{item.label} — {item.subtitle}</option>)}
    </select></label>
    <div className={`cms-puck-stage is-${device} ${editing ? "is-editing" : "preview-focused"}`}>
      {editing ? (
        <div id="cms-puck-workspace" className="cms-puck-workspace cb-site">
          <main id="main" className="cb-page">
            <header className="cb-page-head"><h1>{"label" in record ? record.label : "title" in record ? record.title : "Home page"}</h1>
              {"description" in record && record.description && <p>{record.description}</p>}
            </header>
            <SectionsEditor key={selected} initial={payload.content} base={payload} pages={draft.pages} onChange={saveBlocks} />
          </main>
          <p className="cms-puck-note">Click any text to edit it — a formatting toolbar appears below your selection. Hover a section for its move, delete, and “add” controls.</p>
        </div>
      ) : (
        <aside className={`cms-puck-preview is-${device}`}>
          <div className="cms-puck-preview-bar"><span>Parent preview · private draft</span><span>{device === "phone" ? "Phone" : "Desktop"}</span></div>
          <DocumentsContext.Provider value={(draft as SiteContentState).documents}>
          <div className="cms-puck-viewport">
            <div className="cb-site cms-puck-public-frame">
              <AnnouncementBar contentOverride={draft as SiteContentState} />
              <PublicSiteHeader editing contentOverride={draft as SiteContentState} />
              {entry.kind === "home"
                ? <HomePage content={draft as SiteContentExt} />
                : <main id="main" className="cb-page">
                  <header className="cb-page-head"><h1>{"label" in record ? record.label : "title" in record ? record.title : "Home page"}</h1>
                    {"description" in record && record.description && <p>{record.description}</p>}
                  </header>
                  <PuckBlockRenderer blocks={payload} />
                </main>}
              <PublicSiteFooter editing />
            </div>
          </div>
          </DocumentsContext.Provider>
        </aside>
      )}
    </div>
    {settingsOpen && entry.kind === "page" && renderSettings && <div className="cms-settings-drawer" role="dialog" aria-label="Page settings" onKeyDown={(e) => { if (e.key === "Escape") setSettingsOpen(false); }}>
      <button type="button" className="cms-settings-drawer-scrim" aria-label="Close page settings" onClick={() => setSettingsOpen(false)} />
      <div className="cms-settings-drawer-panel">{renderSettings(entry.index!, () => setSettingsOpen(false))}</div>
    </div>}
  </section>;
}

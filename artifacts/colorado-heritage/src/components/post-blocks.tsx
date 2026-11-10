// Blocks and the "+" insert menu for the blog post editor. Everything here edits the same block data the public
// site already renders through puck-render.tsx, so a post is just a list of blocks like any other page.
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Plus, Type, Heading2, List, ListOrdered, Quote, Image as ImageIcon, Images, PanelLeft, MessageSquareQuote,
  Minus, Info, MousePointerClick, Video, Table as TableIcon, ArrowLeft, ArrowRight, X,
} from "lucide-react";
import type { CmsPage } from "@workspace/api-client-react";
import { PhotoUploader } from "./site-editors";
import { SiteImage } from "./site-image";
import { youtubeEmbedUrl, type PuckPayload } from "./puck-render";

export type PostBlock = PuckPayload["content"][number];
type Patch = (id: string, patch: Record<string, unknown>) => void;

const text = (id: string, richText: string): PostBlock => ({ type: "LegacyMarkdown", props: { id, markdown: "", originalMarkdown: "", richText, richTextEdited: true } });
/** A new table is a text section holding the same editable grid used for tables in page text (rows and columns can be added or removed). */
export const STARTER_TABLE_HTML = '<table><thead><tr><th scope="col">Column 1</th><th scope="col">Column 2</th></tr></thead><tbody><tr><td></td><td></td></tr><tr><td></td><td></td></tr></tbody></table>';

export type BlockChoice = { id: string; label: string; description: string; icon: ReactNode; make: (id: string) => PostBlock };

/** What staff can add, in plain language. Order is the order of the "+" menu. */
export const BLOCK_CHOICES: BlockChoice[] = [
  { id: "text", label: "Text", description: "Paragraphs with bold, italics, and links.", icon: <Type size={18} />, make: (id) => text(id, "<p></p>") },
  { id: "heading", label: "Heading", description: "A big title for the next part of your post.", icon: <Heading2 size={18} />, make: (id) => text(id, "<h2></h2>") },
  { id: "bullets", label: "Bulleted list", description: "A list with bullet points.", icon: <List size={18} />, make: (id) => text(id, "<ul><li><p></p></li></ul>") },
  { id: "numbers", label: "Numbered list", description: "Steps or items in order.", icon: <ListOrdered size={18} />, make: (id) => text(id, "<ol><li><p></p></li></ol>") },
  { id: "quote", label: "Quote", description: "Set apart words someone said or wrote.", icon: <Quote size={18} />, make: (id) => text(id, "<blockquote><p></p></blockquote>") },
  { id: "photo", label: "Photo", description: "One photo with a caption, centered, wide, or to one side.", icon: <ImageIcon size={18} />, make: (id) => ({ type: "Photo", props: { id, image: { url: "", alt: "" }, caption: "", align: "center" } }) },
  { id: "photoText", label: "Photo with text", description: "A photo beside a short piece of writing.", icon: <PanelLeft size={18} />, make: (id) => ({ type: "PhotoWithText", props: { id, heading: "", richText: "<p></p>", richTextEdited: true, image: { url: "", alt: "", focalX: 50, focalY: 50 }, imageSide: "left" } }) },
  { id: "gallery", label: "Photo gallery", description: "Several photos in a tidy grid.", icon: <Images size={18} />, make: (id) => ({ type: "Gallery", props: { id, images: [] } }) },
  { id: "pullquote", label: "Pull quote", description: "A highlighted quote with who said it.", icon: <MessageSquareQuote size={18} />, make: (id) => ({ type: "Testimonial", props: { id, quote: "<p></p>", attribution: "" } }) },
  { id: "callout", label: "Callout box", description: "A colored box for something families should not miss.", icon: <Info size={18} />, make: (id) => ({ type: "Callout", props: { id, tone: "note", heading: "", text: "" } }) },
  { id: "button", label: "Button", description: "A button that sends families to a page or website.", icon: <MousePointerClick size={18} />, make: (id) => ({ type: "FamilyStepButton", props: { id, title: "", richText: "<p></p>", buttonLabel: "Learn more", href: "/contact" } }) },
  { id: "video", label: "Video (YouTube)", description: "Show a YouTube video right in the post.", icon: <Video size={18} />, make: (id) => ({ type: "VideoOrMap", props: { id, heading: "", url: "", description: "" } }) },
  { id: "table", label: "Table", description: "Rows and columns, like a schedule or price list.", icon: <TableIcon size={18} />, make: (id) => text(id, STARTER_TABLE_HTML) },
  { id: "divider", label: "Divider", description: "A thin line between two parts of the post.", icon: <Minus size={18} />, make: (id) => ({ type: "Divider", props: { id } }) },
];

const BLOCK_LABELS: Record<string, string> = {
  Photo: "Photo", PhotoWithText: "Photo with text", Gallery: "Photo gallery", Testimonial: "Pull quote", Callout: "Callout box",
  FamilyStepButton: "Button", VideoOrMap: "Video", TuitionTable: "Table", Divider: "Divider",
};
export const blockLabel = (type: string) => BLOCK_LABELS[type] ?? "";

/* ---------------- "+" insert menu ---------------- */

export function InsertMenu({ onPick, label = "Add a block", testId }: { onPick: (choice: BlockChoice) => void; label?: string; testId?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onDown = (event: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  const move = (delta: number) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(at + delta + items.length) % items.length]?.focus();
  };
  return <div className="cms-insert-menu" ref={rootRef} contentEditable={false}>
    <button ref={triggerRef} type="button" className="cms-insert-btn cms-insert-plus" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} data-testid={testId ?? "insert-menu-button"}>
      <Plus size={14} /> {label}
    </button>
    {open && <div className="cms-insert-popover" role="menu" aria-label="Choose what to add" ref={menuRef}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); setOpen(false); triggerRef.current?.focus(); }
        else if (event.key === "ArrowDown" || event.key === "ArrowRight") { event.preventDefault(); move(1); }
        else if (event.key === "ArrowUp" || event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
        else if (event.key === "Home") { event.preventDefault(); (menuRef.current?.querySelector("button") as HTMLButtonElement | null)?.focus(); }
      }}>
      {BLOCK_CHOICES.map((choice) => <button key={choice.id} type="button" role="menuitem" className="cms-insert-item" data-testid={`insert-${choice.id}`}
        onClick={() => { setOpen(false); onPick(choice); }}>
        <span className="cms-insert-icon" aria-hidden="true">{choice.icon}</span>
        <span><strong>{choice.label}</strong><small>{choice.description}</small></span>
      </button>)}
    </div>}
  </div>;
}

/* ---------------- Block editors ---------------- */

type Image = { url?: string; alt?: string };

function ReplaceablePhoto({ image, onChange, label }: { image: Image; onChange: (next: Image) => void; label: string }) {
  return <div className="cms-post-photo-field">
    {image.url && <SiteImage className="cms-post-thumb" src={image.url} alt={image.alt ?? ""} loading="lazy" />}
    {image.url
      ? <details className="cms-post-replace"><summary>Replace photo</summary><PhotoUploader label={label} defaultAlt={image.alt ?? ""} onUploaded={(url, alt) => onChange({ url, alt: alt || image.alt || "" })} /></details>
      : <PhotoUploader label={label} defaultAlt="" onUploaded={(url, alt) => onChange({ url, alt })} />}
  </div>;
}

export function PhotoBlockEditor({ block, onPatch }: { block: PostBlock; onPatch: Patch }) {
  const id = String(block.props.id ?? "");
  const image = (block.props.image && typeof block.props.image === "object" ? block.props.image : {}) as Image;
  const align = String(block.props.align ?? "center");
  return <div className="cms-post-block" data-testid="post-block-photo">
    <ReplaceablePhoto image={image} label="Choose or upload a photo" onChange={(next) => onPatch(id, { image: next })} />
    {image.url && <>
      <label>Photo description <small>(read aloud for people who cannot see the photo)</small>
        <input value={image.alt ?? ""} onChange={(event) => onPatch(id, { image: { ...image, alt: event.target.value } })} data-testid="post-photo-alt" />
      </label>
      <label>Caption <small>(optional)</small>
        <input value={String(block.props.caption ?? "")} onChange={(event) => onPatch(id, { caption: event.target.value })} data-testid="post-photo-caption" />
      </label>
      <label>Position
        <select value={align} onChange={(event) => onPatch(id, { align: event.target.value })} data-testid="post-photo-align">
          <option value="wide">Full width</option><option value="center">Centered</option>
          <option value="left">Smaller, on the left</option><option value="right">Smaller, on the right</option>
        </select>
      </label>
      <button type="button" className="cms-post-remove" onClick={() => onPatch(id, { image: { url: "", alt: "" }, caption: "" })}>Remove this photo</button>
    </>}
  </div>;
}

type GalleryImage = Image & { caption?: string };

export function GalleryBlockEditor({ block, onPatch }: { block: PostBlock; onPatch: Patch }) {
  const id = String(block.props.id ?? "");
  const images = (Array.isArray(block.props.images) ? block.props.images : []) as GalleryImage[];
  const set = (next: GalleryImage[]) => onPatch(id, { images: next });
  const swap = (i: number, j: number) => { if (j < 0 || j >= images.length) return; const next = [...images]; [next[i], next[j]] = [next[j], next[i]]; set(next); };
  return <div className="cms-post-block" data-testid="post-block-gallery">
    {images.length === 0 && <p className="cms-post-hint">No photos yet. Add the first one below.</p>}
    <ul className="cms-post-gallery">
      {images.map((image, i) => <li key={`${image.url}-${i}`}>
        <SiteImage className="cms-post-thumb" src={String(image.url ?? "")} alt={image.alt ?? ""} loading="lazy" />
        <label>Photo description<input value={image.alt ?? ""} onChange={(event) => set(images.map((x, xi) => xi === i ? { ...x, alt: event.target.value } : x))} data-testid={`gallery-alt-${i}`} /></label>
        <label>Caption <small>(optional)</small><input value={image.caption ?? ""} onChange={(event) => set(images.map((x, xi) => xi === i ? { ...x, caption: event.target.value } : x))} data-testid={`gallery-caption-${i}`} /></label>
        <span className="cms-post-gallery-actions">
          <button type="button" onClick={() => swap(i, i - 1)} disabled={i === 0} aria-label={`Move photo ${i + 1} earlier`}><ArrowLeft size={13} /></button>
          <button type="button" onClick={() => swap(i, i + 1)} disabled={i === images.length - 1} aria-label={`Move photo ${i + 1} later`}><ArrowRight size={13} /></button>
          <button type="button" onClick={() => set(images.filter((_, xi) => xi !== i))} aria-label={`Remove photo ${i + 1}`} data-testid={`gallery-remove-${i}`}><X size={13} /></button>
        </span>
      </li>)}
    </ul>
    <PhotoUploader label={images.length ? "Add another photo" : "Add a photo"} defaultAlt="" onUploaded={(url, alt) => set([...images, { url, alt, caption: "" }])} />
  </div>;
}

export function DividerBlockEditor() {
  return <div className="cms-post-block cms-post-divider" data-testid="post-block-divider"><hr className="puck-divider" /></div>;
}

export function CalloutBlockEditor({ block, onPatch }: { block: PostBlock; onPatch: Patch }) {
  const id = String(block.props.id ?? "");
  return <div className="cms-post-block" data-testid="post-block-callout">
    <label>Style
      <select value={block.props.tone === "highlight" ? "highlight" : "note"} onChange={(event) => onPatch(id, { tone: event.target.value })} data-testid="callout-tone">
        <option value="note">Note (blue)</option><option value="highlight">Highlight (gold)</option>
      </select>
    </label>
    <label>Heading <small>(optional)</small><input value={String(block.props.heading ?? "")} onChange={(event) => onPatch(id, { heading: event.target.value })} data-testid="callout-heading" /></label>
    <label>Text<textarea rows={3} value={String(block.props.text ?? "")} onChange={(event) => onPatch(id, { text: event.target.value })} data-testid="callout-text" /></label>
  </div>;
}

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const htmlToPlain = (html: string) => html.replace(/<\/p>\s*<p>/gi, "\n\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").trim();
const plainToHtml = (value: string) => value.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean).map((part) => `<p>${escapeHtml(part).replace(/\n/g, "<br>")}</p>`).join("") || "<p></p>";

export function PullQuoteBlockEditor({ block, onPatch }: { block: PostBlock; onPatch: Patch }) {
  const id = String(block.props.id ?? "");
  const [value, setValue] = useState(() => htmlToPlain(String(block.props.quote ?? "")));
  return <div className="cms-post-block" data-testid="post-block-pullquote">
    <label>Quote<textarea rows={3} value={value} onChange={(event) => { setValue(event.target.value); onPatch(id, { quote: plainToHtml(event.target.value) }); }} data-testid="pullquote-text" /></label>
    <label>Who said it <small>(optional)</small><input value={String(block.props.attribution ?? "")} onChange={(event) => onPatch(id, { attribution: event.target.value })} data-testid="pullquote-attribution" /></label>
  </div>;
}

export function ButtonBlockEditor({ block, pages, onPatch }: { block: PostBlock; pages: CmsPage[]; onPatch: Patch }) {
  const id = String(block.props.id ?? "");
  const href = String(block.props.href ?? "");
  const [value, setValue] = useState(() => htmlToPlain(String(block.props.richText ?? "")));
  const isPage = pages.some((page) => page.path === href);
  const safe = !href || /^(\/(?!\/)|https?:\/\/|mailto:|tel:)/i.test(href);
  return <div className="cms-post-block" data-testid="post-block-button">
    <label>Heading <small>(optional)</small><input value={String(block.props.title ?? "")} onChange={(event) => onPatch(id, { title: event.target.value })} data-testid="button-heading" /></label>
    <label>Text <small>(optional)</small><textarea rows={2} value={value} onChange={(event) => { setValue(event.target.value); onPatch(id, { richText: plainToHtml(event.target.value) }); }} data-testid="button-text" /></label>
    <label>Button words<input value={String(block.props.buttonLabel ?? "")} onChange={(event) => onPatch(id, { buttonLabel: event.target.value })} data-testid="button-label" /></label>
    <label>Where it goes
      <select value={isPage ? href : "__web"} onChange={(event) => onPatch(id, { href: event.target.value === "__web" ? "https://" : event.target.value })} data-testid="button-page">
        {pages.filter((page) => !page.archived).map((page) => <option key={page.path} value={page.path}>{page.label || page.path}</option>)}
        <option value="__web">A web address…</option>
      </select>
    </label>
    {!isPage && <label>Web address<input value={href} placeholder="https://…" onChange={(event) => onPatch(id, { href: event.target.value })} aria-invalid={!safe} data-testid="button-url" />
      {!safe && <small className="cms-field-error" role="alert">Start with https://, mailto:, tel:, or /</small>}</label>}
  </div>;
}

export function VideoBlockEditor({ block, onPatch }: { block: PostBlock; onPatch: Patch }) {
  const id = String(block.props.id ?? "");
  const url = String(block.props.url ?? "");
  const [raw, setRaw] = useState(() => url);
  const valid = Boolean(url);
  const invalid = raw.trim() !== "" && !youtubeEmbedUrl(raw);
  return <div className="cms-post-block" data-testid="post-block-video">
    <label>YouTube link <small>(paste the address from your browser or the Share button)</small>
      <input value={raw} placeholder="https://www.youtube.com/watch?v=…" aria-invalid={invalid}
        onChange={(event) => { setRaw(event.target.value); onPatch(id, { url: youtubeEmbedUrl(event.target.value) }); }} data-testid="video-url" />
    </label>
    {invalid && <p className="cms-field-error" role="alert" data-testid="video-error">That does not look like a YouTube video link.</p>}
    {valid && <div className="cms-post-video-preview"><iframe src={url} title="Video preview" loading="lazy" sandbox="allow-scripts allow-same-origin allow-presentation" referrerPolicy="strict-origin-when-cross-origin" /></div>}
    <label>Heading <small>(optional)</small><input value={String(block.props.heading ?? "")} onChange={(event) => onPatch(id, { heading: event.target.value })} data-testid="video-heading" /></label>
    <label>Caption <small>(optional)</small><input value={String(block.props.description ?? "")} onChange={(event) => onPatch(id, { description: event.target.value })} data-testid="video-caption" /></label>
  </div>;
}

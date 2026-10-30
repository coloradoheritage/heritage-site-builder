import { Puck, RichTextMenu, type Config, type Data, type RichtextField } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import { createContext, useContext, useState, type ReactNode } from "react";
import { Link as LinkIcon, Redo, Monitor, Smartphone, Undo, Unlink, PanelLeftClose, PanelLeftOpen, ExternalLink } from "lucide-react";
import { marked } from "marked";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import type { CmsArticle, CmsPage, CmsStaff, SiteContentState } from "@workspace/api-client-react";
import { asPuckPayload, chessPuckConfig, PuckBlockRenderer, type PuckPayload } from "./puck-render";
import { PhotoUploader } from "./site-editors";
import { SiteImage } from "./site-image";
import { AnnouncementBar, PublicSiteFooter, PublicSiteHeader } from "./site-chrome";
import { toMountainInput } from "./puck-time";
import { DocumentsContext } from "./markdown";
import { HomePage } from "./home-page";
import type { SiteContentExt } from "../lib/cms";
import { splitMarkdownIntoSections, joinSections } from "../lib/sections";
import { staffProfilePath } from "../../directory-helpers.mjs";

const LinkPagesContext = createContext<CmsPage[]>([]);

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

type RichChain = {
  focus: () => RichChain; extendMarkRange: (name: string) => RichChain; setLink: (attrs: { href: string; target: string | null; rel: string | null }) => RichChain;
  unsetLink: () => RichChain; toggleBold: () => RichChain; toggleItalic: () => RichChain; toggleUnderline: () => RichChain;
  toggleHeading: (attrs: { level: number }) => RichChain; setParagraph: () => RichChain; toggleBulletList: () => RichChain;
  toggleOrderedList: () => RichChain; setTextAlign: (value: "left" | "center" | "right") => RichChain;
  undo: () => RichChain; redo: () => RichChain; setColor: (value: string) => RichChain; run: () => boolean;
};
type RichEditor = { chain: () => RichChain; isActive: (name: string, attrs?: Record<string, unknown>) => boolean };

function RichTools({ editor }: { editor: RichEditor }) {
  const [href, setHref] = useState("");
  const [pagePath, setPagePath] = useState("");
  const [newTab, setNewTab] = useState(false);
  const [linkError, setLinkError] = useState("");
  const pages = useContext(LinkPagesContext);
  const linkHref = safeLinkHref(pagePath || href);
  const applyLink = () => {
    if (!linkHref) {
      setLinkError("Choose a page or enter a supported web address.");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({
      href: linkHref,
      target: newTab ? "_blank" : null,
      rel: newTab ? "noopener noreferrer" : null,
    }).run();
    setLinkError("");
    setHref("");
    setPagePath("");
  };
  return <>
    <RichTextMenu.Group>
      <RichTextMenu.Bold />
      <RichTextMenu.Italic />
      <RichTextMenu.Underline />
      <RichTextMenu.HeadingSelect />
      <RichTextMenu.BulletList />
      <RichTextMenu.OrderedList />
      <RichTextMenu.AlignLeft />
      <RichTextMenu.AlignCenter />
      <RichTextMenu.AlignRight />
    </RichTextMenu.Group>
    <RichTextMenu.Group>
      <label className="puck-rich-link"><LinkIcon size={14} /><select value={pagePath} onChange={(event) => { setPagePath(event.target.value); setHref(""); setLinkError(""); }} aria-label="Link to a site page" data-testid="puck-link-page">
        <option value="">Choose a page…</option>
        {pages.map((page) => <option key={page.path} value={page.path}>{page.label || page.title || page.path}</option>)}
      </select></label>
      <label className="puck-rich-link"><ExternalLink size={13} /><input value={href} onChange={(event) => { setHref(event.target.value); setPagePath(""); setLinkError(""); }} placeholder="Or enter a web address" aria-label="Outside link address" data-testid="puck-link-url" /></label>
      <label className="puck-rich-newtab"><input type="checkbox" checked={newTab} onChange={(event) => setNewTab(event.target.checked)} data-testid="puck-link-new-tab" /> Open in new tab</label>
      <RichTextMenu.Control icon={<LinkIcon size={14} />} title="Set link" onClick={applyLink} />
      {linkError && <span className="puck-rich-link-error" role="alert">{linkError}</span>}
      <RichTextMenu.Control icon={<Unlink size={14} />} title="Remove link" onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()} />
      <RichTextMenu.Control icon={<Undo size={14} />} title="Undo" onClick={() => editor.chain().focus().undo().run()} />
      <RichTextMenu.Control icon={<Redo size={14} />} title="Redo" onClick={() => editor.chain().focus().redo().run()} />
      <span className="puck-rich-colors" aria-label="Text color">
      {[["Navy", "#1A365D"], ["Gold", "#D4AF37"], ["Slate", "#2D3748"]].map(([label, color]) =>
        <RichTextMenu.Control key={color} icon={<i style={{ backgroundColor: color }} />} title={`${label} text`} onClick={() => editor.chain().focus().setColor(color).run()} />)}
      </span>
    </RichTextMenu.Group>
  </>;
}

const richField = {
  type: "richtext",
  contentEditable: true,
  options: { textAlign: { types: ["heading", "paragraph"], alignments: ["left", "center", "right"], defaultAlignment: "left" } },
  tiptap: { extensions: [TextStyle, Color] },
  renderInlineMenu: ({ editor, readOnly }: Parameters<NonNullable<RichtextField["renderInlineMenu"]>>[0]) =>
    <RichTextMenu>{editor && !readOnly && <RichTools editor={editor as unknown as RichEditor} />}</RichTextMenu>,
} as unknown as RichtextField;

function LocalDateTimeField({ value, onChange, label }: { value: unknown; onChange: (value: unknown) => void; label: string }) {
  return <label className="puck-date-field">{label}<input type="datetime-local" value={toMountainInput(value)} onChange={(event) => onChange(event.target.value)} /><small>Mountain Time (Colorado)</small></label>;
}

const editorConfig = {
  ...chessPuckConfig,
  components: {
    ...chessPuckConfig.components,
    LegacyMarkdown: { ...chessPuckConfig.components.LegacyMarkdown, fields: { richText: richField } },
    PhotoWithText: {
      ...chessPuckConfig.components.PhotoWithText,
      fields: {
        heading: { type: "text", label: "Heading" },
        richText: richField,
        image: { type: "custom", label: "Photo and focal crop", render: ({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) => <PhotoAssetField value={value} onChange={onChange} /> },
        imageSide: { type: "select", label: "Photo position", options: [{ label: "Left", value: "left" }, { label: "Right", value: "right" }] },
      },
    },
    FamilyStepButton: {
      ...chessPuckConfig.components.FamilyStepButton,
      fields: {
        ...chessPuckConfig.components.FamilyStepButton.fields,
        richText: richField,
        secondaryButtonLabel: { type: "text", label: "Second button label (optional)" },
        secondaryHref: { type: "text", label: "Second button link (optional)" },
      },
    },
    FaqItem: { ...chessPuckConfig.components.FaqItem, fields: { ...chessPuckConfig.components.FaqItem.fields, richText: richField } },
    StaffCard: {
      ...chessPuckConfig.components.StaffCard,
      fields: {
        ...chessPuckConfig.components.StaffCard.fields,
        photo: { type: "custom", label: "Photo and focal crop", render: ({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) => <PhotoAssetField value={value} onChange={onChange} /> },
        bio: richField,
      },
    },
    Testimonial: { ...chessPuckConfig.components.Testimonial, fields: { ...chessPuckConfig.components.Testimonial.fields, quote: richField } },
    Announcement: {
      ...chessPuckConfig.components.Announcement,
      fields: {
        ...chessPuckConfig.components.Announcement.fields,
        richText: richField,
        startsAt: { type: "custom", label: "Start date and time", render: ({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) => <LocalDateTimeField value={value} onChange={onChange} label="Start date and time" /> },
        expiresAt: { type: "custom", label: "End date and time", render: ({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) => <LocalDateTimeField value={value} onChange={onChange} label="End date and time" /> },
      },
    },
  },
} as unknown as Config;

function editorPayload(input: unknown, markdown: string): PuckPayload {
  const payload = asPuckPayload(input, markdown);
  // First load of a legacy page: the whole body is one big text block. Split it at
  // headings so each heading-led chunk becomes its own movable, in-place-editable
  // section (the Google Sites feel). Once the page is saved it holds multiple blocks
  // and takes the per-block normalize path below instead, so this runs only once.
  const first = payload.content[0];
  if (payload.content.length === 1 && first.type === "LegacyMarkdown" && first.props.richTextEdited !== true) {
    const base = String(first.props.originalMarkdown ?? first.props.markdown ?? markdown);
    const sections = splitMarkdownIntoSections(base);
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
  return {
    ...payload,
    content: payload.content.map((block) => {
      if (block.type !== "LegacyMarkdown") return block;
      const original = String(block.props.originalMarkdown ?? block.props.markdown ?? markdown);
      const isEdited = block.props.richTextEdited === true;
      return { ...block, props: { ...block.props, markdown: original, originalMarkdown: original, richText: isEdited && typeof block.props.richText === "string" ? block.props.richText : markdownToRichText(original), richTextEdited: isEdited } };
    }),
  } as unknown as PuckPayload;
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

type Entry = { label: string; subtitle: string; kind: "home" | "page" | "staff" | "news" | "events"; index?: number };
type ContentState = { home?: CmsPage; pages: CmsPage[]; staff: CmsStaff[]; news: CmsArticle[]; events: CmsArticle[] };

export function VisualPageEditor({ draft, update, renderPhotoUploader }: {
  draft: ContentState;
  update: (fn: (d: ContentState) => ContentState) => void;
  renderPhotoUploader?: (onUploaded: (url: string, alt: string) => void) => ReactNode;
}) {
  const [selected, setSelected] = useState("home");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const entries: Entry[] = [
    ...(draft.home ? [{ label: "Home page", subtitle: "/", kind: "home" as const }] : []),
    ...draft.pages.map((p, index) => ({ label: p.label || "Untitled page", subtitle: p.path, kind: "page" as const, index })).filter((entry) => !draft.pages[entry.index].archived),
    ...draft.staff.map((s, index) => ({ label: s.name, subtitle: `Staff biography · ${s.role}`, kind: "staff" as const, index })),
    ...draft.news.map((a, index) => ({ label: a.title, subtitle: `News · ${a.date}`, kind: "news" as const, index })).filter((entry) => !draft.news[entry.index].archived),
    ...draft.events.map((a, index) => ({ label: a.title, subtitle: `Event · ${a.date}`, kind: "events" as const, index })).filter((entry) => !draft.events[entry.index].archived),
  ];
  const entry = entries.find((item) => `${item.kind}:${item.index ?? ""}` === selected) ?? entries[0];
  const record = entry?.kind === "home" ? draft.home : entry?.kind === "page" ? draft.pages[entry.index!] : entry?.kind === "staff" ? draft.staff[entry.index!] : draft[entry?.kind ?? "page"]?.[entry?.index ?? 0];
  if (!entry || !record) return <div className="puck-empty">Add a page, profile, story, or event to begin.</div>;
  const markdown = "markdown" in record ? record.markdown : "bio" in record ? record.bio : "";
  const payload = editorPayload(record.blocks, markdown);
  const saveBlocks = (next: Data) => {
    const blocks = next as PuckPayload;
    const savedBlocks = {
      ...blocks,
      content: blocks.content.map((block) => {
        if (block.type !== "LegacyMarkdown") return block;
        const base = String(block.props.originalMarkdown ?? block.props.markdown ?? "");
        const richText = String(block.props.richText ?? "");
        const edited = block.props.richTextEdited === true || richText !== markdownToRichText(base);
        return { ...block, props: { ...block.props, markdown: base, originalMarkdown: base, richText, richTextEdited: edited } };
      }),
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
  const addPhotoBlock = (url: string, alt: string) => {
    const next: PuckPayload = { ...payload, content: [...payload.content, { type: "PhotoWithText", props: { id: `photo-${Date.now().toString(36)}`, heading: "", richText: "<p></p>", image: { url, alt, focalX: 50, focalY: 50 }, imageSide: "left" } }] };
    saveBlocks(next);
  };
  return <section className="cms-visual-editor">
    <header className="cms-visual-head">
      <div><span className="cms-eyebrow">Visual page editor</span><h2>Make a change, see it in place.</h2><p>Everything here stays in your private draft until you publish.</p></div>
      <div className="cms-visual-actions">
      <button type="button" className="cms-settings-toggle" aria-expanded={settingsOpen} aria-controls="cms-puck-workspace" onClick={() => setSettingsOpen((value) => !value)} data-testid="toggle-page-settings">
        {settingsOpen ? <><ExternalLink size={15} /> Preview as a parent</> : <><PanelLeftOpen size={15} /> Edit this page</>}
      </button>
      {!settingsOpen && <div className="cms-device-switch" aria-label="Preview size">
        <button type="button" className={device === "desktop" ? "is-selected" : ""} onClick={() => setDevice("desktop")} data-testid="preview-desktop"><Monitor size={15} /> Desktop</button>
        <button type="button" className={device === "phone" ? "is-selected" : ""} onClick={() => setDevice("phone")} data-testid="preview-phone"><Smartphone size={15} /> Phone</button>
      </div>}
      </div>
    </header>
    <label className="cms-page-picker"><span>Choose content</span><select value={selected} onChange={(e) => setSelected(e.target.value)} data-testid="select-visual-content">
      {entries.map((item) => <option key={`${item.kind}:${item.index ?? ""}`} value={`${item.kind}:${item.index ?? ""}`}>{item.label} — {item.subtitle}</option>)}
    </select></label>
    <div className={`cms-puck-stage is-${device} ${settingsOpen ? "is-editing" : "preview-focused"}`}>
      {settingsOpen ? (
        <div id="cms-puck-workspace" className="cms-puck-workspace cb-site">
          <LinkPagesContext.Provider value={draft.pages}>
            <Puck
              config={editorConfig}
              data={payload}
              onChange={saveBlocks}
              iframe={{ enabled: false }}
              ui={{ leftSideBarVisible: false, rightSideBarVisible: false }}
              overrides={{ headerActions: () => <></> }}
            />
          </LinkPagesContext.Provider>
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
    {renderPhotoUploader?.(addPhotoBlock)}
    {settingsOpen && <p className="cms-puck-note">Click any text on the page to edit it — a formatting toolbar appears above your selection. Use the sections menu (the ☰ button at the top of the canvas) to add, reorder, duplicate, or remove a section.</p>}
  </section>;
}

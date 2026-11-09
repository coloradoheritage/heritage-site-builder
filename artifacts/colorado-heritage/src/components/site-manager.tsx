import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetSiteContentQueryKey, useGetSiteContentEditor, useSaveSiteContentDraft, usePublishSiteContent, useRestoreSiteContentVersion,
  useUploadSiteDocument,
  type CmsArticle, type CmsDocument, type CmsPage, type CmsStaff, type SiteContentState, type SiteContentEditorState,
} from "@workspace/api-client-react";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, ArrowUpRight, Check, ChevronDown, Plus, RotateCw, Save, Send, Trash2, History, X } from "lucide-react";
import { DocumentsContext, MarkdownContent, resolveDocument } from "./markdown";
import { AnnouncementsEditor, FaqEditor, HomeEditor, InquiriesInbox, MediaHealthBanner, PhotoUploader } from "./site-editors";
export { PhotoUploader } from "./site-editors";
import { fixText, mediaUrl, publicAsset, publicPath } from "../lib/cms";
import "./public-site.css";
import "./cms.css";
import { isAdministrative, portraitPosition, staffProfilePath } from "../../directory-helpers.mjs";
import { isValidMountainInput, toMountainInput } from "./puck-time";

type Tab = "visual" | "home" | "faqs" | "announcements" | "inquiries" | "pages" | "staff" | "events" | "news" | "documents" | "menu";
const VisualPageEditor = lazy(() => import("./puck-content").then((module) => ({ default: module.VisualPageEditor })));
const DraftParentPreview = lazy(() => import("./draft-parent-preview"));
// One plain-language label + one-line description per tab. The five everyday tasks are
// the primary tabs; everything else lives under a "More" menu so the bar is not a wall
// of eleven choices. "Home page" is no longer its own primary tab (its text is edited
// in Edit pages, in the Visual editor) — only its photo and search settings remain,
// relabelled and moved under More, so it is not a duplicate of the page editor.
const TAB_META: Record<Tab, { label: string; desc: string }> = {
  visual: { label: "Edit pages", desc: "Change the words, photos, and links on any page." },
  announcements: { label: "Announcements", desc: "Timed notices in the bar above the menu." },
  events: { label: "Events", desc: "Add and edit school calendar events." },
  staff: { label: "Faculty & staff", desc: "Add or update staff and faculty profiles." },
  documents: { label: "Documents", desc: "Upload PDFs such as the calendar or tuition policy." },
  pages: { label: "Pages", desc: "Create, rename, or remove pages." },
  news: { label: "News & blog", desc: "Write and edit news and blog posts." },
  faqs: { label: "FAQs", desc: "Questions parents ask, and which show on the home page." },
  inquiries: { label: "Inquiries", desc: "Questions families sent from the website." },
  menu: { label: "Menu links", desc: "Arrange page links in the six navigation groups." },
  home: { label: "Home photo & settings", desc: "Hero photo and search settings. Edit home text in Edit pages." },
};
const PRIMARY_TABS: Tab[] = ["visual", "announcements", "events", "staff", "documents"];
const MORE_TABS: Tab[] = ["pages", "news", "faqs", "inquiries", "menu", "home"];
const ALL_TABS: Tab[] = [...PRIMARY_TABS, ...MORE_TABS];
// Map a public path (the page the staff member is looking at in the parent preview)
// to where it is edited: a key the Visual editor opens directly, or a management tab.
// Returns {} when nothing specific matches, so the caller just opens the Visual editor.
function resolveEditTarget(path: string, draft: SiteContentState): { key?: string; tab?: Tab } {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (clean === "/") return { key: "home" };
  // The public site resolves these two paths to the news index and FAQ page before it
  // looks at any page record, so mirror that order: a leftover page record for /news
  // or /faq (e.g. an old archive page) must not capture the edit.
  if (clean === "/faq") return { tab: "faqs" };
  if (clean === "/news") return { tab: "news" };
  // Archived pages are not shown publicly or listed in the Visual editor, so they can't be a target.
  const page = draft.pages.findIndex((p) => p.path === clean && !p.archived);
  if (page >= 0) return { key: `page:${page}` };
  const staff = draft.staff.findIndex((s) => staffProfilePath(s) === clean);
  if (staff >= 0) return { key: `staff:${staff}` };
  const news = draft.news.findIndex((a) => a.path === clean);
  if (news >= 0) return { key: `news:${news}` };
  const ev = draft.events.findIndex((a) => a.path === clean);
  if (ev >= 0) return { key: `events:${ev}` };
  if (clean.startsWith("/parents/calendar")) return { tab: "events" };
  return {};
}

const PAGE_KINDS = ["content", "overview", "contact", "donate", "gallery", "video", "protected", "archive", "sitemap"];
// Plain-language names for the page layout menu (value stays the internal kind).
const PAGE_KIND_LABELS: Record<string, string> = {
  content: "Standard page", overview: "Section overview", contact: "Contact page", donate: "Donation page",
  gallery: "Photo gallery", video: "Video or map", protected: "Members only", archive: "Archive", sitemap: "Sitemap",
};
const pageKindLabel = (k: string) => PAGE_KIND_LABELS[k] ?? k;

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
const slugify = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const errStatus = (e: unknown) => (typeof e === "object" && e && "status" in e ? Number((e as { status: unknown }).status) : 0);
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Unknown error");
function syncLegacyMarkdown<T extends { blocks?: unknown }>(record: T, markdown: string) {
  if (!record.blocks || typeof record.blocks !== "object" || !Array.isArray((record.blocks as { content?: unknown }).content)) return {};
  const payload = record.blocks as { content: Array<{ type: string; props: Record<string, unknown> }>; [key: string]: unknown };
  if (!payload.content.some((block) => block.type === "LegacyMarkdown")) return {};
  return { blocks: { ...payload, content: payload.content.map((block) => block.type === "LegacyMarkdown" ? { ...block, props: { ...block.props, markdown, originalMarkdown: markdown, richTextEdited: false } } : block) } };
}

function validate(d: SiteContentState): string[] {
  const extra: string[] = [];
  (d.faqs ?? []).forEach((f, i) => { if (!f.question.trim() || !f.answer.trim()) extra.push(`FAQ ${i + 1} needs both a question and an answer.`); });
  (d.announcements ?? []).forEach((a, i) => { if (!a.title.trim()) extra.push(`Announcement ${i + 1} needs a title.`); if (a.startsAt && a.expiresAt && a.expiresAt <= a.startsAt) extra.push(`Announcement "${a.title}" expires before it starts.`); });
  return [...extra, ...validateBase(d)];
}
function blockImageIssues(record: { blocks?: unknown }, label: string): string[] {
  if (!record.blocks || typeof record.blocks !== "object" || !Array.isArray((record.blocks as { content?: unknown }).content)) return [];
  return (record.blocks as { content: Array<{ type?: string; props?: Record<string, unknown> }> }).content.flatMap((block, index) => {
    const imageValue = block.type === "StaffCard" ? block.props?.photo : block.props?.image ?? block.props?.imageUrl;
    const image = imageValue && typeof imageValue === "object" ? imageValue as { url?: string; alt?: string } : null;
    const photoUrl = image?.url ?? imageValue;
    const photoAlt = image?.alt ?? block.props?.alt;
    const hasPhoto = (block.type === "PhotoWithText" || block.type === "StaffCard") && Boolean(photoUrl);
    const missingAlt = hasPhoto && !String(photoAlt ?? "").trim();
    const timing = block.type === "Announcement" ? {
      rawStart: String(block.props?.startsAt ?? ""),
      rawEnd: String(block.props?.expiresAt ?? ""),
    } : null;
    const start = timing ? toMountainInput(timing.rawStart) : "";
    const end = timing ? toMountainInput(timing.rawEnd) : "";
    const timingIssue = timing && ((timing.rawStart && (!start || !isValidMountainInput(start))) || (timing.rawEnd && (!end || !isValidMountainInput(end))) || (start && end && end <= start));
    return [
      ...(missingAlt ? [`${label} image block ${index + 1} needs a photo description (alt text).`] : []),
      ...(timingIssue ? [`${label} announcement block ${index + 1} needs valid Mountain Time dates, with the end after the start.`] : []),
    ];
  });
}
function validateBase(d: SiteContentState): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  d.pages.forEach((p, i) => {
    if (!p.path.startsWith("/")) issues.push(`Page ${i + 1} ("${p.label || "untitled"}") needs a web address starting with /.`);
    if (!p.label.trim()) issues.push(`Page ${p.path} needs a menu label.`);
    if (seen.has(p.path)) issues.push(`Two pages share the address ${p.path}.`);
    seen.add(p.path);
    issues.push(...blockImageIssues(p, `Page "${p.label || i + 1}"`));
  });
  if (d.home) issues.push(...blockImageIssues(d.home, "Home page"));
  const slugs = new Set<string>();
  d.staff.forEach((s) => {
    if (!s.name.trim()) issues.push("A faculty profile is missing a name.");
    if (!s.slug.trim()) issues.push(`${s.name || "A faculty profile"} needs a link name (slug).`);
    if (slugs.has(s.slug)) issues.push(`Two faculty profiles share the link name "${s.slug}".`);
    slugs.add(s.slug);
    if (s.photo && !s.alt.trim()) issues.push(`${s.name || "A faculty profile"} has a photo without a description (alt text).`);
    issues.push(...blockImageIssues(s, `Staff profile "${s.name}"`));
  });
  (["events", "news"] as const).forEach((k) => d[k].forEach((a) => {
    if (!a.title.trim() || !a.path.startsWith("/")) issues.push(`${k === "news" ? "A news story" : "An event"} needs a title and an address starting with /.`);
    issues.push(...blockImageIssues(a, `${k === "news" ? "Story" : "Event"} "${a.title}"`));
  }));
  d.documents.forEach((doc) => { if (!doc.title.trim() || !doc.url.trim()) issues.push("Each document needs a title and a link."); });
  if (d.navigation.length > 6) issues.push("The main menu shows six items. Remove or move extra items below the sixth.");
  return issues;
}

/* ---------------- Field helpers ---------------- */

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="cms-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function ListRail<T>({ items, selected, onSelect, render, onMove, onAdd, addLabel, filter }: {
  items: T[]; selected: number; onSelect: (i: number) => void; render: (item: T) => { title: string; meta?: string; muted?: boolean };
  onMove: (from: number, to: number) => void; onAdd: () => void; addLabel: string; filter?: string;
}) {
  return <div className="cms-rail">
    <button type="button" className="cms-btn cms-btn-add" onClick={onAdd}><Plus size={14} /> {addLabel}</button>
    <ol>
      {items.map((item, i) => {
        const r = render(item);
        if (filter && !`${r.title} ${r.meta}`.toLowerCase().includes(filter.toLowerCase())) return null;
        return <li key={i} className={`${i === selected ? "is-active" : ""} ${r.muted ? "is-muted" : ""}`}>
          <button type="button" className="cms-rail-main" onClick={() => onSelect(i)}><strong>{r.title || "Untitled"}</strong>{r.meta && <small>{r.meta}</small>}</button>
          <span className="cms-rail-order">
            <button type="button" aria-label="Move up" onClick={() => onMove(i, i - 1)} disabled={i === 0}><ArrowUp size={12} /></button>
            <button type="button" aria-label="Move down" onClick={() => onMove(i, i + 1)} disabled={i === items.length - 1}><ArrowDown size={12} /></button>
          </span>
        </li>;
      })}
    </ol>
  </div>;
}

/** Preview and quick page basics; full page text lives in the visual editor. */
function EditablePreview({ eyebrow, title, description, markdown, onTitle, onDescription, publicUrl, documents = [] }: {
  eyebrow: string; title: string; description?: string; markdown: string; documents?: CmsDocument[];
  onTitle: (v: string) => void; onDescription?: (v: string) => void; publicUrl?: string;
}) {
  const [active, setActive] = useState<"title" | "description" | null>(null);
  return <DocumentsContext.Provider value={documents}><div className="cms-preview chess-public">
    <div className="cms-preview-bar"><span>Click the words below to edit them. Use the buttons for simple formatting.</span>{publicUrl && <a href={publicUrl} target="_blank" rel="noreferrer">Open public page <ArrowUpRight size={12} /></a>}</div>
    <article className="chess-content-page cms-preview-page">
      <header className="chess-page-intro chess-content-heading">
        <span className="chess-eyebrow">{eyebrow}</span>
        {active === "title"
          ? <input autoFocus className="cms-inline-title" value={title} onChange={(e) => onTitle(e.target.value)} onBlur={() => setActive(null)} onKeyDown={(e) => e.key === "Enter" && setActive(null)} aria-label="Title" />
          : <h1 className="cms-editable" tabIndex={0} onClick={() => setActive("title")} onKeyDown={(e) => e.key === "Enter" && setActive("title")} data-testid="preview-edit-title">{fixText(title) || "Add a title"}</h1>}
        {onDescription && (active === "description"
          ? <textarea autoFocus className="cms-inline-desc" value={description} onChange={(e) => onDescription(e.target.value)} onBlur={() => setActive(null)} aria-label="Summary" rows={2} />
          : <p className="cms-editable" tabIndex={0} onClick={() => setActive("description")} onKeyDown={(e) => e.key === "Enter" && setActive("description")}>{fixText(description || "") || "Add a short summary"}</p>)}
      </header>
      <div className="cms-editable-body cms-body-readonly">
        {markdown.trim() ? <MarkdownContent markdown={markdown} /> : <p className="cms-muted">No body text yet.</p>}
        <p className="cms-preview-help">This is a preview. To change the words and photos, use the “Edit this page” button.</p>
      </div>
    </article>
  </div></DocumentsContext.Provider>;
}

/* ---------------- Editors ---------------- */

export function PagesEditor({ draft, update, onEditInCanvas, requestedIndex, onSelectPath, settingsOnly, onClose }: {
  draft: SiteContentState;
  update: (fn: (d: SiteContentState) => SiteContentState) => void;
  onEditInCanvas?: (pageIndex: number) => void;
  requestedIndex?: number | null;
  onSelectPath?: (path: string) => void;
  settingsOnly?: boolean;
  onClose?: () => void;
}) {
  const [sel, setSel] = useState(() => (typeof requestedIndex === "number" ? requestedIndex : 0));
  const [filter, setFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [justAdded, setJustAdded] = useState<number | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Another tab (the canvas "Page settings" link) can ask to open a page here.
  useEffect(() => { if (typeof requestedIndex === "number") setSel(requestedIndex); }, [requestedIndex]);
  const pageIndices = useMemo(() => draft.pages.map((p, i) => ({ p, i }))
    .filter(({ p }) => showArchived || !p.archived)
    .filter(({ p }) => !filter || `${p.label} ${p.path}`.toLowerCase().includes(filter.toLowerCase()))
    .map(({ i }) => i), [draft.pages, showArchived, filter]);
  const pageIndex = pageIndices.includes(sel) ? sel : pageIndices[0] ?? -1;
  const page = pageIndex >= 0 ? draft.pages[pageIndex] : undefined;
  useEffect(() => { if (page) onSelectPath?.(page.path); }, [page?.path, onSelectPath]);
  useEffect(() => { setConfirmingDelete(false); }, [pageIndex]);
  const set = (patch: Partial<CmsPage>) => update((d) => {
    const current = d.pages[pageIndex];
    if (!current) return d;
    const nextPath = patch.path ?? current.path;
    const pages = d.pages.map((p, i) => i === pageIndex ? { ...p, ...patch, ...(typeof patch.markdown === "string" ? syncLegacyMarkdown(p, patch.markdown) : {}) } : p);
    const redirects = { ...(d.redirects ?? {}) };
    if (current.path !== nextPath) redirects[current.path] = nextPath;
    let navigation = d.navigation.map((item) => ({
      ...item,
      children: item.children.map((child) => child === current.path ? nextPath : child),
    }));
    if (patch.showInMenu === false) navigation = navigation.map((item) => ({ ...item, children: item.children.filter((child) => child !== nextPath) }));
    if (typeof patch.menuOrder === "number") {
      const orderOf = (path: string) => pages.find((p) => p.path === path)?.menuOrder ?? Number.MAX_SAFE_INTEGER;
      navigation = navigation.map((item) => {
        const orderedPages = item.children.filter((child) => pages.some((p) => p.path === child)).sort((a, b) => orderOf(a) - orderOf(b));
        let pageIndex = 0;
        return { ...item, children: item.children.map((child) => pages.some((p) => p.path === child) ? orderedPages[pageIndex++] : child) };
      });
    }
    return { ...d, pages, redirects, navigation };
  });
  const menuGroup = page ? draft.navigation.find((group) => group.children.includes(page.path))?.path ?? "" : "";
  const autoRenameFromLabel = () => {
    if (!page?.label.trim()) return;
    const parent = page.path.slice(0, page.path.lastIndexOf("/") + 1);
    const nextPath = `${parent}${slugify(page.label)}`.replace(/\/$/, "") || page.path;
    if (nextPath !== page.path) set({ path: nextPath });
  };
  const setMenuGroup = (groupPath: string) => {
    if (!page) return;
    update((d) => {
      const pages = d.pages.map((p, i) => i === pageIndex ? { ...p, showInMenu: Boolean(groupPath), menuOrder: groupPath ? p.menuOrder ?? 0 : p.menuOrder } : p);
      const navigation = d.navigation.map((group) => ({
        ...group,
        children: group.path === groupPath
          ? [...group.children.filter((child) => child !== page.path), page.path]
          : group.children.filter((child) => child !== page.path),
      }));
      return { ...d, pages, navigation };
    });
  };
  // Build the web address from the name the editor types, instead of creating
  // a throwaway "/new-page-NN" up front.
  const createPage = () => {
    const name = newName.trim();
    if (!name) return;
    const existing = new Set(draft.pages.map((p) => p.path));
    const baseSlug = slugify(name) || "page";
    let path = `/${baseSlug}`;
    for (let n = 2; existing.has(path); n++) path = `/${baseSlug}-${n}`;
    const newIndex = draft.pages.length;
    const base: CmsPage = { path, label: name, title: `${name} | Colorado Heritage`, description: "", markdown: "", kind: "content" };
    update((d) => ({ ...d, pages: [...d.pages, base] }));
    setSel(newIndex);
    setAdding(false);
    setNewName("");
    setJustAdded(newIndex);
  };
  const remove = () => {
    if (!page) return;
    update((d) => ({ ...d, pages: d.pages.filter((_, i) => i !== pageIndex), navigation: d.navigation.map((n) => ({ ...n, children: n.children.filter((c) => c !== page.path) })) }));
    setSel(Math.max(0, pageIndex - 1));
    setConfirmingDelete(false);
    onClose?.();
  };
  // The settings fields, shared between the Pages tab and the canvas settings drawer.
  const settingsBody = page ? <>
    <div className="cms-grid2">
      <Field label="Web address" hint="The old address redirects to the new one when renamed."><input value={page.path} onChange={(e) => set({ path: e.target.value.startsWith("/") ? e.target.value : `/${e.target.value}` })} /></Field>
      <Field label="Page name" hint="Shown in the menu. The web address updates from it after you finish editing."><input value={page.label} onChange={(e) => set({ label: e.target.value })} onBlur={autoRenameFromLabel} /></Field>
      <Field label="Browser tab title" hint="Shown on the browser tab and as the headline in search results."><input value={page.title} onChange={(e) => set({ title: e.target.value })} /></Field>
      <Field label="Short description (shown in Google)" hint="One sentence shown under the page title and in search results."><textarea rows={2} value={page.description} onChange={(e) => set({ description: e.target.value })} /></Field>
      <Field label="Page layout" hint="Most pages are “Standard page”. Change only if you know you need another layout."><select value={page.kind} onChange={(e) => set({ kind: e.target.value })}>{[...new Set([...PAGE_KINDS, page.kind])].map((k) => <option key={k} value={k}>{pageKindLabel(k)}</option>)}</select></Field>
      <Field label="Attached document (PDF path)" hint="For example /documents/school-calendar.pdf"><input value={page.documentPath ?? ""} onChange={(e) => set({ documentPath: e.target.value || undefined })} /></Field>
      <Field label="External link" hint="Opens another website from this page."><input value={page.externalUrl ?? ""} onChange={(e) => set({ externalUrl: e.target.value || undefined })} /></Field>
      <Field label="Menu group" hint="Which of the six top-level menus this page appears under. New top-level menus cannot be added.">
        <select value={menuGroup} onChange={(e) => setMenuGroup(e.target.value)}><option value="">Not in the menu</option>{draft.navigation.slice(0, 6).map((group) => <option key={group.path} value={group.path}>{group.label}</option>)}</select>
      </Field>
      <Field label="Order in its menu" hint="Lower numbers appear first."><input type="number" min="0" step="1" value={page.menuOrder ?? sel} onChange={(e) => set({ menuOrder: Number(e.target.value) })} /></Field>
    </div>
    <div className="cms-check-group">
      <label className="cms-check"><input type="checkbox" checked={page.showInMenu !== false && Boolean(menuGroup)} onChange={(e) => e.target.checked ? setMenuGroup(menuGroup || draft.navigation[0]?.path || "") : setMenuGroup("")} /> Show this page in its menu group</label>
      <label className="cms-check"><input type="checkbox" checked={Boolean(page.archived)} onChange={(e) => set({ archived: e.target.checked, showInMenu: e.target.checked ? false : page.showInMenu })} /> Archived: hide from visitors, keep it available to restore</label>
    </div>
    {confirmingDelete
      ? <div className="cms-inline-confirm"><span>Delete “{fixText(page.label)}” ({page.path})? Visitors will see “page not found” here after you save.</span>
          <button type="button" className="cms-btn cms-btn-danger" onClick={remove} data-testid="confirm-delete-page"><Check size={14} /> Delete page</button>
          <button type="button" className="cms-btn" onClick={() => setConfirmingDelete(false)}><X size={14} /> Keep</button>
        </div>
      : <button type="button" className="cms-btn cms-btn-danger" onClick={() => setConfirmingDelete(true)} data-testid="button-delete-page"><Trash2 size={14} /> Delete this page</button>}
  </> : null;

  // Canvas settings drawer: just the fields, no rail or preview.
  if (settingsOnly) {
    return <div className="cms-settings-drawer-body">
      <div className="cms-settings-drawer-head"><h3>Page settings</h3>{onClose && <button type="button" className="cms-btn" onClick={onClose}><X size={14} /> Done</button>}</div>
      {page ? settingsBody : <p className="cms-muted">Select a page to edit its settings.</p>}
    </div>;
  }

  return <div className="cms-split">
    <div>
      <input className="cms-search" placeholder="Find a page…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Find a page" />
      <label className="cms-check cms-check-spaced"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived pages</label>
      {adding && <form className="cms-newpage" onSubmit={(e) => { e.preventDefault(); createPage(); }}>
        <Field label="Name the new page" hint="We build the web address from this name."><input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Summer Camp" data-testid="input-new-page-name" /></Field>
        {newName.trim() && <p className="cms-muted">Address: <code>/{slugify(newName) || "page"}</code></p>}
        <div className="cms-newpage-actions">
          <button type="submit" className="cms-btn cms-btn-primary" disabled={!newName.trim()} data-testid="button-create-page"><Check size={14} /> Create page</button>
          <button type="button" className="cms-btn" onClick={() => { setAdding(false); setNewName(""); }}>Cancel</button>
        </div>
      </form>}
      {justAdded !== null && draft.pages[justAdded] && !adding && <div className="cms-newpage-done" role="status">
        <span>Created <strong>{fixText(draft.pages[justAdded].label)}</strong>.</span>
        {onEditInCanvas && <button type="button" className="cms-btn cms-btn-primary" onClick={() => { onEditInCanvas(justAdded); setJustAdded(null); }} data-testid="button-edit-new-page"><ArrowUpRight size={14} /> Edit this page</button>}
      </div>}
      <ListRail items={pageIndices.map((i) => draft.pages[i])} selected={pageIndices.indexOf(pageIndex)} onSelect={(i) => setSel(pageIndices[i])} addLabel={adding ? "Cancel new page" : "Add page"}
        render={(p) => ({ title: fixText(p.label), meta: p.archived ? "Archived · hidden from visitors" : "Website page", muted: Boolean(p.archived) })}
        onMove={(a, b) => { const from = pageIndices[a]; const to = pageIndices[b]; if (from == null || to == null) return; update((d) => ({ ...d, pages: move(d.pages, from, to) })); if (from === pageIndex) setSel(to); }} onAdd={() => { if (adding) { setAdding(false); setNewName(""); } else { setAdding(true); setJustAdded(null); } }} />
    </div>
    {page ? <div className="cms-editor">
      <EditablePreview documents={draft.documents} eyebrow="Website page" title={page.label} description={page.description} markdown={page.markdown}
        onTitle={(label) => set({ label })} onDescription={(description) => set({ description })}
        publicUrl={publicPath(page.path)} />
      {onEditInCanvas && <p className="cms-inline"><button type="button" className="cms-btn" onClick={() => onEditInCanvas(pageIndex)} data-testid="button-edit-content"><ArrowUpRight size={14} /> Edit this page’s words and photos</button></p>}
      {page.documentPath && <p className="cms-muted">Attached document: {page.documentPath} currently opens {resolveDocument(page.documentPath, draft.documents)}. Change the destination on the Documents tab.</p>}
      <details className="cms-settings" open={false}>
        <summary>Page settings: web address, menu placement, search text</summary>
        {settingsBody}
      </details>
    </div> : <div className="cms-empty"><strong>No pages yet.</strong><p>Add one to get started.</p></div>}
  </div>;
}

function StaffEditor({ draft, update }: { draft: SiteContentState; update: (fn: (d: SiteContentState) => SiteContentState) => void }) {
  const [sel, setSel] = useState(0);
  const person = draft.staff[sel];
  const set = (patch: Partial<CmsStaff>) => update((d) => ({ ...d, staff: d.staff.map((s, i) => (i === sel ? { ...s, ...patch, ...(typeof patch.bio === "string" ? syncLegacyMarkdown(s, patch.bio) : {}) } : s)) }));
  const add = () => { update((d) => ({ ...d, staff: [...d.staff, { slug: `new-teacher-${d.staff.length + 1}`, name: "New teacher", role: "Teacher", photo: "", alt: "", bio: "" }] })); setSel(draft.staff.length); };
  const remove = () => {
    if (!person || !window.confirm(`Remove ${person.name} from the faculty and staff directories?`)) return;
    update((d) => ({ ...d, staff: d.staff.filter((_, i) => i !== sel) })); setSel(Math.max(0, sel - 1));
  };
  return <div className="cms-split">
    <ListRail items={draft.staff} selected={sel} onSelect={setSel} addLabel="Add person" render={(s) => ({ title: s.name, meta: s.role })}
      onMove={(a, b) => { update((d) => ({ ...d, staff: move(d.staff, a, b) })); if (a === sel) setSel(b); }} onAdd={add} />
    {person ? <div className="cms-editor">
      <div className="cms-staff-head">
        <div className="cms-faculty-photo cms-staff-thumb">{person.photo ? <img src={mediaUrl(person.photo)} alt={person.alt} style={{ objectPosition: portraitPosition(person) }} /> : <span className="cms-initials">{person.name.slice(0, 1)}</span>}</div>
        <div className="cms-grid2">
          <Field label="Name"><input value={person.name} onChange={(e) => set({ name: e.target.value })} onBlur={() => !person.slug && set({ slug: slugify(person.name) })} /></Field>
          <Field label="Role"><input value={person.role} onChange={(e) => set({ role: e.target.value })} /></Field>
          <Field label="Link name (slug)" hint={`Bio page: ${staffProfilePath(person)}`}><input value={person.slug} onChange={(e) => set({ slug: slugify(e.target.value) })} /></Field>
          <Field label="Photo description (alt text)" hint={person.photo ? "Required when a photo is set." : undefined}><input value={person.alt} onChange={(e) => set({ alt: e.target.value })} aria-invalid={Boolean(person.photo && !person.alt.trim())} /></Field>
        </div>
      </div>
      <label className="cms-check"><input type="checkbox" checked={isAdministrative(person)} onChange={(e) => set({ administrative: e.target.checked })} /> Include in Administrative Staff</label>
      <label className="cms-check"><input type="checkbox" checked={(person as { faculty?: boolean }).faculty ?? (!isAdministrative(person) && !(person as { board?: boolean }).board)} onChange={(e) => set({ faculty: e.target.checked } as Partial<CmsStaff>)} data-testid="check-staff-faculty" /> Include in Faculty</label>
      <label className="cms-check"><input type="checkbox" checked={Boolean((person as { board?: boolean }).board)} onChange={(e) => set({ board: e.target.checked } as Partial<CmsStaff>)} data-testid="check-staff-board" /> Include on the Board</label>
      {(person as { board?: boolean }).board && <Field label="Board role" hint="Shown on the Board card, e.g. Chairman or Treasurer."><input value={(person as { boardRole?: string }).boardRole ?? ""} onChange={(e) => set({ boardRole: e.target.value || undefined } as Partial<CmsStaff>)} data-testid="input-staff-board-role" /></Field>}
      <PhotoUploader key={person.slug} label="Upload a portrait (full image preserved)" portrait defaultAlt={person.alt || `Portrait of ${person.name}`} onUploaded={(url, alt) => set({ photo: url, alt, photoPositionX: 50, photoPositionY: 0 })} />
      {person.photo && <fieldset>
        <legend>Photo framing</legend>
        <p className="cms-muted">Adjust which part of the full photo appears in the square. This applies to directory cards and the bio page.</p>
        <div className="cms-faculty-photo cms-focal-preview"><img src={mediaUrl(person.photo)} alt={person.alt || person.name} style={{ objectPosition: portraitPosition(person) }} /></div>
        <Field label={`Horizontal position: ${person.photoPositionX ?? 50}%`} hint="0% = left · 50% = center · 100% = right"><input aria-label="Horizontal photo position" type="range" min="0" max="100" step="1" value={person.photoPositionX ?? 50} onChange={(e) => set({ photoPositionX: Number(e.target.value) })} /></Field>
        <Field label={`Vertical position: ${person.photoPositionY ?? 0}%`} hint="0% = top · 100% = bottom. Start at the top to keep faces visible."><input aria-label="Vertical photo position" type="range" min="0" max="100" step="1" value={person.photoPositionY ?? 0} onChange={(e) => set({ photoPositionY: Number(e.target.value) })} /></Field>
        <button type="button" className="cms-btn" onClick={() => set({ photoPositionX: 50, photoPositionY: 0 })}>Reset to top-centered</button>
      </fieldset>}
      {person.photo && <button type="button" className="cms-btn" onClick={() => set({ photo: "", alt: "" })}>Remove photo</button>}
      <EditablePreview documents={draft.documents} eyebrow={person.role} title={person.name} markdown={person.bio} onTitle={(name) => set({ name })} publicUrl={publicPath(staffProfilePath(person))} />
      <button type="button" className="cms-btn cms-btn-danger" onClick={remove}><Trash2 size={14} /> Remove this person</button>
    </div> : <div className="cms-empty"><strong>No faculty profiles yet.</strong><p>Add your first teacher.</p></div>}
  </div>;
}

function ArticlesEditor({ kind, draft, update }: { kind: "news" | "events"; draft: SiteContentState; update: (fn: (d: SiteContentState) => SiteContentState) => void }) {
  const [sel, setSel] = useState(0);
  const list = draft[kind];
  const [showArchived, setShowArchived] = useState(false);
  const visibleIndices = useMemo(() => list.map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => showArchived || !entry.archived)
    .map(({ index }) => index), [list, showArchived]);
  const selectedIndex = visibleIndices.includes(sel) ? sel : visibleIndices[0] ?? -1;
  const item = selectedIndex >= 0 ? list[selectedIndex] : undefined;
  const setList = (fn: (l: CmsArticle[]) => CmsArticle[]) => update((d) => ({ ...d, [kind]: fn(d[kind]) }));
  const set = (patch: Partial<CmsArticle>) => setList((l) => l.map((a, i) => (i === selectedIndex ? { ...a, ...patch, ...(typeof patch.markdown === "string" ? syncLegacyMarkdown(a, patch.markdown) : {}) } : a)));
  const add = () => {
    const today = new Date().toISOString().slice(0, 10);
    const [y, m, dd] = today.split("-");
    setList((l) => [{ path: `/${kind}/${y}/${Number(m)}/${Number(dd)}/new-${kind === "news" ? "story" : "event"}-${l.length + 1}`, title: kind === "news" ? "New story" : "New event", date: today, markdown: "", archived: false }, ...l]);
    setSel(0);
  };
  const remove = () => { if (!item || !window.confirm(`Delete "${item.title}" permanently? To hide it from listings but keep the page, use "Archived" instead.`)) return; setList((l) => l.filter((_, i) => i !== selectedIndex)); setSel(Math.max(0, selectedIndex - 1)); };
  return <div className="cms-split">
    <div>
      <label className="cms-check"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived {kind === "news" ? "posts" : "events"}</label>
    <ListRail items={visibleIndices.map((i) => list[i])} selected={visibleIndices.indexOf(selectedIndex)} onSelect={(i) => setSel(visibleIndices[i])} addLabel={kind === "news" ? "Add story" : "Add event"}
      render={(a) => ({ title: fixText(a.title), meta: `${a.date}${a.archived ? " · archived" : ""}`, muted: a.archived })}
      onMove={(a, b) => { const from = visibleIndices[a]; const to = visibleIndices[b]; if (from == null || to == null) return; setList((l) => move(l, from, to)); if (from === selectedIndex) setSel(to); }} onAdd={add} />
    </div>
    {item ? <div className="cms-editor">
      <div className="cms-grid2">
        <Field label="Date"><input type="date" value={/^\d{4}-\d{2}-\d{2}/.test(item.date) ? item.date.slice(0, 10) : ""} onChange={(e) => set({ date: e.target.value })} /></Field>
        <Field label="Web address"><input value={item.path} onChange={(e) => set({ path: e.target.value })} /></Field>
      </div>
      <label className="cms-check"><input type="checkbox" checked={item.archived} onChange={(e) => set({ archived: e.target.checked })} /> Archived: hide from public listings (still editable here, and its address still works)</label>
      <EditablePreview documents={draft.documents} eyebrow={kind === "news" ? "News & Blog" : "Calendar & Events"} title={item.title} markdown={item.markdown} onTitle={(title) => set({ title })} publicUrl={publicPath(item.path)} />
      <button type="button" className="cms-btn cms-btn-danger" onClick={remove}><Trash2 size={14} /> Delete</button>
    </div> : <div className="cms-empty"><strong>Nothing here yet.</strong></div>}
  </div>;
}

function DocumentsEditor({ draft, update }: { draft: SiteContentState; update: (fn: (d: SiteContentState) => SiteContentState) => void }) {
  const setDocs = (fn: (l: CmsDocument[]) => CmsDocument[]) => update((d) => ({ ...d, documents: fn(d.documents) }));
  const uploadPdf = useUploadSiteDocument();
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState("");
  const upload = async (doc: CmsDocument, file?: File) => {
    if (!file) return;
    setUploadError("");
    if (!/\.pdf$/i.test(file.name)) { setUploadError("Choose a PDF file."); return; }
    setUploading(doc.id);
    try {
      const result = await uploadPdf.mutateAsync({ data: { file } });
      setDocs((items) => items.map((item) => item.id === doc.id ? { ...item, url: result.url } : item));
    } catch (error) {
      setUploadError(errMsg(error));
    } finally {
      setUploading(null);
    }
  };
  return <div className="cms-docs">
    <p className="cms-muted">Documents are linked files such as the school calendar and tuition policy. Every page link that points at the original address opens the destination set here. Upload a PDF up to 15 MB; it will replace the file destination in this private draft.</p>
    {uploadError && <p className="cms-feedback cms-feedback-error" role="alert">{uploadError}</p>}
    {draft.documents.map((doc, i) => <div className="cms-doc-row" key={i}>
      <Field label="Title"><input value={doc.title} onChange={(e) => setDocs((l) => l.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} /></Field>
      <Field label="Original link (fixed)" hint="Pages refer to this; it cannot change."><input value={doc.id} readOnly aria-readonly="true" /></Field>
      <Field label="Current destination"><input value={doc.url} onChange={(e) => setDocs((l) => l.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} /></Field>
      <Field label="Upload replacement PDF"><input type="file" accept=".pdf,application/pdf" aria-label={`Upload PDF for ${doc.title}`} disabled={uploading === doc.id} onChange={(e) => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ""; void upload(doc, file); }} /></Field>
      {uploading === doc.id && <span className="cms-muted">Uploading PDF…</span>}
      <span className="cms-row-actions">
        <a className="cms-btn" href={/^https?:/.test(doc.url) ? doc.url : publicAsset(doc.url)} target="_blank" rel="noreferrer">Open</a>
        <button type="button" className="cms-btn" aria-label="Move up" onClick={() => setDocs((l) => move(l, i, i - 1))}><ArrowUp size={13} /></button>
        <button type="button" className="cms-btn" aria-label="Move down" onClick={() => setDocs((l) => move(l, i, i + 1))}><ArrowDown size={13} /></button>
        <button type="button" className="cms-btn cms-btn-danger" aria-label="Delete" onClick={() => window.confirm(`Delete "${doc.title}"?`) && setDocs((l) => l.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
      </span>
    </div>)}
    <button type="button" className="cms-btn cms-btn-add" onClick={() => setDocs((l) => [...l, { id: `doc-${Date.now().toString(36)}`, title: "New document", url: "/documents/" }])}><Plus size={14} /> Add document</button>
  </div>;
}

function MenuEditor({ draft, update }: { draft: SiteContentState; update: (fn: (d: SiteContentState) => SiteContentState) => void }) {
  const labels = new Map(draft.pages.map((p) => [p.path, p.label]));
  const updateGroup = (groupIndex: number, children: string[]) => update((d) => {
    const group = d.navigation[groupIndex];
    if (!group) return d;
    const order = new Map(children.map((path, index) => [path, index]));
    return {
      ...d,
      navigation: d.navigation.map((item, index) => index === groupIndex ? { ...item, children } : item),
      pages: d.pages.map((page) => order.has(page.path) ? { ...page, menuOrder: order.get(page.path), showInMenu: true } : page),
    };
  });
  const setVisible = (groupIndex: number, path: string, visible: boolean) => update((d) => ({
    ...d,
    pages: d.pages.map((page) => page.path === path ? { ...page, showInMenu: visible } : page),
    navigation: d.navigation.map((group, index) => {
      if (index === groupIndex && visible && !group.children.includes(path)) return { ...group, children: [...group.children, path] };
      return { ...group, children: visible ? group.children : group.children.filter((child) => child !== path) };
    }),
  }));
  const addPage = (groupIndex: number, path: string) => {
    if (!path) return;
    update((d) => ({
      ...d,
      pages: d.pages.map((page) => page.path === path ? { ...page, showInMenu: true, menuOrder: d.navigation[groupIndex]?.children.length ?? 0 } : page),
      navigation: d.navigation.map((group, index) => ({ ...group, children: index === groupIndex ? [...group.children.filter((child) => child !== path), path] : group.children.filter((child) => child !== path) })),
    }));
  };
  return <div className="cms-menu">
    <p className="cms-muted">Manage page links inside the six existing top-level groups. Group names, destinations, and the rest of the school header stay locked. No seventh group can be added.</p>
    {draft.navigation.slice(0, 6).map((item, i) => <section className="cms-menu-item" key={item.path}>
      <header><span className="cms-menu-num">{i + 1}</span><div><h3>{item.label}</h3><small>{item.path} · fixed top-level group</small></div></header>
      <ol className="cms-menu-children">
        {item.children.map((child, c) => {
          const page = draft.pages.find((p) => p.path === child);
          return <li key={child}>
            <label className="cms-check"><input type="checkbox" checked={page ? page.showInMenu !== false : true} disabled={!page} onChange={(e) => setVisible(i, child, e.target.checked)} />{fixText(labels.get(child) ?? child)} <small>{child}{!page ? " · fixed link" : ""}</small></label>
            <span className="cms-row-actions">
              <button type="button" className="cms-btn" aria-label={`Move ${labels.get(child) ?? child} up`} disabled={c === 0} onClick={() => updateGroup(i, move(item.children, c, c - 1))}><ArrowUp size={12} /></button>
              <button type="button" className="cms-btn" aria-label={`Move ${labels.get(child) ?? child} down`} disabled={c === item.children.length - 1} onClick={() => updateGroup(i, move(item.children, c, c + 1))}><ArrowDown size={12} /></button>
            </span>
          </li>;
        })}
      </ol>
      <select className="cms-add-child" value="" onChange={(e) => addPage(i, e.target.value)} aria-label={`Add a page under ${item.label}`}>
        <option value="">Add a page to this group…</option>
        {draft.pages.filter((page) => !draft.navigation.some((group) => group.children.includes(page.path))).map((page) => <option key={page.path} value={page.path}>{page.label} ({page.path})</option>)}
      </select>
    </section>)}
  </div>;
}

/* ---------------- Shell ---------------- */

// The "More" dropdown that holds the less-frequent tabs. If one of them is the current
// tab, the button shows that tab's name (and stays highlighted) so staff never lose
// track of where they are. Each item carries its one-line description.
function MoreTabsMenu({ current, onPick, counts }: { current: Tab; onPick: (t: Tab) => void; counts: Record<Tab, number | string> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); };
  }, [open]);
  const activeInMore = MORE_TABS.includes(current);
  return <div className="cms-tabs-more" ref={ref}>
    <button type="button" className={`cms-tabs-more-btn${activeInMore ? " is-active" : ""}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="tab-more">
      {activeInMore ? TAB_META[current].label : "More"} <ChevronDown size={14} />
    </button>
    {open && <div className="cms-tabs-more-menu" role="menu">
      {MORE_TABS.map((id) => <button type="button" key={id} role="menuitem" className={current === id ? "is-active" : ""} onClick={() => { onPick(id); setOpen(false); }} data-testid={`tab-${id}`}>
        <strong>{TAB_META[id].label}{counts[id] !== "" && <span className="cms-more-count">{counts[id]}</span>}</strong>
        <span>{TAB_META[id].desc}</span>
      </button>)}
    </div>}
  </div>;
}

export function SiteManager({ onBack, onSignOut, publicSiteUrl }: { onBack: () => void; onSignOut?: () => void; publicSiteUrl: string }) {
  const query = useGetSiteContentEditor();
  const save = useSaveSiteContentDraft();
  const publish = usePublishSiteContent();
  const restore = useRestoreSiteContentVersion();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<SiteContentState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [draftRevision, setDraftRevision] = useState(1);
  const [tab, setTab] = useState<Tab>(() => { const t = new URLSearchParams(window.location.search).get("tab"); return (t && ALL_TABS.includes(t as Tab) ? t : "visual") as Tab; });
  const [parentPreview, setParentPreview] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error" | "conflict"; text: string } | null>(null);
  // Cross-tab coordination: open a page in the canvas, open a page's settings, and
  // track the selected page's path so "Preview as a parent" opens the right page.
  const [visualRequest, setVisualRequest] = useState<{ key: string; nonce: number } | null>(null);
  const [previewPath, setPreviewPath] = useState("/");
  const openInCanvas = (pageIndex: number) => { setVisualRequest({ key: `page:${pageIndex}`, nonce: Date.now() }); setTab("visual"); };
  const initialized = useRef(false);
  const currentDraft = useRef<SiteContentState | null>(null);
  const revisionRef = useRef(1);
  const changeCount = useRef(0);

  useEffect(() => {
    if (query.data && !initialized.current) {
      initialized.current = true;
      currentDraft.current = query.data.draft;
      revisionRef.current = query.data.draft.revision || query.data.draftBaseRevision || 1;
      setDraftRevision(revisionRef.current);
      setDraft(query.data.draft);
    }
  }, [query.data]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const clickHandler = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download") || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (!window.confirm("Leave without saving your changes?")) { e.preventDefault(); e.stopImmediatePropagation(); }
    };
    window.addEventListener("beforeunload", handler);
    document.addEventListener("click", clickHandler, true);
    return () => {
      window.removeEventListener("beforeunload", handler);
      document.removeEventListener("click", clickHandler, true);
    };
  }, [dirty]);

  const issues = useMemo(() => (draft ? validate(draft) : []), [draft]);
  const update = (fn: (d: SiteContentState) => SiteContentState) => {
    if (!currentDraft.current) return;
    const next = fn(currentDraft.current);
    currentDraft.current = next;
    changeCount.current += 1;
    setDraft(next);
    setDirty(true);
    setFeedback(null);
  };

  const saveDraftNow = async (content: SiteContentState, explicit = false): Promise<boolean> => {
    if (issues.length && explicit) { setFeedback({ kind: "error", text: "Fix the items listed below before saving." }); return false; }
    if (issues.length) return false;
    const changesAtRequest = changeCount.current;
    if (!draft) return false;
    try {
      const result = await save.mutateAsync({ data: { content, expectedDraftRevision: revisionRef.current, createVersion: explicit } });
      const response = result as SiteContentEditorState;
      revisionRef.current = response.draft.revision || revisionRef.current + 1;
      setDraftRevision(revisionRef.current);
      if (changesAtRequest === changeCount.current) {
        currentDraft.current = response.draft;
        setDraft(response.draft);
        setDirty(false);
      }
      qc.setQueryData(query.queryKey, response);
      setFeedback({ kind: "ok", text: explicit ? "Draft saved. Visitors still see the published version." : "Draft saved automatically. Only staff can see these changes." });
      return true;
    } catch (e) {
      const s = errStatus(e);
      if (s === 409) setFeedback({ kind: "conflict", text: "Another editor changed the draft. Reload the latest version before saving again." });
      else if (s === 401 || s === 403) setFeedback({ kind: "error", text: "Not saved: your session expired or your account is not approved. Sign in again." });
      else setFeedback({ kind: "error", text: `Not saved: ${errMsg(e)}. Your edits are still here; try again.` });
      return false;
    }
  };
  useEffect(() => {
    if (!dirty || !draft || save.isPending) return;
    const snapshot = draft;
    const timer = window.setTimeout(() => { void saveDraftNow(snapshot); }, 900);
    return () => window.clearTimeout(timer);
  }, [draft, dirty, save.isPending]);

  const doSave = () => { if (draft) void saveDraftNow(draft, true); };
  const doPublish = async () => {
    if (!draft) return;
    if (issues.length) { setFeedback({ kind: "error", text: "Fix the items listed below before publishing." }); return; }
    try {
      const publishChangeCount = changeCount.current;
      if (dirty && !await saveDraftNow(draft, true)) return;
      if (changeCount.current !== publishChangeCount) {
        setFeedback({ kind: "error", text: "New edits were made while saving. Save the latest draft before publishing." });
        return;
      }
      const result = await publish.mutateAsync({ data: { expectedDraftRevision: revisionRef.current } });
      const response = result as SiteContentEditorState;
      currentDraft.current = response.draft;
      revisionRef.current = response.draft.revision || revisionRef.current;
      setDraftRevision(revisionRef.current);
      setDraft(response.draft);
      setDirty(false);
      qc.setQueryData(query.queryKey, response);
      qc.setQueryData(getGetSiteContentQueryKey(), response.published);
      setFeedback({ kind: "ok", text: "Published. Families can now see the updated website." });
    } catch (e) {
      const s = errStatus(e);
      setFeedback(s === 409
        ? { kind: "conflict", text: "The draft changed before publishing. Reload the latest version and try again." }
        : { kind: "error", text: `Could not publish: ${errMsg(e)}` });
    }
  };
  const restoreVersion = async (versionId: number) => {
    if (!window.confirm("Restore this version into the current draft? Your current draft will be replaced, but the published website will not change.")) return;
    try {
      const result = await restore.mutateAsync({ data: { versionId, expectedDraftRevision: revisionRef.current } });
      const response = result as SiteContentEditorState;
      currentDraft.current = response.draft;
      revisionRef.current = response.draft.revision || revisionRef.current + 1;
      setDraftRevision(revisionRef.current);
      setDraft(response.draft);
      setDirty(false);
      qc.setQueryData(query.queryKey, response);
      setFeedback({ kind: "ok", text: "Version restored to the private draft. Publish when you are ready." });
    } catch (e) {
      setFeedback({ kind: errStatus(e) === 409 ? "conflict" : "error", text: `Could not restore this version: ${errMsg(e)}` });
    }
  };
  const reload = async () => {
    if (dirty && feedback?.kind !== "conflict" && !window.confirm("Discard your unsaved changes and load the latest saved content?")) return;
    const res = await query.refetch();
    if (res.data) {
      currentDraft.current = res.data.draft;
      revisionRef.current = res.data.draft.revision || res.data.draftBaseRevision || 1;
      setDraftRevision(revisionRef.current);
      setDraft(res.data.draft); setDirty(false);
      setFeedback({ kind: "ok", text: `Loaded the latest private draft (revision ${revisionRef.current}).` });
    }
    else setFeedback({ kind: "error", text: "Could not reload content. Check your connection." });
  };

  if (query.isPending || (!draft && !query.isError)) return <div className="admin-message"><p>Loading website content…</p></div>;
  if (query.isError || !draft) return <div className="admin-message" role="alert"><h1>Could not load the website content</h1><p>Nothing can be edited until the content loads.</p><button type="button" className="button" onClick={() => query.refetch()}>Try again</button></div>;

  const counts: Record<Tab, number | string> = { visual: "", home: "", faqs: draft.faqs?.length ?? 0, announcements: draft.announcements?.length ?? 0, inquiries: "", pages: draft.pages.length, staff: draft.staff.length, events: draft.events.length, news: draft.news.length, documents: draft.documents.length, menu: "" };
  return <div className="cms-shell">
    <header className="cms-top">
      <div className="cms-top-id">
        <button type="button" className="cms-btn cms-btn-ghost" onClick={() => { if (!dirty || window.confirm("Leave without saving your changes?")) onBack(); }}><ArrowLeft size={14} /> Editor home</button>
        <div><strong>Colorado Heritage · Site editor</strong><small>Draft revision {draftRevision}{dirty ? " · changes pending" : " · draft saved"}</small></div>
      </div>
      <div className="cms-top-actions">
        <button type="button" className="cms-btn cms-btn-ghost" onClick={() => setParentPreview(true)}>Preview as a parent</button>
        <button type="button" className="cms-btn cms-btn-ghost" onClick={reload}><RotateCw size={14} /> Reload</button>
        <a className="cms-btn cms-btn-ghost" href={publicSiteUrl} target="_blank" rel="noreferrer">Public site <ArrowUpRight size={13} /></a>
        <button type="button" className="cms-btn cms-btn-ghost" onClick={doSave} disabled={save.isPending} data-testid="button-save-site-content"><Save size={14} /> {save.isPending ? "Saving…" : "Save Draft"}</button>
        <button type="button" className="cms-btn cms-btn-primary" onClick={() => void doPublish()} disabled={publish.isPending || save.isPending} data-testid="button-publish-site"><Send size={14} /> {publish.isPending ? "Publishing…" : "Publish changes"}</button>
        {onSignOut && <button type="button" className="cms-btn cms-btn-ghost" onClick={() => { if (!dirty || window.confirm("Sign out without saving your changes?")) onSignOut(); }}>Sign out</button>}
      </div>
    </header>
    {parentPreview && <Suspense fallback={<p role="status">Opening private preview…</p>}><DraftParentPreview draft={draft} initialPath={tab === "visual" || tab === "pages" ? previewPath : tab === "faqs" ? "/faq" : tab === "events" ? "/parents/calendar" : tab === "news" ? "/news" : "/"} onClose={() => setParentPreview(false)}
      onEditPage={(path) => {
        const target = resolveEditTarget(path, draft);
        setParentPreview(false);
        if (target.key) { setVisualRequest({ key: target.key, nonce: Date.now() }); setTab("visual"); }
        else if (target.tab) setTab(target.tab);
        else { setVisualRequest({ key: "home", nonce: Date.now() }); setTab("visual"); }
      }} /></Suspense>}
    <p className="cms-explainer">Edits are saved privately as a draft. Families see changes only after you choose Publish. The school header, navigation, colors, fonts, and footer remain part of the site design.</p>
    {feedback && <div className={`cms-feedback cms-feedback-${feedback.kind}`} role={feedback.kind === "ok" ? "status" : "alert"}>
      {feedback.kind === "ok" ? <Check size={16} /> : <AlertTriangle size={16} />}<span>{feedback.text}</span>
      {feedback.kind === "conflict" && <button type="button" className="cms-btn" onClick={reload}>Reload latest</button>}
    </div>}
    {issues.length > 0 && <div className="cms-feedback cms-feedback-error"><AlertTriangle size={16} /><ul>{issues.slice(0, 6).map((t) => <li key={t}>{t}</li>)}{issues.length > 6 && <li>and {issues.length - 6} more</li>}</ul></div>}
    <MediaHealthBanner />
    <nav className="cms-tabs" aria-label="What do you want to do?">
      {PRIMARY_TABS.map((id) => <button type="button" key={id} className={tab === id ? "is-active" : ""} onClick={() => setTab(id)} data-testid={`tab-${id}`} title={TAB_META[id].desc}>{TAB_META[id].label}{counts[id] !== "" && <span>{counts[id]}</span>}</button>)}
      <MoreTabsMenu current={tab} onPick={setTab} counts={counts} />
    </nav>
    <p className="cms-tab-desc">{TAB_META[tab].desc}</p>
    <main className="cms-body">
      {tab === "visual" && <Suspense fallback={<div className="cms-puck-loading" aria-busy="true"><span /><span /><span /></div>}>
        <VisualPageEditor draft={draft} update={update} requestedKey={visualRequest?.key} requestedNonce={visualRequest?.nonce}
          onSelectionChange={setPreviewPath}
          renderSettings={(pageIndex, onClose) => <PagesEditor draft={draft} update={update} settingsOnly requestedIndex={pageIndex} onClose={onClose} />}
          renderPhotoUploader={(onUploaded) =>
          <PhotoUploader label="Add an accessible photo block" onUploaded={onUploaded} defaultAlt="" />} />
      </Suspense>}
      {tab === "home" && <HomeEditor draft={draft} update={update} />}
      {tab === "faqs" && <FaqEditor draft={draft} update={update} />}
      {tab === "announcements" && <AnnouncementsEditor draft={draft} update={update} />}
      {tab === "inquiries" && <InquiriesInbox />}
      {tab === "pages" && <PagesEditor draft={draft} update={update} onEditInCanvas={openInCanvas} onSelectPath={setPreviewPath} />}
      {tab === "staff" && <StaffEditor draft={draft} update={update} />}
      {tab === "events" && <ArticlesEditor key="events" kind="events" draft={draft} update={update} />}
      {tab === "news" && <ArticlesEditor key="news" kind="news" draft={draft} update={update} />}
      {tab === "documents" && <DocumentsEditor draft={draft} update={update} />}
      {tab === "menu" && <MenuEditor draft={draft} update={update} />}
      <section className="cms-history" aria-labelledby="cms-history-title">
        <div><History size={17} /><div><h2 id="cms-history-title">Version history</h2><p>Each Save Draft creates one full-site checkpoint. Autosaves do not create extra entries. Restoring changes your private draft only.</p></div></div>
        <ol>{(query.data?.versions ?? []).map((version) => <li key={version.id}>
          <span><strong>{version.revision < 0 ? "Saved draft" : "Published version"} {Math.abs(version.revision)}</strong><small>{new Date(version.createdAt).toLocaleString()}</small></span>
          <button type="button" className="cms-btn" disabled={restore.isPending} onClick={() => window.confirm("Restore this complete site snapshot into the private draft? This will replace all current draft content.") && void restoreVersion(version.id)}>Restore to draft</button>
        </li>)}</ol>
      </section>
    </main>
  </div>;
}

export function EditorHome({ onChoose, onSignOut, publicSiteUrl }: { onChoose: (tool: "homepage" | "site") => void; onSignOut?: () => void; publicSiteUrl: string }) {
  return <div className="cms-home">
    <img src={publicAsset("/images/chess-seal.png")} alt="" />
    <span className="section-kicker">Colorado Heritage staff</span>
    <h1>What would you like to update?</h1>
    <p>Save Draft keeps changes private to staff. Families continue to see the published version until you choose Publish.</p>
    <div className="cms-home-choices">
      {([["visual", "Edit a page", "Change the words, photos, and links on any page."], ["announcements", "Post an announcement", "Add a timed notice to the bar above the menu."], ["events", "Add an event", "Put an event on the school calendar."], ["staff", "Update staff", "Add or edit a faculty or staff profile."], ["documents", "Upload a document", "Add a PDF such as the calendar or tuition policy."]] as const).map(([id, title, text]) =>
        <button type="button" key={id} onClick={() => { const u = new URL(window.location.href); u.searchParams.set("tab", id); window.history.replaceState(null, "", u); onChoose("site"); }} data-testid={`choose-${id}`}><strong>{title}</strong><span>{text}</span></button>)}
    </div>
    <p className="cms-home-more">Looking for pages, news, FAQs, menus, inquiries, or home-page settings? <button type="button" className="cms-linklike" onClick={() => { const u = new URL(window.location.href); u.searchParams.set("tab", "visual"); window.history.replaceState(null, "", u); onChoose("site"); }} data-testid="choose-more">Open the editor</button> and use the <strong>More</strong> menu.</p>
    <p className="cms-legacy-link"><button type="button" className="cms-btn cms-btn-ghost" onClick={() => onChoose("homepage")} data-testid="choose-homepage-editor">Legacy homepage tool (old design)</button></p>
    <div className="cms-home-links"><a href={publicSiteUrl}>Visit the public website</a>{onSignOut && <button type="button" onClick={onSignOut}>Sign out</button>}</div>
  </div>;
}

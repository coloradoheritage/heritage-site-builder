import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetSiteContentQueryKey, useGetSiteContent, useSaveSiteContent,
  type CmsArticle, type CmsDocument, type CmsNavigation, type CmsPage, type CmsStaff, type SiteContentState,
} from "@workspace/api-client-react";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, ArrowUpRight, Check, Plus, RotateCw, Save, Trash2 } from "lucide-react";
import { DocumentsContext, MarkdownContent, resolveDocument } from "./markdown";
import { AnnouncementsEditor, FaqEditor, HomeEditor, InquiriesInbox, MediaHealthBanner, PhotoUploader } from "./site-editors";
export { PhotoUploader } from "./site-editors";
import { fixText, mediaUrl, publicAsset, publicPath } from "../lib/cms";
import "./public-site.css";
import "./cms.css";
import { isAdministrative, portraitPosition, staffProfilePath } from "../../directory-helpers.mjs";

type Tab = "home" | "faqs" | "announcements" | "inquiries" | "pages" | "staff" | "events" | "news" | "documents" | "menu";
const TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "Home page" }, { id: "announcements", label: "Announcements" }, { id: "faqs", label: "FAQs" }, { id: "inquiries", label: "Inquiries" },
  { id: "pages", label: "Pages" }, { id: "staff", label: "Faculty & staff" }, { id: "events", label: "Events" },
  { id: "news", label: "News & blog" }, { id: "documents", label: "Documents" }, { id: "menu", label: "Menu" },
];
const PAGE_KINDS = ["content", "overview", "contact", "donate", "gallery", "video", "protected", "archive", "sitemap"];

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

function validate(d: SiteContentState): string[] {
  const extra: string[] = [];
  (d.faqs ?? []).forEach((f, i) => { if (!f.question.trim() || !f.answer.trim()) extra.push(`FAQ ${i + 1} needs both a question and an answer.`); });
  (d.announcements ?? []).forEach((a, i) => { if (!a.title.trim()) extra.push(`Announcement ${i + 1} needs a title.`); if (a.startsAt && a.expiresAt && a.expiresAt <= a.startsAt) extra.push(`Announcement "${a.title}" expires before it starts.`); });
  return [...extra, ...validateBase(d)];
}
function validateBase(d: SiteContentState): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  d.pages.forEach((p, i) => {
    if (!p.path.startsWith("/")) issues.push(`Page ${i + 1} ("${p.label || "untitled"}") needs a web address starting with /.`);
    if (!p.label.trim()) issues.push(`Page ${p.path} needs a menu label.`);
    if (seen.has(p.path)) issues.push(`Two pages share the address ${p.path}.`);
    seen.add(p.path);
  });
  const slugs = new Set<string>();
  d.staff.forEach((s) => {
    if (!s.name.trim()) issues.push("A faculty profile is missing a name.");
    if (!s.slug.trim()) issues.push(`${s.name || "A faculty profile"} needs a link name (slug).`);
    if (slugs.has(s.slug)) issues.push(`Two faculty profiles share the link name "${s.slug}".`);
    slugs.add(s.slug);
    if (s.photo && !s.alt.trim()) issues.push(`${s.name || "A faculty profile"} has a photo without a description (alt text).`);
  });
  (["events", "news"] as const).forEach((k) => d[k].forEach((a) => {
    if (!a.title.trim() || !a.path.startsWith("/")) issues.push(`${k === "news" ? "A news story" : "An event"} needs a title and an address starting with /.`);
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

/** Click-to-edit preview showing the page as visitors see it. */
function EditablePreview({ eyebrow, title, description, markdown, onTitle, onDescription, onMarkdown, publicUrl, documents = [] }: {
  eyebrow: string; title: string; description?: string; markdown: string; documents?: CmsDocument[];
  onTitle: (v: string) => void; onDescription?: (v: string) => void; onMarkdown: (v: string) => void; publicUrl?: string;
}) {
  const [active, setActive] = useState<"title" | "description" | "body" | null>(null);
  return <DocumentsContext.Provider value={documents}><div className="cms-preview chess-public">
    <div className="cms-preview-bar"><span>Live preview. Click any text to edit it.</span>{publicUrl && <a href={publicUrl} target="_blank" rel="noreferrer">Open public page <ArrowUpRight size={12} /></a>}</div>
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
      {active === "body"
        ? <div className="cms-inline-body">
          <textarea autoFocus value={markdown} onChange={(e) => onMarkdown(e.target.value)} rows={18} aria-label="Page text" data-testid="preview-body-input" />
          <div className="cms-inline-help"><span>Formatting: # Heading, **bold**, - list item, [link text](/path)</span><button type="button" className="cms-btn" onClick={() => setActive(null)}><Check size={13} /> Done</button></div>
        </div>
        : <div className="cms-editable cms-editable-body" tabIndex={0} onClick={(e) => { if ((e.target as HTMLElement).closest("a")) e.preventDefault(); setActive("body"); }} onKeyDown={(e) => e.key === "Enter" && setActive("body")} data-testid="preview-edit-body">
          {markdown.trim() ? <MarkdownContent markdown={markdown} /> : <p className="cms-muted">No body text yet. Click to write.</p>}
        </div>}
    </article>
  </div></DocumentsContext.Provider>;
}

/* ---------------- Editors ---------------- */

function PagesEditor({ draft, update }: { draft: SiteContentState; update: (fn: (d: SiteContentState) => SiteContentState) => void }) {
  const [sel, setSel] = useState(0);
  const [filter, setFilter] = useState("");
  const page = draft.pages[sel];
  const set = (patch: Partial<CmsPage>) => update((d) => ({ ...d, pages: d.pages.map((p, i) => (i === sel ? { ...p, ...patch } : p)) }));
  const add = () => {
    const base: CmsPage = { path: `/new-page-${draft.pages.length + 1}`, label: "New page", title: "New page | Colorado Heritage", description: "", markdown: "", kind: "content" };
    update((d) => ({ ...d, pages: [...d.pages, base] }));
    setSel(draft.pages.length);
  };
  const remove = () => {
    if (!page || !window.confirm(`Delete the page "${page.label}" (${page.path})? Visitors will see "page not found" at this address after you save.`)) return;
    update((d) => ({ ...d, pages: d.pages.filter((_, i) => i !== sel), navigation: d.navigation.map((n) => ({ ...n, children: n.children.filter((c) => c !== page.path) })) }));
    setSel(Math.max(0, sel - 1));
  };
  return <div className="cms-split">
    <div>
      <input className="cms-search" placeholder="Find a page…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Find a page" />
      <ListRail items={draft.pages} selected={sel} onSelect={setSel} filter={filter} addLabel="Add page"
        render={(p) => ({ title: fixText(p.label), meta: p.path })}
        onMove={(a, b) => { update((d) => ({ ...d, pages: move(d.pages, a, b) })); if (a === sel) setSel(b); }} onAdd={add} />
    </div>
    {page ? <div className="cms-editor">
      <EditablePreview documents={draft.documents} eyebrow={page.path} title={page.label} description={page.description} markdown={page.markdown}
        onTitle={(label) => set({ label })} onDescription={(description) => set({ description })} onMarkdown={(markdown) => set({ markdown })}
        publicUrl={publicPath(page.path)} />
      {page.documentPath && <p className="cms-muted">Attached document: {page.documentPath} currently opens {resolveDocument(page.documentPath, draft.documents)}. Change the destination on the Documents tab.</p>}
      <details className="cms-settings" open={false}>
        <summary>Page settings: address, browser title, kind, attachments</summary>
        <div className="cms-grid2">
          <Field label="Web address" hint="Changing this breaks old links."><input value={page.path} onChange={(e) => set({ path: e.target.value })} /></Field>
          <Field label="Menu label"><input value={page.label} onChange={(e) => set({ label: e.target.value })} /></Field>
          <Field label="Browser and search title"><input value={page.title} onChange={(e) => set({ title: e.target.value })} /></Field>
          <Field label="Page type"><select value={page.kind} onChange={(e) => set({ kind: e.target.value })}>{[...new Set([...PAGE_KINDS, page.kind])].map((k) => <option key={k}>{k}</option>)}</select></Field>
          <Field label="Attached document (PDF path)" hint="For example /documents/school-calendar.pdf"><input value={page.documentPath ?? ""} onChange={(e) => set({ documentPath: e.target.value || undefined })} /></Field>
          <Field label="External link" hint="Opens another website from this page."><input value={page.externalUrl ?? ""} onChange={(e) => set({ externalUrl: e.target.value || undefined })} /></Field>
        </div>
        <Field label="Search summary (description)"><textarea rows={2} value={page.description} onChange={(e) => set({ description: e.target.value })} /></Field>
        <PhotoUploader label="Add a photo to this page" onUploaded={(url, alt) => set({ markdown: `${page.markdown}\n\n![${alt}](${url})\n` })} />
        <button type="button" className="cms-btn cms-btn-danger" onClick={remove}><Trash2 size={14} /> Delete this page</button>
      </details>
    </div> : <div className="cms-empty"><strong>No pages yet.</strong><p>Add one to get started.</p></div>}
  </div>;
}

function StaffEditor({ draft, update }: { draft: SiteContentState; update: (fn: (d: SiteContentState) => SiteContentState) => void }) {
  const [sel, setSel] = useState(0);
  const person = draft.staff[sel];
  const set = (patch: Partial<CmsStaff>) => update((d) => ({ ...d, staff: d.staff.map((s, i) => (i === sel ? { ...s, ...patch } : s)) }));
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
      <EditablePreview documents={draft.documents} eyebrow={person.role} title={person.name} markdown={person.bio} onTitle={(name) => set({ name })} onMarkdown={(bio) => set({ bio })} publicUrl={publicPath(staffProfilePath(person))} />
      <button type="button" className="cms-btn cms-btn-danger" onClick={remove}><Trash2 size={14} /> Remove this person</button>
    </div> : <div className="cms-empty"><strong>No faculty profiles yet.</strong><p>Add your first teacher.</p></div>}
  </div>;
}

function ArticlesEditor({ kind, draft, update }: { kind: "news" | "events"; draft: SiteContentState; update: (fn: (d: SiteContentState) => SiteContentState) => void }) {
  const [sel, setSel] = useState(0);
  const list = draft[kind];
  const item = list[sel];
  const setList = (fn: (l: CmsArticle[]) => CmsArticle[]) => update((d) => ({ ...d, [kind]: fn(d[kind]) }));
  const set = (patch: Partial<CmsArticle>) => setList((l) => l.map((a, i) => (i === sel ? { ...a, ...patch } : a)));
  const add = () => {
    const today = new Date().toISOString().slice(0, 10);
    const [y, m, dd] = today.split("-");
    setList((l) => [{ path: `/${kind}/${y}/${Number(m)}/${Number(dd)}/new-${kind === "news" ? "story" : "event"}-${l.length + 1}`, title: kind === "news" ? "New story" : "New event", date: today, markdown: "", archived: false }, ...l]);
    setSel(0);
  };
  const remove = () => { if (!item || !window.confirm(`Delete "${item.title}" permanently? To hide it from listings but keep the page, use "Archived" instead.`)) return; setList((l) => l.filter((_, i) => i !== sel)); setSel(Math.max(0, sel - 1)); };
  return <div className="cms-split">
    <ListRail items={list} selected={sel} onSelect={setSel} addLabel={kind === "news" ? "Add story" : "Add event"}
      render={(a) => ({ title: fixText(a.title), meta: `${a.date}${a.archived ? " · archived" : ""}`, muted: a.archived })}
      onMove={(a, b) => { setList((l) => move(l, a, b)); if (a === sel) setSel(b); }} onAdd={add} />
    {item ? <div className="cms-editor">
      <div className="cms-grid2">
        <Field label="Date"><input type="date" value={/^\d{4}-\d{2}-\d{2}/.test(item.date) ? item.date.slice(0, 10) : ""} onChange={(e) => set({ date: e.target.value })} /></Field>
        <Field label="Web address"><input value={item.path} onChange={(e) => set({ path: e.target.value })} /></Field>
      </div>
      <label className="cms-check"><input type="checkbox" checked={item.archived} onChange={(e) => set({ archived: e.target.checked })} /> Archived: hide from public listings (still editable here, and its address still works)</label>
      <EditablePreview documents={draft.documents} eyebrow={kind === "news" ? "News & Blog" : "Calendar & Events"} title={item.title} markdown={item.markdown} onTitle={(title) => set({ title })} onMarkdown={(markdown) => set({ markdown })} publicUrl={publicPath(item.path)} />
      <PhotoUploader label="Add a photo" onUploaded={(url, alt) => set({ markdown: `${item.markdown}\n\n![${alt}](${url})\n` })} />
      <button type="button" className="cms-btn cms-btn-danger" onClick={remove}><Trash2 size={14} /> Delete</button>
    </div> : <div className="cms-empty"><strong>Nothing here yet.</strong></div>}
  </div>;
}

function DocumentsEditor({ draft, update }: { draft: SiteContentState; update: (fn: (d: SiteContentState) => SiteContentState) => void }) {
  const setDocs = (fn: (l: CmsDocument[]) => CmsDocument[]) => update((d) => ({ ...d, documents: fn(d.documents) }));
  return <div className="cms-docs">
    <p className="cms-muted">Documents are linked files such as the school calendar and tuition policy. Every page link that pointed at the original address now opens the current destination you set here, so updating one row updates the site everywhere. PDF uploading is not available here yet; enter a path or full link.</p>
    {draft.documents.map((doc, i) => <div className="cms-doc-row" key={i}>
      <Field label="Title"><input value={doc.title} onChange={(e) => setDocs((l) => l.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} /></Field>
      <Field label="Original link (fixed)" hint="Pages refer to this; it cannot change."><input value={doc.id} readOnly aria-readonly="true" /></Field>
      <Field label="Current destination"><input value={doc.url} onChange={(e) => setDocs((l) => l.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} /></Field>
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
  const setNav = (fn: (l: CmsNavigation[]) => CmsNavigation[]) => update((d) => ({ ...d, navigation: fn(d.navigation) }));
  const setItem = (i: number, patch: Partial<CmsNavigation>) => setNav((l) => l.map((n, j) => (j === i ? { ...n, ...patch } : n)));
  const labels = new Map(draft.pages.map((p) => [p.path, p.label]));
  return <div className="cms-menu">
    <p className="cms-muted">The first six items appear in the main menu, followed by the Praxi Parent Portal and Donate buttons. Every page also stays listed on the sitemap.</p>
    {draft.navigation.map((item, i) => <section className={`cms-menu-item ${i >= 6 ? "is-overflow" : ""}`} key={i}>
      <header>
        <span className="cms-menu-num">{i + 1}</span>
        <Field label="Label"><input value={item.label} onChange={(e) => setItem(i, { label: e.target.value })} /></Field>
        <Field label="Links to"><select value={item.path} onChange={(e) => setItem(i, { path: e.target.value })}>
          {[...new Set([item.path, "/news", "/events", ...draft.pages.map((p) => p.path)])].map((p) => <option key={p} value={p}>{labels.get(p) ?? p} ({p})</option>)}
        </select></Field>
        <span className="cms-row-actions">
          <button type="button" className="cms-btn" aria-label="Move up" onClick={() => setNav((l) => move(l, i, i - 1))}><ArrowUp size={13} /></button>
          <button type="button" className="cms-btn" aria-label="Move down" onClick={() => setNav((l) => move(l, i, i + 1))}><ArrowDown size={13} /></button>
          <button type="button" className="cms-btn cms-btn-danger" aria-label="Remove menu item" onClick={() => window.confirm(`Remove "${item.label}" from the menu? Its pages are not deleted.`) && setNav((l) => l.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
        </span>
      </header>
      {i >= 6 && <p className="cms-status cms-status-error">Not shown: only the first six items appear.</p>}
      <ol className="cms-menu-children">
        {item.children.map((child, c) => <li key={child}>
          <span>{fixText(labels.get(child) ?? child)} <small>{child}</small></span>
          <span className="cms-row-actions">
            <button type="button" aria-label="Move up" onClick={() => setItem(i, { children: move(item.children, c, c - 1) })}><ArrowUp size={12} /></button>
            <button type="button" aria-label="Move down" onClick={() => setItem(i, { children: move(item.children, c, c + 1) })}><ArrowDown size={12} /></button>
            <button type="button" aria-label="Remove" onClick={() => setItem(i, { children: item.children.filter((x) => x !== child) })}><Trash2 size={12} /></button>
          </span>
        </li>)}
      </ol>
      <select className="cms-add-child" value="" onChange={(e) => e.target.value && setItem(i, { children: [...item.children, e.target.value] })} aria-label={`Add a page under ${item.label}`}>
        <option value="">Add a page to this dropdown…</option>
        {[...new Set(["/events", "/news", ...draft.pages.map((p) => p.path)])].filter((p) => !item.children.includes(p)).map((p) => <option key={p} value={p}>{labels.get(p) ?? p} ({p})</option>)}
      </select>
    </section>)}
    <button type="button" className="cms-btn cms-btn-add" onClick={() => setNav((l) => [...l, { label: "New item", path: "/", children: [] }])}><Plus size={14} /> Add menu item</button>
  </div>;
}

/* ---------------- Shell ---------------- */

export function SiteManager({ onBack, onSignOut, publicSiteUrl }: { onBack: () => void; onSignOut?: () => void; publicSiteUrl: string }) {
  const query = useGetSiteContent();
  const save = useSaveSiteContent();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<SiteContentState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<Tab>(() => { const t = new URLSearchParams(window.location.search).get("tab"); return (TABS.some((x) => x.id === t) ? t : "home") as Tab; });
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error" | "conflict"; text: string } | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (query.data && !initialized.current) { initialized.current = true; setDraft(query.data); }
  }, [query.data]);
  useEffect(() => {
    setDirty(Boolean(draft && query.data && JSON.stringify(draft) !== JSON.stringify(query.data)));
  }, [draft, query.data]);
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
  const update = (fn: (d: SiteContentState) => SiteContentState) => { setDraft((d) => (d ? fn(d) : d)); setDirty(true); setFeedback(null); };

  const doSave = async () => {
    if (!draft) return;
    if (issues.length) { setFeedback({ kind: "error", text: "Fix the items listed below before saving." }); return; }
    try {
      const result = await save.mutateAsync({ data: draft });
      setDraft(result);
      qc.setQueryData(getGetSiteContentQueryKey(), result);
      setDirty(false);
      setFeedback({ kind: "ok", text: `Saved at ${new Date().toLocaleTimeString()} (revision ${result.revision}). Visitors now see this content.` });
    } catch (e) {
      const s = errStatus(e);
      if (s === 409) setFeedback({ kind: "conflict", text: "Another editor saved changes while you were working. Reload to get their version, then redo your edits. Your unsaved changes will be lost on reload." });
      else if (s === 401 || s === 403) setFeedback({ kind: "error", text: "Not saved: your session expired or your account is not approved. Sign in again." });
      else setFeedback({ kind: "error", text: `Not saved: ${errMsg(e)}. Your edits are still here; try again.` });
    }
  };
  const reload = async () => {
    if (dirty && feedback?.kind !== "conflict" && !window.confirm("Discard your unsaved changes and load the latest saved content?")) return;
    const res = await query.refetch();
    if (res.data) { setDraft(res.data); setDirty(false); setFeedback({ kind: "ok", text: `Loaded the latest saved content (revision ${res.data.revision}).` }); }
    else setFeedback({ kind: "error", text: "Could not reload content. Check your connection." });
  };

  if (query.isPending || (!draft && !query.isError)) return <div className="admin-message"><p>Loading website content…</p></div>;
  if (query.isError || !draft) return <div className="admin-message" role="alert"><h1>Could not load the website content</h1><p>Nothing can be edited until the content loads.</p><button type="button" className="button" onClick={() => query.refetch()}>Try again</button></div>;

  const counts: Record<Tab, number | string> = { home: "", faqs: draft.faqs?.length ?? 0, announcements: draft.announcements?.length ?? 0, inquiries: "", pages: draft.pages.length, staff: draft.staff.length, events: draft.events.length, news: draft.news.length, documents: draft.documents.length, menu: draft.navigation.length };
  return <div className="cms-shell">
    <header className="cms-top">
      <div className="cms-top-id">
        <button type="button" className="cms-btn cms-btn-ghost" onClick={() => { if (!dirty || window.confirm("Leave without saving your changes?")) onBack(); }}><ArrowLeft size={14} /> Editor home</button>
        <div><strong>Full-site manager</strong><small>Revision {draft.revision}{dirty ? " · unsaved changes" : " · all changes saved"}</small></div>
      </div>
      <div className="cms-top-actions">
        <button type="button" className="cms-btn cms-btn-ghost" onClick={reload}><RotateCw size={14} /> Reload</button>
        <a className="cms-btn cms-btn-ghost" href={publicSiteUrl} target="_blank" rel="noreferrer">Public site <ArrowUpRight size={13} /></a>
        <button type="button" className="cms-btn cms-btn-primary" onClick={doSave} disabled={save.isPending || !dirty} data-testid="button-save-site-content"><Save size={14} /> {save.isPending ? "Saving…" : "Save content"}</button>
        {onSignOut && <button type="button" className="cms-btn cms-btn-ghost" onClick={() => { if (!dirty || window.confirm("Sign out without saving your changes?")) onSignOut(); }}>Sign out</button>}
      </div>
    </header>
    <p className="cms-explainer">Saving updates the words, photos, and menus visitors see right away. It does not publish or change the website's code or design.</p>
    {feedback && <div className={`cms-feedback cms-feedback-${feedback.kind}`} role={feedback.kind === "ok" ? "status" : "alert"}>
      {feedback.kind === "ok" ? <Check size={16} /> : <AlertTriangle size={16} />}<span>{feedback.text}</span>
      {feedback.kind === "conflict" && <button type="button" className="cms-btn" onClick={reload}>Reload latest</button>}
    </div>}
    {issues.length > 0 && <div className="cms-feedback cms-feedback-error"><AlertTriangle size={16} /><ul>{issues.slice(0, 6).map((t) => <li key={t}>{t}</li>)}{issues.length > 6 && <li>and {issues.length - 6} more</li>}</ul></div>}
    <MediaHealthBanner />
    <nav className="cms-tabs" aria-label="Content type">
      {TABS.map((t) => <button type="button" key={t.id} className={tab === t.id ? "is-active" : ""} onClick={() => setTab(t.id)} data-testid={`tab-${t.id}`}>{t.label}<span>{counts[t.id]}</span></button>)}
    </nav>
    <main className="cms-body">
      {tab === "home" && <HomeEditor draft={draft} update={update} />}
      {tab === "faqs" && <FaqEditor draft={draft} update={update} />}
      {tab === "announcements" && <AnnouncementsEditor draft={draft} update={update} />}
      {tab === "inquiries" && <InquiriesInbox />}
      {tab === "pages" && <PagesEditor draft={draft} update={update} />}
      {tab === "staff" && <StaffEditor draft={draft} update={update} />}
      {tab === "events" && <ArticlesEditor key="events" kind="events" draft={draft} update={update} />}
      {tab === "news" && <ArticlesEditor key="news" kind="news" draft={draft} update={update} />}
      {tab === "documents" && <DocumentsEditor draft={draft} update={update} />}
      {tab === "menu" && <MenuEditor draft={draft} update={update} />}
    </main>
  </div>;
}

export function EditorHome({ onChoose, onSignOut, publicSiteUrl }: { onChoose: (tool: "homepage" | "site") => void; onSignOut?: () => void; publicSiteUrl: string }) {
  return <div className="cms-home">
    <img src={publicAsset("/images/chess-seal.png")} alt="" />
    <span className="section-kicker">Colorado Heritage staff</span>
    <h1>What would you like to update?</h1>
    <p>Saves change the content families see. They never publish or change the website's code.</p>
    <div className="cms-home-choices">
      {([["home", "Home page", "Headline, hero photo, and every home section, with a live preview."], ["announcements", "Announcements", "Timed notices in the bar above the menu."], ["faqs", "FAQs", "Questions parents ask, and which show on the home page."], ["inquiries", "Inquiries", "Questions families sent from the website."], ["pages", "All pages & people", "Every page, faculty profiles and photos, events, news, documents."]] as const).map(([id, title, text]) =>
        <button type="button" key={id} onClick={() => { const u = new URL(window.location.href); u.searchParams.set("tab", id); window.history.replaceState(null, "", u); onChoose("site"); }} data-testid={`choose-${id}`}><strong>{title}</strong><span>{text}</span></button>)}
    </div>
    <p className="cms-legacy-link"><button type="button" className="cms-btn cms-btn-ghost" onClick={() => onChoose("homepage")} data-testid="choose-homepage-editor">Legacy homepage tool (old design)</button></p>
    <div className="cms-home-links"><a href={publicSiteUrl}>Visit the public website</a>{onSignOut && <button type="button" onClick={onSignOut}>Sign out</button>}</div>
  </div>;
}

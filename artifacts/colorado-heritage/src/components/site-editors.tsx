import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  useGetInquiries, useGetMediaHealth, type CmsAnnouncement, type CmsFaq, type CmsPage, type SiteContentState,
} from "@workspace/api-client-react";
import { AlertTriangle, ArrowDown, ArrowUp, Check, Copy, GripVertical, ImagePlus, Mail, Phone, Plus, Trash2 } from "lucide-react";
import { announcementStatus, denverNow, hasConfirm, mediaUrl, publicAsset, type SiteContentExt } from "../lib/cms";
import { HomePage } from "./home-page";
import { FaqAccordion } from "./home-page";
import { schoolPhotos, SiteImage } from "./site-image";
import { VisualBodyEditor } from "./rich-markdown-editor";

type Update = (fn: (d: SiteContentState) => SiteContentState) => void;

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return <label className="cms-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
const newId = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Drag-and-drop list with accessible up/down buttons as the keyboard alternative. */
function SortableList<T>({ items, keyOf, onMove, render, label }: { items: T[]; keyOf: (t: T) => string; onMove: (from: number, to: number) => void; render: (t: T, i: number) => ReactNode; label: (t: T) => string }) {
  const dragFrom = useRef<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  return <ol className="cms-sortable">
    {items.map((item, i) => <li key={keyOf(item)} className={over === i ? "is-over" : ""} draggable
      onDragStart={(e) => { dragFrom.current = i; e.dataTransfer.effectAllowed = "move"; }}
      onDragOver={(e) => { e.preventDefault(); setOver(i); }}
      onDragLeave={() => setOver(null)}
      onDrop={(e) => { e.preventDefault(); if (dragFrom.current !== null) onMove(dragFrom.current, i); dragFrom.current = null; setOver(null); }}
      onDragEnd={() => setOver(null)}>
      <div className="cms-sort-handle">
        <GripVertical size={16} aria-hidden="true" />
        <button type="button" className="cms-icon-btn" aria-label={`Move "${label(item)}" up`} disabled={i === 0} onClick={() => onMove(i, i - 1)}><ArrowUp size={14} /></button>
        <button type="button" className="cms-icon-btn" aria-label={`Move "${label(item)}" down`} disabled={i === items.length - 1} onClick={() => onMove(i, i + 1)}><ArrowDown size={14} /></button>
      </div>
      <div className="cms-sort-body">{render(item, i)}</div>
    </li>)}
  </ol>;
}

/* ---------------- Media health ---------------- */

export function MediaHealthBanner() {
  const q = useGetMediaHealth({ query: { retry: false, staleTime: 60_000 } as never });
  if (q.isPending) return null;
  if (q.isError) return <div className="cms-feedback cms-feedback-error" role="alert"><AlertTriangle size={16} /><span>Could not check photo storage. Uploads may not work right now.</span></div>;
  if (!q.data?.configured) return <div className="cms-feedback cms-feedback-error" role="alert"><AlertTriangle size={16} /><span>Photo uploads unavailable: {q.data?.message}</span></div>;
  return <p className="cms-health-ok" role="status"><Check size={14} /> Photo storage ready{q.data.message ? `: ${q.data.message}` : ""}</p>;
}

/* ---------------- Photo uploader (server converts; no browser compression) ---------------- */

const MAX_BYTES = 15 * 1024 * 1024;
const OK_TYPE = /^image\/(jpeg|png|webp|heic|heif)$/i;
const OK_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;

export function PhotoUploader({ label, onUploaded, defaultAlt = "" }: { label: string; portrait?: boolean; onUploaded: (url: string, alt: string) => void; defaultAlt?: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [previewFailed, setPreviewFailed] = useState(false);
  const [alt, setAlt] = useState(defaultAlt);
  const [altError, setAltError] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" | "busy" | "ok" | "error"; text: string }>({ kind: "idle", text: "" });
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useRef(newId("photo")).current;

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const choose = (f: File | null) => {
    setStatus({ kind: "idle", text: "" });
    setPreviewFailed(false);
    if (!f) { setFile(null); setPreview(""); return; }
    if (!OK_TYPE.test(f.type) && !OK_EXT.test(f.name)) { setStatus({ kind: "error", text: "Please choose a JPG, PNG, WebP, or HEIC photo." }); return; }
    if (f.size > MAX_BYTES) { setStatus({ kind: "error", text: `That photo is ${(f.size / 1048576).toFixed(1)} MB. The limit is 15 MB.` }); return; }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    if (!alt.trim()) setAlt(defaultAlt);
  };

  const upload = async () => {
    if (!file) { setStatus({ kind: "error", text: "Choose a photo first." }); return; }
    if (!alt.trim()) { setAltError("Describe the photo before saving. Visitors using screen readers rely on it."); return; }
    setStatus({ kind: "busy", text: "Uploading…" });
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("alt", alt.trim());
      const res = await fetch(`${import.meta.env.BASE_URL}api/media/upload`, { method: "POST", body, credentials: "include" });
      const json = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        const msg = typeof json.error === "string" ? json.error : res.status === 413 ? "The photo is too large." : res.status === 401 || res.status === 403 ? "Your account is not approved to upload photos." : `Upload failed (${res.status}).`;
        setStatus({ kind: "error", text: msg });
        return;
      }
      onUploaded(String(json.url), typeof json.alt === "string" && json.alt ? json.alt : alt.trim());
      setStatus({ kind: "ok", text: "Uploaded. Remember to save your changes." });
      setFile(null); setPreview("");
      if (inputRef.current) inputRef.current.value = "";
    } catch {
      setStatus({ kind: "error", text: "Upload failed: could not reach the server. Check your connection and try again." });
    }
  };

  return <div className="cms-uploader">
    <strong>{label}</strong>
    <details className="cms-photo-library" data-testid="school-photo-library">
      <summary>Choose from the CHESS photo library ({schoolPhotos.length} photos)</summary>
      <p>Choose a school photo below. Its description is included automatically; save your changes to keep the selection.</p>
      <div className="cms-photo-library-grid">{schoolPhotos.map(photo => <button key={photo.filename} type="button" className="cms-library-photo"
        onClick={() => { onUploaded(photo.url, photo.alt); setAlt(photo.alt); setStatus({ kind: "ok", text: "Library photo selected. Remember to save your changes." }); }}>
        <SiteImage src={photo.url} alt={photo.alt} sizes="180px" loading="lazy" />
        <span>{photo.filename}</span>
      </button>)}</div>
    </details>
    <div className="cms-upload-row">
      <label htmlFor={id} className="cms-btn cms-choose" data-testid="button-choose-photo"><ImagePlus size={14} /> Choose photo</label>
      <input ref={inputRef} id={id} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif" onChange={(e) => choose(e.target.files?.[0] ?? null)} data-testid="input-photo-file" />
      <small>JPG, PNG, WebP or HEIC, up to 15 MB. Full photo is kept.</small>
    </div>
    {file && <div className="cms-upload-preview">
      {preview && !previewFailed ? <img src={preview} alt="" onError={() => setPreviewFailed(true)} /> : <span className="cms-upload-nopreview">Preview not available for this format. It will be converted on upload.</span>}
      <span>{file.name} · {(file.size / 1048576).toFixed(1)} MB</span>
    </div>}
    <Field label="Photo description (alt text, required)" hint={altError ? <span className="cms-field-error" role="alert">{altError}</span> : "Describe what is in the photo."}>
      <input value={alt} onChange={(e) => { setAlt(e.target.value); setAltError(""); }} aria-invalid={Boolean(altError)} data-testid="input-photo-alt" />
    </Field>
    <button type="button" className="cms-btn cms-btn-primary" onClick={upload} disabled={!file || status.kind === "busy"} data-testid="button-upload-photo">{status.kind === "busy" ? "Uploading…" : "Upload photo"}</button>
    {status.text && <p className={`cms-status cms-status-${status.kind}`} role={status.kind === "error" ? "alert" : "status"}>{status.text}</p>}
  </div>;
}

/* ---------------- Home page ---------------- */

export function HomeEditor({ draft, update }: { draft: SiteContentState; update: Update }) {
  const d = draft as SiteContentExt;
  const home = d.home;
  const set = (patch: Partial<CmsPage>) => update((x) => {
    const current = x.home ?? { path: "/", label: "", title: "", description: "", markdown: "", kind: "home" };
    const next = { ...current, ...patch };
    if (typeof patch.markdown === "string" && next.blocks && typeof next.blocks === "object" && Array.isArray((next.blocks as { content?: unknown }).content)) {
      const payload = next.blocks as { content: Array<{ type: string; props: Record<string, unknown> }>; [key: string]: unknown };
      if (payload.content.some((block) => block.type === "LegacyMarkdown")) {
        next.blocks = { ...payload, content: payload.content.map((block) => block.type === "LegacyMarkdown" ? { ...block, props: { ...block.props, markdown: patch.markdown } } : block) };
      }
    }
    return { ...x, home: next };
  });
  if (!home) return <div className="cms-empty-state"><h2>No home page yet</h2><p>Create the home page record to start editing.</p>
    <button type="button" className="cms-btn cms-btn-primary" onClick={() => set({ label: "A Christ-Centered Education, With Your Family at the Center", title: "Christian Homeschool Partnership in Greeley, CO | CHESS" })}><Plus size={14} /> Create home page</button></div>;
  return <div className="cms-split">
    <div className="cms-form">
      <h2>Home page</h2>
      <Field label="Main headline (H1)"><input value={home.label} onChange={(e) => set({ label: e.target.value })} data-testid="input-home-h1" /></Field>
      <Field label="Hero subhead"><textarea rows={3} value={home.description} onChange={(e) => set({ description: e.target.value })} data-testid="input-home-subhead" /></Field>
      <details className="cms-settings">
        <summary>Search settings (optional)</summary>
        <Field label="Search description" hint="A short summary shown in search results."><textarea rows={2} maxLength={155} value={home.metaDescription ?? ""} onChange={(e) => set({ metaDescription: e.target.value })} data-testid="input-home-meta-description" /></Field>
        <Field label="Search title" hint={`${home.title.length} characters. Leave this as-is unless you know it needs changing.`}><input value={home.title} onChange={(e) => set({ title: e.target.value })} data-testid="input-home-title" /></Field>
      </details>
      <div className="cms-hero-photo">
        {d.homeImage ? <img src={mediaUrl(d.homeImage)} alt={d.homeImageAlt || "Current hero photo"} /> : <p className="cms-confirm">[CONFIRM: upload an approved CHESS classroom or family photo.]</p>}
        <Field label="Hero photo description (alt)"><input value={d.homeImageAlt ?? ""} onChange={(e) => update((x) => ({ ...x, homeImageAlt: e.target.value }))} data-testid="input-home-image-alt" /></Field>
      </div>
      <PhotoUploader label="Replace hero photo" defaultAlt={d.homeImageAlt ?? ""} onUploaded={(url, alt) => update((x) => ({ ...x, homeImage: url, homeImageAlt: alt }))} />
      <div className="cms-field">
        <span>Homepage sections</span>
        <small>Edit section text, add photos, and arrange content in the Visual editor tab.</small>
      </div>
    </div>
    <div className="cms-live-preview" onClickCapture={(e) => { if ((e.target as Element).closest("a")) e.preventDefault(); }} aria-label="Home page preview">
      <span className="cms-preview-label">Live preview</span>
      <div className="cb-site cms-preview-frame"><HomePage content={d} /></div>
    </div>
  </div>;
}

/* ---------------- FAQs ---------------- */

export function FaqEditor({ draft, update }: { draft: SiteContentState; update: Update }) {
  const faqs = draft.faqs ?? [];
  const setFaqs = (fn: (f: CmsFaq[]) => CmsFaq[]) => update((x) => ({ ...x, faqs: fn(x.faqs ?? []) }));
  const patch = (id: string, p: Partial<CmsFaq>) => setFaqs((f) => f.map((q) => (q.id === id ? { ...q, ...p } : q)));
  return <div className="cms-form cms-wide">
    <div className="cms-row-head"><h2>Frequently asked questions</h2>
      <button type="button" className="cms-btn" onClick={() => setFaqs((f) => [...f, { id: newId("faq"), question: "", answer: "", showOnHome: false }])} data-testid="button-add-faq"><Plus size={14} /> Add question</button></div>
    <p className="cms-help">All questions appear on the FAQ page. Turn on “Show on home page” to feature one there. If you see [CONFIRM], verify that detail before saving.</p>
    {!faqs.length && <div className="cms-empty-state"><p>No questions yet.</p></div>}
    <SortableList items={faqs} keyOf={(f) => f.id} label={(f) => f.question || "Untitled"} onMove={(a, b) => setFaqs((f) => move(f, a, b))} render={(f) => <div className="cms-faq-edit">
      <Field label="Question"><input value={f.question} onChange={(e) => patch(f.id, { question: e.target.value })} data-testid={`input-faq-q-${f.id}`} /></Field>
        <div className="cms-field">
          <span>Answer</span>
          <VisualBodyEditor markdown={f.answer} onMarkdown={(answer) => patch(f.id, { answer })} testId={`input-faq-a-${f.id}`} ariaLabel={`Answer for ${f.question || "new question"}`} />
        </div>
      <div className="cms-inline">
        <label className="cms-check"><input type="checkbox" checked={f.showOnHome} onChange={(e) => patch(f.id, { showOnHome: e.target.checked })} data-testid={`check-faq-home-${f.id}`} /> Show on home page</label>
        {(hasConfirm(f.question) || hasConfirm(f.answer)) && <span className="cms-pill is-warn">Has [CONFIRM], not in search data</span>}
        <button type="button" className="cms-btn cms-btn-ghost cms-danger" onClick={() => { if (window.confirm(`Delete "${f.question || "this question"}"?`)) setFaqs((x) => x.filter((q) => q.id !== f.id)); }}><Trash2 size={14} /> Delete</button>
      </div>
    </div>} />
    {faqs.length > 0 && <details className="cms-preview-details"><summary>Preview as visitors see it</summary><div className="cb-site"><FaqAccordion faqs={faqs} /></div></details>}
  </div>;
}

/* ---------------- Announcements ---------------- */

export function AnnouncementsEditor({ draft, update }: { draft: SiteContentState; update: Update }) {
  const list = draft.announcements ?? [];
  const now = denverNow();
  const setList = (fn: (a: CmsAnnouncement[]) => CmsAnnouncement[]) => update((x) => ({ ...x, announcements: fn(x.announcements ?? []) }));
  const patch = (id: string, p: Partial<CmsAnnouncement>) => setList((l) => l.map((a) => (a.id === id ? { ...a, ...p } : a)));
  const blank = (): CmsAnnouncement => ({ id: newId("ann"), enabled: false, title: "", text: "" });
  return <div className="cms-form cms-wide">
    <div className="cms-row-head"><h2>Announcements</h2>
      <button type="button" className="cms-btn" onClick={() => setList((l) => [blank(), ...l])} data-testid="button-add-announcement"><Plus size={14} /> New announcement</button></div>
    <p className="cms-help">Times are Colorado time (America/Denver). Live announcements show in a bar above the menu; visitors' pages refresh within 30 seconds. Expired ones hide automatically.</p>
    {!list.length && <div className="cms-empty-state"><p>No announcements. The bar is hidden.</p></div>}
    <SortableList items={list} keyOf={(a) => a.id} label={(a) => a.title || "Untitled"} onMove={(a, b) => setList((l) => move(l, a, b))} render={(a) => {
      const status = announcementStatus(a, now);
      return <div className="cms-ann-edit">
        <div className="cms-inline">
          <span className={`cms-pill is-${status.toLowerCase()}`} data-testid={`status-announcement-${a.id}`}>{status}</span>
          <label className="cms-check"><input type="checkbox" checked={a.enabled} onChange={(e) => patch(a.id, { enabled: e.target.checked })} data-testid={`toggle-announcement-${a.id}`} /> On</label>
          <button type="button" className="cms-btn cms-btn-ghost" onClick={() => setList((l) => { const i = l.findIndex((x) => x.id === a.id); const copy = { ...a, id: newId("ann"), enabled: false, title: `${a.title} (copy)` }; return [...l.slice(0, i + 1), copy, ...l.slice(i + 1)]; })}><Copy size={14} /> Duplicate</button>
          <button type="button" className="cms-btn cms-btn-ghost cms-danger" onClick={() => { if (window.confirm(`Delete "${a.title || "this announcement"}"?`)) setList((l) => l.filter((x) => x.id !== a.id)); }}><Trash2 size={14} /> Delete</button>
        </div>
        <Field label="Title"><input value={a.title} onChange={(e) => patch(a.id, { title: e.target.value })} /></Field>
        <Field label="Text"><textarea rows={2} value={a.text} onChange={(e) => patch(a.id, { text: e.target.value })} /></Field>
        <div className="cms-grid-3">
          <Field label="Button label (optional)"><input value={a.buttonLabel ?? ""} onChange={(e) => patch(a.id, { buttonLabel: e.target.value || undefined })} /></Field>
          <Field label="Link to an event"><select value={a.eventPath ?? ""} onChange={(e) => patch(a.id, { eventPath: e.target.value || undefined, url: e.target.value ? undefined : a.url })}>
            <option value="">None</option>
            {draft.events.filter((e) => !e.archived).map((e) => <option key={e.path} value={e.path}>{e.title}</option>)}
          </select></Field>
          <Field label="Or a web address"><input value={a.url ?? ""} placeholder="/admissions/visit or https://…" onChange={(e) => patch(a.id, { url: e.target.value || undefined, eventPath: e.target.value ? undefined : a.eventPath })} /></Field>
        </div>
        <div className="cms-grid-3">
          <Field label="Starts (optional)"><input type="datetime-local" value={a.startsAt ?? ""} onChange={(e) => patch(a.id, { startsAt: e.target.value || undefined })} /></Field>
          <Field label="Expires (optional)"><input type="datetime-local" value={a.expiresAt ?? ""} onChange={(e) => patch(a.id, { expiresAt: e.target.value || undefined })} /></Field>
        </div>
      </div>;
    }} />
  </div>;
}

/* ---------------- Inquiries (read-only) ---------------- */

export function InquiriesInbox() {
  const q = useGetInquiries({ query: { retry: false } as never });
  const list = [...(q.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return <div className="cms-form cms-wide">
    <h2>Inquiries</h2>
    <p className="cms-help">Questions sent from the website forms. These are not emailed. Check here and reply by email or phone.</p>
    {q.isPending && <p>Loading…</p>}
    {q.isError && <div className="cms-feedback cms-feedback-error" role="alert"><AlertTriangle size={16} /><span>Could not load inquiries.</span><button type="button" className="cms-btn" onClick={() => q.refetch()}>Try again</button></div>}
    {q.data && !list.length && <div className="cms-empty-state"><p>No inquiries yet.</p></div>}
    <ul className="cms-inbox">{list.map((i) => <li key={i.id} data-testid={`inquiry-${i.id}`}>
      <div className="cms-inline"><strong>{i.parentName}</strong><span className="cms-pill">{i.program}</span><small>{new Date(i.createdAt).toLocaleString("en-US", { timeZone: "America/Denver", dateStyle: "medium", timeStyle: "short" })}</small></div>
      <p>Grades: {i.grades}</p>
      {i.question && <blockquote>{i.question}</blockquote>}
      <div className="cms-inline"><a href={`mailto:${i.email}`}><Mail size={14} /> {i.email}</a>{i.phone && <a href={`tel:${i.phone}`}><Phone size={14} /> {i.phone}</a>}</div>
    </li>)}</ul>
  </div>;
}

// The staff "Blog posts" screen: a plain list of posts (drafts and published) and one simple page to write one.
// Posts are ordinary news articles (CmsArticle) in the site draft, so saving, autosave, preview, publish, version
// history and the public /news pages all work exactly as they do for the rest of the site.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowUpRight, Check, Eye, PenLine, Plus, Send, Trash2 } from "lucide-react";
import type { CmsArticle, CmsPage, SiteContentState } from "@workspace/api-client-react";
import { PostBodyEditor } from "./puck-content";
import { PhotoUploader } from "./site-editors";
import { SiteImage } from "./site-image";
import { fixText, formatDate, publicPath } from "../lib/cms";

type Update = (fn: (d: SiteContentState) => SiteContentState) => void;

const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const slugify = (title: string) => title.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "post";
const isPlaceholderPath = (path: string) => /\/untitled-post(?:-\d+)?$/.test(path);
function uniquePath(date: string, slug: string, taken: Set<string>) {
  const [y, m, d] = (/^\d{4}-\d{2}-\d{2}/.test(date) ? date : localToday()).split("-");
  const base = `/news/${y}/${Number(m)}/${Number(d)}/${slug}`;
  let path = base;
  for (let n = 2; taken.has(path); n += 1) path = `${base}-${n}`;
  return path;
}

type Status = "draft" | "live" | "edited";
const STATUS_LABEL: Record<Status, string> = { draft: "Draft", live: "Published", edited: "Published · edits not live yet" };
function statusOf(post: CmsArticle, liveCopy: CmsArticle | undefined): Status {
  if (post.draft || !liveCopy) return "draft";
  return JSON.stringify(post) === JSON.stringify(liveCopy) ? "live" : "edited";
}

const hasBodyContent = (post: CmsArticle) => {
  const blocks = (post.blocks as { content?: Array<{ type?: string }> } | undefined)?.content;
  return Boolean(post.markdown.trim()) || Boolean(blocks?.length);
};
const isBlankPost = (post: CmsArticle) => !post.title.trim() && !post.summary?.trim() && !post.coverImage && !hasBodyContent(post);

/** What must be fixed before a post can go live, in plain words. */
export function publishIssues(post: CmsArticle): string[] {
  const issues: string[] = [];
  if (!post.title.trim()) issues.push("Give the post a title.");
  if (!hasBodyContent(post)) issues.push("Write something in the post, or add a photo.");
  if (post.coverImage && !post.coverAlt?.trim()) issues.push("Describe the cover photo (the photo description box).");
  const blocks = ((post.blocks as { content?: Array<{ type?: string; props?: Record<string, unknown> }> } | undefined)?.content ?? []);
  blocks.forEach((block) => {
    const image = block.props?.image as { url?: string; alt?: string } | undefined;
    if ((block.type === "Photo" || block.type === "PhotoWithText") && image?.url && !image.alt?.trim()) issues.push("Describe every photo in the post (the photo description box).");
    if (block.type === "Gallery" && Array.isArray(block.props?.images) && (block.props!.images as Array<{ url?: string; alt?: string }>).some((photo) => photo.url && !photo.alt?.trim())) issues.push("Describe every photo in the gallery.");
    if (block.type === "VideoOrMap" && block.props && String(block.props.url ?? "").trim() === "") issues.push("A video block has no YouTube link yet. Add one or remove the block.");
  });
  return [...new Set(issues)];
}

/** Areas of the site (other than this post) that have saved changes waiting, which publishing would also send live. */
export function otherPendingChanges(draft: SiteContentState, published: SiteContentState | undefined, path: string): string[] {
  if (!published) return [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const labels: Array<[string, boolean]> = [
    ["pages", !same(draft.pages, published.pages)],
    ["the home page", !same(draft.home, published.home) || draft.homeImage !== published.homeImage || draft.homeImageAlt !== published.homeImageAlt],
    ["staff profiles", !same(draft.staff, published.staff)],
    ["events", !same(draft.events, published.events)],
    ["documents", !same(draft.documents, published.documents)],
    ["FAQs", !same(draft.faqs, published.faqs)],
    ["announcements", !same(draft.announcements, published.announcements)],
    ["menu links", !same(draft.navigation, published.navigation)],
    ["other blog posts", !same(draft.news.filter((a) => !a.draft && a.path !== path), published.news.filter((a) => a.path !== path))],
  ];
  return labels.filter(([, changed]) => changed).map(([label]) => label);
}

/* ---------------- Confirmation dialog ---------------- */

function ConfirmDialog({ title, children, confirmLabel, danger, onConfirm, onCancel, busy, testId }: {
  title: string; children: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; testId: string;
  onConfirm: () => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { cancelRef.current?.focus(); }, []);
  return <div className="cms-dialog-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
    <div className="cms-dialog" role="alertdialog" aria-modal="true" aria-labelledby={`${testId}-title`} ref={ref} data-testid={testId}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) { event.stopPropagation(); onCancel(); return; }
        if (event.key !== "Tab") return;
        const buttons = [...(ref.current?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]") ?? [])];
        if (!buttons.length) return;
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}>
      <h2 id={`${testId}-title`}>{title}</h2>
      <div className="cms-dialog-body">{children}</div>
      <div className="cms-dialog-actions">
        <button type="button" className="cms-btn" ref={cancelRef} onClick={onCancel} disabled={busy} data-testid={`${testId}-cancel`}>Cancel</button>
        <button type="button" className={`cms-btn ${danger ? "cms-btn-danger" : "cms-btn-primary"}`} onClick={onConfirm} disabled={busy} data-testid={`${testId}-confirm`}>{busy ? "Working…" : confirmLabel}</button>
      </div>
    </div>
  </div>;
}

/* ---------------- The screen ---------------- */

type Confirm = { kind: "publish" | "unpublish" | "delete"; path: string } | null;

export default function BlogEditor({ draft, published, update, dirty, saving, onSaveNow, onPublish, onPreview, requestedPath, requestedNonce, startNew, onStartNewHandled }: {
  draft: SiteContentState;
  published: SiteContentState | undefined;
  update: Update;
  dirty: boolean;
  saving: boolean;
  onSaveNow: () => Promise<boolean>;
  /** Saves the draft and publishes the site. `mutate` runs first (e.g. mark this post published). */
  onPublish: (mutate?: (d: SiteContentState) => SiteContentState) => Promise<boolean>;
  onPreview: (path: string) => void;
  requestedPath?: string | null;
  requestedNonce?: number;
  startNew?: boolean;
  onStartNewHandled?: () => void;
}) {
  const [editingPath, setEditingPath] = useState<string | null>(null);
  // Bumped only when a different post is opened, so the body editor is rebuilt for it but never when the same
  // post's web address is generated from its title.
  const [session, setSession] = useState(0);
  const pathRef = useRef<string | null>(null);
  pathRef.current = editingPath;
  const openPost = (path: string) => { setEditingPath(path); setSession((n) => n + 1); setNotice(""); };
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<string[] | null>(null);
  const [filter, setFilter] = useState<"all" | "draft" | "published">("all");
  const [shown, setShown] = useState(20);
  const [notice, setNotice] = useState("");
  const liveByPath = useMemo(() => new Map((published?.news ?? []).map((post) => [post.path, post])), [published]);
  const posts = useMemo(() => [...draft.news].sort((a, b) => (b.date || "").localeCompare(a.date || "")), [draft.news]);
  const editing = editingPath ? draft.news.find((post) => post.path === editingPath) : undefined;

  const setNews = (fn: (list: CmsArticle[]) => CmsArticle[]) => update((d) => ({ ...d, news: fn(d.news) }));
  const patchPost = (path: string, patch: Partial<CmsArticle>) => setNews((list) => list.map((post) => (post.path === path ? { ...post, ...patch } : post)));

  const createPost = () => {
    const taken = new Set(draft.news.map((post) => post.path));
    const date = localToday();
    const path = uniquePath(date, "untitled-post", taken);
    setNews((list) => [{ path, title: "", date, markdown: "", archived: false, draft: true }, ...list]);
    openPost(path);
  };

  const consumedNew = useRef(false);
  useEffect(() => {
    if (!startNew || consumedNew.current) return;
    consumedNew.current = true;
    createPost();
    onStartNewHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startNew]);
  useEffect(() => {
    if (requestedPath && draft.news.some((post) => post.path === requestedPath)) openPost(requestedPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedPath, requestedNonce]);

  const leaveEditor = () => {
    if (editing && editing.draft && isBlankPost(editing)) setNews((list) => list.filter((post) => post.path !== editing.path));
    setEditingPath(null);
  };

  const requestPublish = (post: CmsArticle) => {
    const found = publishIssues(post);
    if (found.length) { setIssues(found); return; }
    setIssues(null);
    setConfirm({ kind: "publish", path: post.path });
  };

  const runConfirmed = async () => {
    if (!confirm) return;
    const post = draft.news.find((item) => item.path === confirm.path);
    if (!post) { setConfirm(null); return; }
    setBusy(true);
    let ok = false;
    let publishedPath = post.path;
    if (confirm.kind === "publish") {
      if (isPlaceholderPath(post.path)) {
        publishedPath = uniquePath(post.date, slugify(post.title), new Set(draft.news.filter((item) => item.path !== post.path).map((item) => item.path)));
      }
      ok = await onPublish((d) => ({ ...d, news: d.news.map((item) => (item.path === post.path ? { ...item, path: publishedPath, draft: false, archived: false } : item)) }));
      if (ok) setNotice(`"${post.title}" is published.`);
    } else if (confirm.kind === "unpublish") {
      ok = await onPublish((d) => ({ ...d, news: d.news.map((item) => (item.path === post.path ? { ...item, draft: true } : item)) }));
      if (ok) setNotice(`"${post.title || "The post"}" is no longer on the website. It is saved as a draft.`);
    } else {
      const wasLive = liveByPath.has(post.path);
      if (wasLive) ok = await onPublish((d) => ({ ...d, news: d.news.filter((item) => item.path !== post.path) }));
      else { setNews((list) => list.filter((item) => item.path !== post.path)); ok = await onSaveNow(); }
      if (ok) setNotice(`"${post.title || "Untitled post"}" was deleted.`);
    }
    setBusy(false);
    setConfirm(null);
    if (ok && confirm.kind === "delete" && editingPath === confirm.path) setEditingPath(null);
    if (ok && confirm.kind === "publish" && publishedPath !== post.path) setEditingPath(publishedPath);
  };

  const confirmPost = confirm ? draft.news.find((post) => post.path === confirm.path) : undefined;
  const pending = confirm && confirmPost ? otherPendingChanges(draft, published, confirmPost.path) : [];
  const pendingText = pending.length ? <p className="cms-dialog-warn" data-testid="confirm-other-changes">Heads up: saved changes to {pending.join(", ")} are also waiting. Publishing sends them live too.</p> : null;

  const dialog = confirm && confirmPost && (
    confirm.kind === "publish"
      ? <ConfirmDialog testId="confirm-publish" title="Publish this post?" confirmLabel="Publish now" busy={busy} onCancel={() => setConfirm(null)} onConfirm={runConfirmed}>
          <p><strong>{fixText(confirmPost.title)}</strong> will appear on the website right away, at the top of the blog list.</p>{pendingText}
        </ConfirmDialog>
      : confirm.kind === "unpublish"
        ? <ConfirmDialog testId="confirm-unpublish" title="Take this post off the website?" confirmLabel="Unpublish" busy={busy} onCancel={() => setConfirm(null)} onConfirm={runConfirmed}>
            <p>Visitors will no longer see <strong>{fixText(confirmPost.title || "this post")}</strong>. It stays here as a draft and you can publish it again later.</p>{pendingText}
          </ConfirmDialog>
        : <ConfirmDialog testId="confirm-delete" title="Delete this post?" confirmLabel="Delete post" danger busy={busy} onCancel={() => setConfirm(null)} onConfirm={runConfirmed}>
            <p><strong>{fixText(confirmPost.title || "Untitled post")}</strong> will be deleted.{liveByPath.has(confirmPost.path) ? " It is on the website now, so it will disappear from the website right away." : ""} This cannot be undone from here.</p>{liveByPath.has(confirmPost.path) ? pendingText : null}
          </ConfirmDialog>
  );

  /* ---------- Edit view ---------- */
  if (editing) {
    const liveCopy = liveByPath.get(editing.path);
    const status = statusOf(editing, liveCopy);
    const savedLabel = saving ? "Saving…" : dirty ? "Saving soon…" : "All changes saved";
    const set = (patch: Partial<CmsArticle>) => patchPost(editing.path, patch);
    const settleSlug = () => {
      if (!editing.title.trim() || !isPlaceholderPath(editing.path)) return;
      const taken = new Set(draft.news.filter((item) => item.path !== editing.path).map((item) => item.path));
      const path = uniquePath(editing.date, slugify(editing.title), taken);
      patchPost(editing.path, { path });
      setEditingPath(path);
    };
    return <div className="cms-blog" data-testid="blog-edit">
      <div className="cms-blog-bar">
        <button type="button" className="cms-btn" onClick={leaveEditor} data-testid="blog-back"><ArrowLeft size={14} /> All posts</button>
        <span className={`cms-pill cms-status-${status}`} data-testid="blog-status">{STATUS_LABEL[status]}</span>
        <span className="cms-blog-saved" role="status" data-testid="blog-saved">{savedLabel}</span>
        <span className="cms-blog-actions">
          <button type="button" className="cms-btn" onClick={() => void onSaveNow()} data-testid="blog-save"><Check size={14} /> Save draft</button>
          <button type="button" className="cms-btn" onClick={() => onPreview(editing.path)} data-testid="blog-preview"><Eye size={14} /> Preview as a parent</button>
          {status === "live"
            ? <button type="button" className="cms-btn" onClick={() => setConfirm({ kind: "unpublish", path: editing.path })} data-testid="blog-unpublish">Unpublish</button>
            : <button type="button" className="cms-btn cms-btn-primary" onClick={() => requestPublish(editing)} data-testid="blog-publish"><Send size={14} /> {status === "edited" ? "Publish changes" : "Publish"}</button>}
        </span>
      </div>
      {notice && <p className="cms-blog-notice" role="status" data-testid="blog-notice">{notice}</p>}
      {issues && <div className="cms-feedback cms-feedback-error" role="alert" data-testid="blog-issues"><span>Before publishing:</span><ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
      <div className="cms-blog-page">
        <label className="cms-blog-title-label"><span className="sr-only">Post title</span>
          <input className="cms-blog-title" value={editing.title} placeholder="Post title" onChange={(event) => set({ title: event.target.value })} onBlur={settleSlug} data-testid="blog-title" maxLength={160} />
        </label>
        <div className="cms-blog-meta">
          <label>Date <input type="date" value={/^\d{4}-\d{2}-\d{2}/.test(editing.date) ? editing.date.slice(0, 10) : ""} onChange={(event) => set({ date: event.target.value })} data-testid="blog-date" /></label>
          <label>Author <small>(optional)</small><input value={editing.author ?? ""} placeholder="Your name" onChange={(event) => set({ author: event.target.value || undefined })} data-testid="blog-author" /></label>
        </div>
        <label className="cms-blog-summary">Short summary <small>(optional, shown in the list of posts)</small>
          <textarea rows={2} maxLength={300} value={editing.summary ?? ""} onChange={(event) => set({ summary: event.target.value || undefined })} data-testid="blog-summary" />
        </label>
        <section className="cms-blog-cover" aria-label="Cover photo">
          <h2>Cover photo <small>(optional)</small></h2>
          {editing.coverImage
            ? <div className="cms-blog-cover-set">
                <SiteImage className="cms-post-thumb cms-blog-cover-img" src={editing.coverImage} alt={editing.coverAlt ?? ""} loading="lazy" />
                <div className="cms-blog-cover-fields">
                  <label>Photo description <small>(read aloud for people who cannot see the photo)</small><input value={editing.coverAlt ?? ""} onChange={(event) => set({ coverAlt: event.target.value })} data-testid="blog-cover-alt" /></label>
                  <label>Caption <small>(optional)</small><input value={editing.coverCaption ?? ""} onChange={(event) => set({ coverCaption: event.target.value || undefined })} data-testid="blog-cover-caption" /></label>
                  <details className="cms-post-replace"><summary>Replace photo</summary>
                    <PhotoUploader label="Choose or upload a new cover photo" defaultAlt={editing.coverAlt ?? ""} onUploaded={(url, alt) => set({ coverImage: url, coverAlt: alt || editing.coverAlt || "" })} /></details>
                  <button type="button" className="cms-post-remove" onClick={() => set({ coverImage: undefined, coverAlt: undefined, coverCaption: undefined })} data-testid="blog-cover-remove">Remove cover photo</button>
                </div>
              </div>
            : <PhotoUploader label="Choose or upload a cover photo" defaultAlt="" onUploaded={(url, alt) => set({ coverImage: url, coverAlt: alt })} />}
        </section>
        <section className="cms-blog-body" aria-label="Post body">
          <h2>Your post</h2>
          <p className="cms-post-hint">Click in the text and type. Select words to make them bold, a heading, or a link. Use <strong>Add a block</strong> for photos, quotes, lists, videos, buttons, and more.</p>
          <PostBodyEditor key={session} blocks={editing.blocks} markdown={editing.markdown} pages={draft.pages as CmsPage[]}
            onChange={({ blocks, markdown }) => patchPost(pathRef.current ?? editing.path, { blocks: blocks as unknown as CmsArticle["blocks"], ...(markdown !== null ? { markdown } : {}) })} />
        </section>
        <div className="cms-blog-foot">
          {status !== "draft" || liveCopy ? <a className="cms-btn cms-btn-ghost" href={publicPath(editing.path)} target="_blank" rel="noreferrer">Open the live post <ArrowUpRight size={13} /></a> : <span />}
          <button type="button" className="cms-btn cms-btn-ghost cms-danger" onClick={() => setConfirm({ kind: "delete", path: editing.path })} data-testid="blog-delete"><Trash2 size={14} /> Delete this post</button>
        </div>
      </div>
      {dialog}
    </div>;
  }

  /* ---------- List view ---------- */
  const visible = posts.filter((post) => {
    const status = statusOf(post, liveByPath.get(post.path));
    return filter === "all" || (filter === "draft" ? status === "draft" : status !== "draft");
  });
  return <div className="cms-blog" data-testid="blog-list">
    <div className="cms-blog-listhead">
      <div><h2>Blog posts</h2><p className="cms-help">Write news and stories for families. A post stays private until you publish it.</p></div>
      <button type="button" className="cms-btn cms-btn-primary cms-btn-big" onClick={createPost} data-testid="blog-new"><PenLine size={16} /> Write a blog post</button>
    </div>
    {notice && <p className="cms-blog-notice" role="status" data-testid="blog-notice">{notice}</p>}
    <div className="cms-blog-filter" role="group" aria-label="Show">
      {(["all", "draft", "published"] as const).map((value) => <button type="button" key={value} className={filter === value ? "is-active" : ""} aria-pressed={filter === value} onClick={() => { setFilter(value); setShown(20); }} data-testid={`blog-filter-${value}`}>{value === "all" ? "All" : value === "draft" ? "Drafts" : "Published"}</button>)}
    </div>
    {!visible.length && <div className="cms-empty-state" data-testid="blog-empty"><p>{filter === "draft" ? "No drafts right now." : filter === "published" ? "Nothing is published yet." : "No posts yet. Write your first one."}</p></div>}
    <ul className="cms-blog-posts">
      {visible.slice(0, shown).map((post) => {
        const status = statusOf(post, liveByPath.get(post.path));
        const live = liveByPath.has(post.path);
        return <li key={post.path} className="cms-blog-row" data-testid="blog-row" data-status={status}>
          <div className="cms-blog-row-main">
            <button type="button" className="cms-blog-row-title" onClick={() => openPost(post.path)} data-testid="blog-row-title">{fixText(post.title) || "Untitled post"}</button>
            <span className="cms-blog-row-meta"><span className={`cms-pill cms-status-${status}`}>{post.archived ? "Archived" : STATUS_LABEL[status]}</span> {formatDate(post.date)}{post.author ? ` · ${post.author}` : ""}</span>
          </div>
          <div className="cms-blog-row-actions">
            <button type="button" className="cms-btn" onClick={() => openPost(post.path)} data-testid="blog-row-edit">Edit</button>
            {live && !post.draft && <button type="button" className="cms-btn" onClick={() => setConfirm({ kind: "unpublish", path: post.path })} data-testid="blog-row-unpublish">Unpublish</button>}
            <button type="button" className="cms-btn cms-btn-ghost cms-danger" onClick={() => setConfirm({ kind: "delete", path: post.path })} aria-label={`Delete ${post.title || "untitled post"}`} data-testid="blog-row-delete"><Trash2 size={14} /> Delete</button>
          </div>
        </li>;
      })}
    </ul>
    {visible.length > shown && <p className="cms-blog-more"><button type="button" className="cms-btn" onClick={() => setShown((count) => count + 20)} data-testid="blog-show-more"><Plus size={14} /> Show more posts</button></p>}
    {dialog}
  </div>;
}

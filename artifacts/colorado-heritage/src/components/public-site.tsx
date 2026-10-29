import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ArrowDown, ArrowRight, ArrowUpRight, Download, Menu, RotateCw, X } from "lucide-react";
import { useGetSiteContent, type CmsArticle, type CmsDocument, type CmsPage, type CmsStaff, type SiteContentState } from "@workspace/api-client-react";
import { footerGroups } from "../data/siteSitemap";
import {
  PRAXI_PARENT_PORTAL, articleHref, canonicalInternalPath, excerpt, fixText, formatDate, labelForPath,
  mediaUrl, pageMap, publicAsset, publicPath, sortArticles, stripSourceTitle, usePageMeta,
} from "../lib/cms";
import "./public-site.css";
import "./cms.css";

/** Documents keyed by their original (immutable) link; url holds the current editable destination. */
export const DocumentsContext = createContext<CmsDocument[]>([]);
export function resolveDocument(href: string, docs: CmsDocument[]): string {
  if (!href) return href;
  const clean = href.trim();
  const hit = docs.find((doc) => doc.id === clean)
    ?? docs.find((doc) => doc.id === clean.replace(/^https?:\/\/(?:www\.)?coloradoheritage\.org/i, ""));
  return hit?.url || href;
}
const useDocUrl = () => { const docs = useContext(DocumentsContext); return (href?: string) => (href ? mediaUrl(resolveDocument(href, docs)) : undefined); };

const testId = (path: string) => path.replaceAll("/", "-").replace(/^-/, "");

function resolveHref(href: string): string {
  if (!href || href.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(href)) return href;
  try {
    const parsed = new URL(href, "https://www.coloradoheritage.org");
    const isOfficial = parsed.hostname === "coloradoheritage.org" || parsed.hostname.endsWith(".coloradoheritage.org");
    if (!isOfficial) return href;
    return `${canonicalInternalPath(parsed.pathname)}${parsed.search}${parsed.hash}`;
  } catch {
    return href;
  }
}

function LinkText({ href, children, testId: id }: { href: string; children: ReactNode; testId: string }) {
  const docs = useContext(DocumentsContext);
  const docHref = resolveDocument(href, docs);
  const resolved = docHref !== href ? mediaUrl(docHref) : resolveHref(href);
  if (/^https?:\/\//i.test(resolved)) return <a href={resolved} target="_blank" rel="noreferrer" data-testid={id}>{children}<ArrowUpRight aria-hidden="true" size={13} /></a>;
  if (/^(mailto:|tel:|#)/i.test(resolved)) return <a href={resolved} data-testid={id}>{children}</a>;
  return <Link href={resolved} data-testid={id}>{children}</Link>;
}

function inlineMarkdown(value: string, keyPrefix: string): ReactNode[] {
  const tokens: ReactNode[] = [];
  const pattern = /(!?)\[([^\]]*)\]\(([^)]+)\)|(\*\*|__)(.+?)\4|(\*|_)(.+?)\6|`([^`]+)`/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(value))) {
    if (match.index > cursor) tokens.push(value.slice(cursor, match.index));
    const key = `${keyPrefix}-${index++}`;
    if (match[2] !== undefined) {
      if (match[1]) tokens.push(<img key={key} src={mediaUrl(resolveHref(match[3]))} alt={match[2] || "Colorado Heritage"} loading="lazy" />);
      else tokens.push(<LinkText key={key} href={match[3]} testId={`link-content-${index}`}>{match[2]}</LinkText>);
    } else if (match[4]) tokens.push(<strong key={key}>{match[5]}</strong>);
    else if (match[6]) tokens.push(<em key={key}>{match[7]}</em>);
    else if (match[8]) tokens.push(<code key={key}>{match[8]}</code>);
    cursor = pattern.lastIndex;
  }
  if (cursor < value.length) tokens.push(value.slice(cursor));
  return tokens;
}

export function MarkdownContent({ markdown }: { markdown: string }) {
  const cleaned = fixText(markdown)
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => !/^(School year office hours begin|o Independent School|o See our latest Blog|0items|\$0|Click below to view the Colorado Heritage You Tube Channel|0 Likes|Share)/.test(line.trim()))
    .join("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let key = 0;
  const flushParagraph = () => {
    const text = paragraph.join(" ").trim();
    if (text) blocks.push(<p key={`p-${key++}`}>{inlineMarkdown(text, `inline-${key}`)}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push(<ul key={`ul-${key++}`}>{list.map((item, i) => <li key={i}>{inlineMarkdown(item, `li-${key}-${i}`)}</li>)}</ul>);
    list = [];
  };
  cleaned.split("\n").forEach((raw) => {
    const line = raw.trim();
    if (!line) { flushParagraph(); flushList(); return; }
    if (/^#{1,6}\s/.test(line)) {
      flushParagraph(); flushList();
      const level = line.match(/^#+/)?.[0].length || 2;
      const children = inlineMarkdown(line.replace(/^#{1,6}\s*/, ""), `heading-${key}`);
      blocks.push(level <= 2 ? <h2 key={`h-${key++}`}>{children}</h2> : <h3 key={`h-${key++}`}>{children}</h3>);
      return;
    }
    if (/^[-*]\s/.test(line)) { flushParagraph(); list.push(line.replace(/^[-*]\s+/, "")); return; }
    if (/^!\[/.test(line) || /^\[!\[/.test(line)) {
      flushParagraph(); flushList();
      blocks.push(<p className="chess-inline-image" key={`img-${key++}`}>{inlineMarkdown(line, `image-${key}`)}</p>);
      return;
    }
    if (/^_{1,2}.+_{1,2}$/.test(line)) {
      flushParagraph(); flushList();
      blocks.push(<blockquote key={`quote-${key++}`}>{inlineMarkdown(line.replace(/^_+|_+$/g, ""), `quote-${key}`)}</blockquote>);
      return;
    }
    paragraph.push(line);
  });
  flushParagraph();
  flushList();
  return <div className="chess-prose">{blocks}</div>;
}

/* ---------- Loading / error ---------- */

function PageSkeleton() {
  return <div className="cms-skeleton" aria-busy="true" aria-label="Loading page">
    <span className="cms-skel cms-skel-eyebrow" /><span className="cms-skel cms-skel-title" />
    <span className="cms-skel cms-skel-line" /><span className="cms-skel cms-skel-line" /><span className="cms-skel cms-skel-line short" />
  </div>;
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return <section className="chess-not-found cms-load-error" role="alert">
    <span className="chess-eyebrow">Connection problem</span>
    <h1>This page could not be loaded.</h1>
    <p>We could not reach the Colorado Heritage website content right now. Please check your connection and try again, or call the school office.</p>
    <button type="button" className="chess-button" onClick={onRetry} data-testid="button-retry-content"><RotateCw size={15} aria-hidden="true" /> Try again</button>
  </section>;
}

/* ---------- Page types ---------- */

function ArchiveIndex({ type, articles }: { type: "news" | "events"; articles: CmsArticle[] }) {
  const [visibleCount, setVisibleCount] = useState(12);
  const visible = sortArticles(articles.filter((a) => !a.archived));
  const heading = type === "news" ? "News & Blog" : "Calendar & Events";
  return <div className="chess-archive-layout">
    <header className="chess-page-intro">
      <span className="chess-eyebrow">From the CHESS community</span>
      <h1>{heading}</h1>
      <p>{type === "news" ? "Notes, articles, and encouragement from the Colorado Heritage community." : "Upcoming gatherings and important dates for Colorado Heritage families."}</p>
      {type === "events" && <Link href="/families/school-calendar" className="chess-button cms-calendar-cta" data-testid="link-events-calendar">View the school calendar <ArrowRight size={15} aria-hidden="true" /></Link>}
    </header>
    {visible.length === 0
      ? <div className="cms-empty"><strong>Nothing posted yet.</strong><p>{type === "news" ? "New stories will appear here." : "New events will appear here. In the meantime, see the school calendar."}</p></div>
      : <div className="chess-archive-grid">
        {visible.slice(0, visibleCount).map((entry, index) => {
          const href = articleHref(entry, type);
          return <article className="chess-archive-card" key={`${entry.path}-${index}`} data-testid={`archive-entry-${type}-${index}`}>
            <div className="chess-card-meta">{type === "news" ? "Journal" : "Event"}{entry.date && <><span aria-hidden="true">/</span>{formatDate(entry.date)}</>}</div>
            <h2><Link href={href} data-testid={`link-${type}-entry-${index}`}>{fixText(entry.title)}</Link></h2>
            <p>{excerpt(entry.markdown) || "Read the full update from Colorado Heritage."}</p>
            <Link className="chess-read-link" href={href} aria-label={`Open ${fixText(entry.title)}`} data-testid={`read-${type}-entry-${index}`}>{type === "news" ? "Read story" : "View event"} <ArrowRight size={15} aria-hidden="true" /></Link>
          </article>;
        })}
      </div>}
    {visibleCount < visible.length && <button className="chess-load-more" type="button" onClick={() => setVisibleCount((c) => c + 12)} data-testid={`button-load-more-${type}`}>Show more <ArrowDown size={15} aria-hidden="true" /></button>}
  </div>;
}

function SitemapPage({ content }: { content: SiteContentState }) {
  const groups = useMemo(() => {
    const bucket = new Map<string, CmsPage[]>();
    content.pages.forEach((page) => {
      const top = page.path.split("/").filter(Boolean)[0] || "home";
      bucket.set(top, [...(bucket.get(top) ?? []), page]);
    });
    const names: Record<string, string> = { programs: "Programs", families: "Parents & families", about: "About CHESS" };
    return [...bucket.entries()].map(([key, pages]) => ({ label: names[key] ?? "Community", key, pages })).reduce<{ label: string; pages: CmsPage[] }[]>((acc, g) => {
      const existing = acc.find((a) => a.label === g.label);
      if (existing) existing.pages.push(...g.pages); else acc.push({ label: g.label, pages: [...g.pages] });
      return acc;
    }, []);
  }, [content.pages]);
  return <section className="chess-sitemap-page">
    <header className="chess-page-intro"><span className="chess-eyebrow">Find your way</span><h1>Website sitemap</h1><p>Every Colorado Heritage page, by topic.</p></header>
    <div className="chess-sitemap-grid">{groups.map((group) => <section key={group.label} className="chess-sitemap-group">
      <h2>{group.label}</h2><ul>{group.pages.map((page) => <li key={page.path}>{page.externalUrl
        ? <a href={page.externalUrl} target="_blank" rel="noopener noreferrer" data-testid={`sitemap-link-${testId(page.path)}`}>{fixText(page.label)} <ArrowUpRight size={12} aria-hidden="true" /></a>
        : <Link href={page.path} data-testid={`sitemap-link-${testId(page.path)}`}>{fixText(page.label)}</Link>}</li>)}</ul>
    </section>)}
      {content.staff.length > 0 && <section className="chess-sitemap-group"><h2>Faculty &amp; staff</h2><ul>{content.staff.map((s) => <li key={s.slug}><Link href={`/about/faculty/${s.slug}`}>{s.name}</Link></li>)}</ul></section>}
    </div>
    <div className="chess-sitemap-archives">
      {[{ label: "News & blog", type: "news" as const, entries: content.news }, { label: "Events", type: "events" as const, entries: content.events }].map((group) => {
        const list = sortArticles(group.entries.filter((e) => !e.archived));
        return <details key={group.type} className="chess-sitemap-archive">
          <summary>{group.label}<span>{list.length} pages</span></summary>
          <ul>{list.map((entry) => <li key={entry.path}><Link href={articleHref(entry, group.type)}>{fixText(entry.title)}</Link></li>)}</ul>
        </details>;
      })}
    </div>
  </section>;
}

function OverviewPage({ page, content }: { page: CmsPage; content: SiteContentState }) {
  const pages = pageMap(content);
  const navChildren = content.navigation.find((n) => n.path === page.path)?.children ?? [];
  const directChildren = content.pages.filter((c) => c.path.startsWith(`${page.path}/`) && !c.path.slice(page.path.length + 1).includes("/")).map((c) => c.path);
  const childPaths = [...new Set([...navChildren, ...directChildren])].filter((p) => pages.has(p));
  const body = stripSourceTitle(page.markdown);
  return <div className="chess-overview">
    <header className="chess-page-intro">
      <span className="chess-eyebrow">Colorado Heritage Education School System</span>
      <h1>{fixText(page.label)}</h1>
      <p>{fixText(page.description)}</p>
    </header>
    <div className="chess-overview-content">
      <div className="chess-overview-note">
        <span className="chess-rule-mark" aria-hidden="true">CHESS</span>
        {body ? <MarkdownContent markdown={body} /> : <p>Since 1991, Colorado Heritage has come alongside homeschooling families with encouragement and support rooted in Christian education.</p>}
      </div>
      <div className="chess-overview-links">
        {childPaths.map((path, index) => {
          const child = pages.get(path)!;
          return <Link href={child.path} className="chess-overview-link" key={child.path} data-testid={`overview-link-${testId(child.path)}`}>
            <span className="chess-link-number">{String(index + 1).padStart(2, "0")}</span>
            <span><strong>{fixText(child.label)}</strong><small>{fixText(child.description)}</small></span>
            <ArrowRight aria-hidden="true" size={18} />
          </Link>;
        })}
      </div>
    </div>
  </div>;
}

function Initials({ name }: { name: string }) {
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return <span className="cms-initials" aria-hidden="true">{letters || "CH"}</span>;
}

export function FacultyGrid({ staff }: { staff: CmsStaff[] }) {
  if (!staff.length) return <div className="cms-empty"><strong>Faculty profiles are coming soon.</strong><p>Contact the office to learn about our teachers.</p></div>;
  return <ul className="cms-faculty-grid" data-testid="faculty-grid">
    {staff.map((person) => <li key={person.slug}>
      <Link href={`/about/faculty/${person.slug}`} className="cms-faculty-card" data-testid={`faculty-card-${person.slug}`}>
        <span className="cms-faculty-photo">{person.photo ? <img src={mediaUrl(person.photo)} alt={person.alt || person.name} loading="lazy" /> : <Initials name={person.name} />}</span>
        <strong>{person.name}</strong>
        <small>{fixText(person.role)}</small>
      </Link>
    </li>)}
  </ul>;
}

function StaffBio({ person }: { person: CmsStaff }) {
  return <article className="chess-content-page cms-bio">
    <nav className="cms-crumbs" aria-label="Breadcrumb"><Link href="/about">About</Link><span>/</span><Link href="/about/faculty">Our Faculty</Link></nav>
    <div className="cms-bio-layout">
      <div className="cms-faculty-photo cms-bio-photo">{person.photo ? <img src={mediaUrl(person.photo)} alt={person.alt || person.name} /> : <Initials name={person.name} />}</div>
      <div>
        <span className="chess-eyebrow">{fixText(person.role)}</span>
        <h1 className="cms-bio-name">{person.name}</h1>
        {person.bio ? <MarkdownContent markdown={person.bio} /> : <p className="cms-muted">A full biography is coming soon.</p>}
      </div>
    </div>
    <div className="chess-bottom-nav"><Link href="/about/faculty" data-testid="link-back-faculty">All faculty <ArrowRight size={15} aria-hidden="true" /></Link></div>
  </article>;
}

function CalendarPage({ page }: { page: CmsPage }) {
  const docUrl = useDocUrl();
  const pdf = docUrl(page.documentPath) || page.externalUrl;
  return <article className="chess-content-page cms-calendar">
    <header className="chess-page-intro chess-content-heading">
      <span className="chess-eyebrow">Parents / Calendar &amp; Events</span>
      <h1>{fixText(page.label)}</h1>
      <p>{fixText(page.description)}</p>
    </header>
    {page.markdown && <MarkdownContent markdown={stripSourceTitle(page.markdown)} />}
    {pdf
      ? <>
        <div className="cms-pdf-actions">
          <a className="chess-button" href={pdf} target="_blank" rel="noopener noreferrer" data-testid="link-calendar-pdf"><Download size={15} aria-hidden="true" /> Open or download PDF</a>
          <Link href="/events" className="chess-read-link">Upcoming events <ArrowRight size={15} aria-hidden="true" /></Link>
        </div>
        <object className="cms-pdf-frame" data={`${pdf}#view=FitH`} type="application/pdf" aria-label={`${page.label} PDF`}>
          <p>Your browser cannot show the calendar inline. <a href={pdf}>Open the calendar PDF</a>.</p>
        </object>
      </>
      : <div className="cms-empty"><strong>The calendar has not been uploaded yet.</strong><p>Please contact the school office for current dates.</p></div>}
  </article>;
}

function ContentPage({ page, content }: { page: CmsPage; content: SiteContentState }) {
  const isFaculty = page.path === "/about/faculty";
  let markdown = stripSourceTitle(page.markdown);
  if (markdown.trim() === "Colorado Heritage — Secure") markdown = "";
  const heroImage = isFaculty ? null : markdown.match(/!\[([^\]]*)\]\(([^)]+)\)/);
  if (heroImage) markdown = markdown.replace(heroImage[0], "");
  if (isFaculty) {
    // Imported biographies now live on the individual profile pages, not twice on the directory.
    markdown = /^###\s+\**(?:Miss|Mrs?\.|Pastor)/im.test(markdown) ? "" : markdown.replace(/!\[[^\]]*\]\([^)]+\)/g, "");
  }
  const docUrl = useDocUrl();
  const resourceUrl = page.externalUrl || docUrl(page.documentPath);
  return <article className={`chess-content-page${isFaculty ? " cms-faculty-page" : ""}`}>
    <header className="chess-page-intro chess-content-heading">
      <span className="chess-eyebrow">{page.path.split("/").filter(Boolean).slice(0, -1).join(" / ") || "Colorado Heritage"}</span>
      <h1>{fixText(page.label)}</h1>
      {heroImage && <figure className="chess-page-image"><img src={mediaUrl(heroImage[2])} alt={heroImage[1] || `${page.label} at Colorado Heritage`} /><figcaption>{fixText(heroImage[1] || page.label)}</figcaption></figure>}
      {(!markdown || isFaculty) && <p>{fixText(page.description)}</p>}
    </header>
    {isFaculty && <FacultyGrid staff={content.staff} />}
    {page.kind === "protected" && !markdown.trim()
      ? <section className="chess-content-placeholder"><p>This resource is intended for current CHESS families. Contact the CHESS office for help accessing the current resource.</p><Link className="chess-read-link" href="/contact" data-testid="link-protected-resource-contact">Contact the CHESS office <ArrowRight size={15} aria-hidden="true" /></Link></section>
      : markdown.trim()
        ? <MarkdownContent markdown={markdown} />
        : !isFaculty && <section className="chess-content-placeholder"><p>{fixText(page.description)}</p></section>}
    {resourceUrl && <div className="chess-page-cta"><a className="chess-button" href={resourceUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-open-resource-${testId(page.path)}`}>{page.externalUrl ? "Open" : "View"} {fixText(page.label)} <ArrowUpRight size={15} aria-hidden="true" /></a></div>}
    <div className="chess-bottom-nav"><Link href="/" data-testid="link-back-home">Colorado Heritage home <ArrowRight size={15} aria-hidden="true" /></Link></div>
  </article>;
}

function ArchiveDetail({ entry, kind }: { entry: CmsArticle; kind: "news" | "events" }) {
  return <article className="chess-content-page chess-archive-detail">
    <header className="chess-page-intro chess-content-heading">
      <span className="chess-eyebrow">{kind === "news" ? "News & Blog" : "Calendar & Events"}{entry.date && ` / ${formatDate(entry.date)}`}</span>
      <h1>{fixText(entry.title)}</h1>
    </header>
    <MarkdownContent markdown={stripSourceTitle(entry.markdown).replace(new RegExp(`^#\\s+${entry.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m"), "")} />
    <div className="chess-bottom-nav"><Link href={`/${kind}`} data-testid={`link-back-${kind}`}>Back to {kind === "news" ? "News & Blog" : "Calendar & Events"} <ArrowRight size={15} aria-hidden="true" /></Link></div>
  </article>;
}

type Resolved =
  | { type: "sitemap" } | { type: "index"; kind: "news" | "events" }
  | { type: "article"; entry: CmsArticle; kind: "news" | "events" }
  | { type: "staff"; person: CmsStaff } | { type: "page"; page: CmsPage } | { type: "missing" };

function resolve(path: string, content: SiteContentState): Resolved {
  if (path === "/sitemap") return { type: "sitemap" };
  if (path === "/news" || path === "/events") return { type: "index", kind: path.slice(1) as "news" | "events" };
  const staffMatch = path.match(/^\/about\/(?:faculty|staff)\/([^/]+)$/);
  if (staffMatch) {
    const person = content.staff.find((s) => s.slug === staffMatch[1]);
    return person ? { type: "staff", person } : { type: "missing" };
  }
  const page = content.pages.find((p) => p.path === path);
  if (page) return { type: "page", page };
  for (const kind of ["news", "events"] as const) {
    const entry = content[kind].find((a) => articleHref(a, kind) === path || canonicalInternalPath(a.path) === path);
    if (entry) return { type: "article", entry, kind };
  }
  return { type: "missing" };
}

export function PublicSitePages() {
  const [location] = useLocation();
  const path = decodeURI(location.split("?")[0].replace(/\/+$/, "") || "/");
  const query = useGetSiteContent();
  const resolved = query.data ? resolve(path, query.data) : null;

  let title = "Colorado Heritage";
  let description = "Colorado Heritage Education School System, a private Christian school serving homeschooling families in Greeley, CO since 1991.";
  if (resolved?.type === "page") { title = resolved.page.title || `${resolved.page.label} | Colorado Heritage`; description = resolved.page.description || description; }
  else if (resolved?.type === "article") { title = `${resolved.entry.title} | Colorado Heritage`; description = excerpt(resolved.entry.markdown) || description; }
  else if (resolved?.type === "staff") { title = `${resolved.person.name}, ${resolved.person.role} | Colorado Heritage`; description = excerpt(resolved.person.bio) || `${resolved.person.name} serves Colorado Heritage as ${resolved.person.role}.`; }
  else if (resolved?.type === "index") { title = resolved.kind === "news" ? "News & Blog | Colorado Heritage" : "Calendar & Events | Colorado Heritage"; }
  else if (resolved?.type === "sitemap") { title = "Website Sitemap | Colorado Heritage"; }
  else if (resolved?.type === "missing") { title = "Page not found | Colorado Heritage"; }
  usePageMeta(title, description, path);

  if (query.isPending) return <main className="chess-public chess-main"><PageSkeleton /></main>;
  if (query.isError || !query.data || !resolved) return <main className="chess-public chess-main"><LoadError onRetry={() => query.refetch()} /></main>;
  const content = query.data;

  let body: ReactNode;
  let extraClass = "";
  switch (resolved.type) {
    case "sitemap": body = <SitemapPage content={content} />; break;
    case "index": body = <ArchiveIndex type={resolved.kind} articles={content[resolved.kind]} />; break;
    case "article": body = <ArchiveDetail entry={resolved.entry} kind={resolved.kind} />; break;
    case "staff": body = <StaffBio person={resolved.person} />; break;
    case "page":
      if (resolved.page.kind === "overview") { body = <OverviewPage page={resolved.page} content={content} />; extraClass = "chess-overview-main"; }
      else if (resolved.page.path === "/families/school-calendar") body = <CalendarPage page={resolved.page} />;
      else body = <ContentPage page={resolved.page} content={content} />;
      break;
    default:
      body = <section className="chess-not-found"><span className="chess-eyebrow">A wrong turn?</span><h1>We couldn’t find that page.</h1><p>The page may have moved. Use the sitemap to find your way around Colorado Heritage.</p><Link href="/sitemap" className="chess-button" data-testid="link-not-found-sitemap">Browse the sitemap <ArrowRight size={16} aria-hidden="true" /></Link></section>;
  }
  return <DocumentsContext.Provider value={content.documents}><main className={`chess-public chess-main ${extraClass}`}>{body}</main></DocumentsContext.Provider>;
}

/* ---------- Header / footer ---------- */

const NAV_ORDER = ["About", "Programs", "Admissions", "Parents", "News", "Contact"];

export function PublicSiteHeader({ editing = false }: { editing?: boolean }) {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const query = useGetSiteContent();
  useEffect(() => setOpen(false), [location]);
  const pages = pageMap(query.data);
  const docs = query.data?.documents ?? [];
  const nav = (query.data?.navigation ?? []).slice(0, 6);
  const guard = (event: React.MouseEvent) => { if (editing) event.preventDefault(); };
  const childLink = (path: string) => {
    const page = pages.get(path);
    const label = labelForPath(path, pages);
    if (page?.documentPath && page.kind !== "overview" && path !== "/families/school-calendar" && !page.markdown.trim()) return <a href={mediaUrl(resolveDocument(page.documentPath, docs))} key={path} target="_blank" rel="noopener noreferrer" data-testid={`nav-link-${testId(path)}`} onClick={guard}>{label}</a>;
    if (page?.externalUrl) return <a href={page.externalUrl} key={path} target="_blank" rel="noopener noreferrer" data-testid={`nav-link-${testId(path)}`} onClick={guard}>{label}<ArrowUpRight size={12} aria-hidden="true" /></a>;
    return <a href={publicPath(path)} key={path} data-testid={`nav-link-${testId(path)}`} onClick={guard}>{label}</a>;
  };
  return <header className="chess-site-header">
    <div className="chess-header-inner">
      <a href={publicPath("/")} className="chess-brand" aria-label="Colorado Heritage home" data-testid="link-site-brand" onClick={guard}>
        <img src={publicAsset("/images/chess-seal.png")} alt="Colorado Heritage Education School System seal" />
        <span className="chess-brand-copy"><strong>Colorado Heritage</strong><small>Education School System</small></span>
      </a>
      <button className="chess-menu-toggle" type="button" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="chess-main-navigation" onClick={() => setOpen((s) => !s)} data-testid="button-mobile-navigation">
        {open ? <X size={22} /> : <Menu size={22} />}<span>{open ? "Close" : "Menu"}</span>
      </button>
      <nav id="chess-main-navigation" className={`chess-navigation ${open ? "is-open" : ""}`} aria-label="Main navigation">
        {query.isError && <span className="cms-nav-error" role="alert">Menu unavailable. <button type="button" onClick={() => query.refetch()}>Retry</button></span>}
        {query.isPending && NAV_ORDER.map((label) => <span key={label} className="cms-nav-skel" aria-hidden="true" />)}
        {nav.map((item) => item.children.length
          ? <details className="chess-nav-dropdown" key={`${item.label}-${item.path}`} data-testid={`nav-dropdown-${item.label.toLowerCase().replaceAll(" ", "-")}`}>
            <summary aria-label={`${item.label} pages`}>{fixText(item.label)}<ArrowDown size={12} aria-hidden="true" /></summary>
            <div className="chess-dropdown-panel">
              <a href={publicPath(item.path)} className="chess-dropdown-overview" data-testid={`nav-link-${item.label.toLowerCase()}-overview`} onClick={guard}>{labelForPath(item.path, pages)}<ArrowRight size={14} aria-hidden="true" /></a>
              {item.children.filter((p) => p !== item.path).map(childLink)}
            </div>
          </details>
          : <a href={publicPath(item.path)} key={`${item.label}-${item.path}`} data-testid={`nav-link-${item.label.toLowerCase().replaceAll(" ", "-")}`} onClick={guard}>{fixText(item.label)}</a>)}
        <span className="cms-corner-actions">
          <a href={PRAXI_PARENT_PORTAL} target="_blank" rel="noopener noreferrer" className="cms-corner-portal" data-testid="link-praxi-portal" onClick={guard}>Praxi Parent Portal<ArrowUpRight size={12} aria-hidden="true" /></a>
          <a href={publicPath("/donate")} className="cms-corner-donate" data-testid="link-donate" onClick={guard}>Donate</a>
        </span>
      </nav>
    </div>
  </header>;
}

export function PublicSiteFooter({ editing = false }: { editing?: boolean }) {
  const query = useGetSiteContent();
  const pages = pageMap(query.data);
  const groups = footerGroups.map((group) => ({ ...group, paths: group.paths.filter((p) => pages.has(p) || p === "/news" || p === "/events" || p === "/sitemap") }));
  const guard = (event: React.MouseEvent) => { if (editing) event.preventDefault(); };
  return <footer className="chess-site-footer">
    <div className="chess-footer-top">
      <section className="chess-footer-identity">
        <a href={publicPath("/")} className="chess-footer-brand" data-testid="footer-brand-link" onClick={guard}><img src={publicAsset("/images/chess-seal.png")} alt="Colorado Heritage seal" /><span><strong>Colorado Heritage</strong><small>Education School System</small></span></a>
        <p>A private Christian school serving K-12 homeschooling families in Greeley, CO since 1991.</p>
        <span className="chess-footer-motto">“Pursuing the Knowledge of God.”</span>
      </section>
      {groups.map((group) => <section className="chess-footer-group" key={group.label}>
        <h2>{group.label}</h2><ul>{group.paths.map((path) => {
          const page = pages.get(path);
          const label = path === "/sitemap" ? "Sitemap" : labelForPath(path, pages);
          return <li key={path}>{page?.externalUrl
            ? <a href={page.externalUrl} target="_blank" rel="noopener noreferrer" data-testid={`footer-link-${testId(path)}`} onClick={guard}>{label}<ArrowUpRight size={12} aria-hidden="true" /></a>
            : <a href={publicPath(path)} data-testid={`footer-link-${testId(path)}`} onClick={guard}>{label}</a>}</li>;
        })}</ul>
      </section>)}
    </div>
    <div className="chess-footer-bottom"><span>© {new Date().getFullYear()} Colorado Heritage Education School System</span><a href={publicPath("/sitemap")} data-testid="footer-sitemap-link" onClick={guard}>Website sitemap <ArrowRight size={14} aria-hidden="true" /></a></div>
  </footer>;
}

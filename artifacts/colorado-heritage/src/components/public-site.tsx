import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowDown, ArrowRight, ArrowUpRight, Menu, X } from "lucide-react";
import { sitePages, navigation, footerGroups, legacyRouteAliases, type SitePageDefinition } from "../data/siteSitemap";
import sourcePageData from "../data/sourcePages.json";
import newsArchiveData from "../data/newsArchive.json";
import eventArchiveData from "../data/eventArchive.json";
import "./public-site.css";

type MarkdownPage = { path: string; markdown: string; truncated?: boolean };
type ArchiveEntry = { path: string; markdown: string; truncated?: boolean };
type NavGroup = (typeof navigation)[number];

const sourcePages = (sourcePageData as { pages: Record<string, MarkdownPage> }).pages;
const newsEntries = newsArchiveData as ArchiveEntry[];
const eventEntries = eventArchiveData as ArchiveEntry[];
const allArchiveEntries = [...newsEntries, ...eventEntries];
const byCanonicalPath = new Map(sitePages.map((page) => [page.path, page]));
const publicAsset = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
const publicPath = (path: string) => `${import.meta.env.BASE_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}` || "/";

function canonicalInternalPath(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (legacyRouteAliases[normalized]) return legacyRouteAliases[normalized];
  const sourceMatch = sitePages.find((page) => page.sourcePath === normalized);
  if (sourceMatch) return sourceMatch.path;
  if (normalized === "/new-events") return "/events";
  if (normalized.startsWith("/new-events/")) return normalized.replace(/^\/new-events/, "/events");
  if (normalized.startsWith("/events/")) return normalized;
  if (normalized === "/news/category" || normalized === "/news/tag") return "/news";
  return normalized;
}

function resolveHref(href: string): string {
  if (!href || href.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(href)) return href;
  try {
    const parsed = new URL(href, "https://www.coloradoheritage.org");
    const isOfficial = parsed.hostname === "coloradoheritage.org" || parsed.hostname.endsWith(".coloradoheritage.org");
    if (!isOfficial) return href;
    const route = canonicalInternalPath(parsed.pathname);
    return `${route}${parsed.search}${parsed.hash}`;
  } catch {
    return href;
  }
}

function LinkText({ href, children, testId }: { href: string; children: React.ReactNode; testId: string }) {
  const resolved = resolveHref(href);
  const external = /^https?:\/\//i.test(resolved);
  const direct = /^(mailto:|tel:|#)/i.test(resolved);
  if (external) return <a href={resolved} target="_blank" rel="noreferrer" data-testid={testId}>{children}<ArrowUpRight aria-hidden="true" size={13} /></a>;
  if (direct) return <a href={resolved} data-testid={testId}>{children}</a>;
  return <Link href={resolved} data-testid={testId}>{children}</Link>;
}

function inlineMarkdown(value: string, keyPrefix: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  const pattern = /(!?)\[([^\]]*)\]\(([^)]+)\)|(\*\*|__)(.+?)\4|(\*|_)(.+?)\6|`([^`]+)`/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(value))) {
    if (match.index > cursor) tokens.push(value.slice(cursor, match.index));
    const key = `${keyPrefix}-${index++}`;
    if (match[2] !== undefined) {
      const href = resolveHref(match[3]);
      if (match[1]) tokens.push(<img key={key} src={href} alt={match[2] || "Colorado Heritage"} loading="lazy" />);
      else tokens.push(<LinkText key={key} href={match[3]} testId={`link-content-${index}`}>{match[2]}</LinkText>);
    } else if (match[4]) tokens.push(<strong key={key}>{match[5]}</strong>);
    else if (match[6]) tokens.push(<em key={key}>{match[7]}</em>);
    else if (match[8]) tokens.push(<code key={key}>{match[8]}</code>);
    cursor = pattern.lastIndex;
  }
  if (cursor < value.length) tokens.push(value.slice(cursor));
  return tokens;
}

function MarkdownContent({ markdown }: { markdown: string }) {
  const cleaned = markdown
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => !/^(School year office hours begin|o Independent School|o See our latest Blog|0items|\$0|Click below to view the Colorado Heritage You Tube Channel|0 Likes|Share)/.test(line.trim()))
    .join("\n");
  const lines = cleaned.split("\n");
  const blocks: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let key = 0;
  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(" ").trim();
    if (text) blocks.push(<p key={`p-${key++}`}>{inlineMarkdown(text, `inline-${key}`)}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push(<ul key={`ul-${key++}`}>{list.map((item, index) => <li key={index}>{inlineMarkdown(item, `li-${key}-${index}`)}</li>)}</ul>);
    list = [];
  };
  lines.forEach((raw) => {
    const line = raw.trim();
    if (!line) { flushParagraph(); flushList(); return; }
    if (/^#{1,6}\s/.test(line)) {
      flushParagraph(); flushList();
      const level = Math.min(line.match(/^#+/)?.[0].length || 2, 4);
      const text = line.replace(/^#{1,6}\s*/, "");
      const children = inlineMarkdown(text, `heading-${key}`);
      if (level === 1) blocks.push(<h2 key={`h-${key++}`}>{children}</h2>);
      else if (level === 2) blocks.push(<h2 key={`h-${key++}`}>{children}</h2>);
      else blocks.push(<h3 key={`h-${key++}`}>{children}</h3>);
      return;
    }
    if (/^[-*]\s/.test(line)) {
      flushParagraph(); list.push(line.replace(/^[-*]\s+/, "")); return;
    }
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

function usePageMeta(title: string, description: string) {
  useEffect(() => {
    document.title = title;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = description;
  }, [title, description]);
}

function findArchiveEntry(path: string): ArchiveEntry | undefined {
  return allArchiveEntries.find((entry) => canonicalInternalPath(entry.path) === path);
}

function archivePath(entry: ArchiveEntry, kind: "news" | "events") {
  const p = entry.path.replace(/^https?:\/\/(?:www\.)?coloradoheritage\.org/i, "");
  if (kind === "events") return canonicalInternalPath(p);
  return canonicalInternalPath(p);
}

function titleFromMarkdown(markdown: string) {
  const lines = markdown.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const explicit = lines.find((line) => /^#\s+/.test(line));
  if (explicit) return explicit.replace(/^#\s+/, "").replace(/\*\*/g, "");
  return (lines[0] || "Colorado Heritage").replace(/\s+—\s+Colorado Heritage$/, "");
}

function excerptFromMarkdown(markdown: string) {
  const text = markdown
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_`>-]/g, "")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .find((part) => part.length > 55 && !part.startsWith("School year office hours") && !part.startsWith("0items"));
  return text ? `${text.slice(0, 185)}${text.length > 185 ? "…" : ""}` : "";
}

function ArchiveIndex({ type }: { type: "news" | "events" }) {
  const entries = type === "news" ? newsEntries : eventEntries;
  const heading = type === "news" ? "News & Blog" : "Events";
  const intro = type === "news"
    ? "Notes, articles, and encouragement from the Colorado Heritage community."
    : "A record of gatherings and dates shared with Colorado Heritage families.";
  const [visibleCount, setVisibleCount] = useState(12);
  const sortedEntries = [...entries].sort((a, b) => {
    const getDate = (entry: ArchiveEntry) => {
      const match = entry.path.match(/\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//);
      return match ? Number(`${match[1]}${match[2].padStart(2, "0")}${match[3].padStart(2, "0")}`) : 0;
    };
    return getDate(b) - getDate(a);
  });
  return (
    <div className="chess-archive-layout">
      <header className="chess-page-intro">
        <span className="chess-eyebrow">From the CHESS community</span>
        <h1>{heading}</h1>
        <p>{intro}</p>
      </header>
      <div className="chess-archive-grid">
        {sortedEntries.slice(0, visibleCount).map((entry, index) => {
          const href = archivePath(entry, type);
          const title = titleFromMarkdown(entry.markdown);
          const dateMatch = entry.path.match(/\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//);
          const date = dateMatch ? `${dateMatch[2].padStart(2, "0")}.${dateMatch[3].padStart(2, "0")}.${dateMatch[1]}` : "";
          return (
            <article className="chess-archive-card" key={`${entry.path}-${index}`} data-testid={`archive-entry-${type}-${index}`}>
              <div className="chess-card-meta">{type === "news" ? "Journal" : "Calendar"}{date && <><span aria-hidden="true">/</span>{date}</>}</div>
              <h2><Link href={href} data-testid={`link-${type}-entry-${index}`}>{title}</Link></h2>
              <p>{excerptFromMarkdown(entry.markdown) || "Read the full update from Colorado Heritage."}</p>
              <Link className="chess-read-link" href={href} aria-label={`${type === "news" ? "Read" : "View"} ${title}`} data-testid={`read-${type}-entry-${index}`}>{type === "news" ? "Read story" : "View event"} <ArrowRight size={15} aria-hidden="true" /></Link>
            </article>
          );
        })}
      </div>
      {visibleCount < sortedEntries.length && <button className="chess-load-more" type="button" onClick={() => setVisibleCount((count) => Math.min(count + 12, sortedEntries.length))} data-testid={`button-load-more-${type}`}>Show more {type === "news" ? "stories" : "events"} <ArrowDown size={15} aria-hidden="true" /></button>}
    </div>
  );
}

function SitemapPage() {
  const groups = [
    { label: "Programs", paths: sitePages.filter((page) => page.path === "/programs" || page.path.startsWith("/programs/")) },
    { label: "Family resources", paths: sitePages.filter((page) => page.path === "/families" || page.path.startsWith("/families/")) },
    { label: "About CHESS", paths: sitePages.filter((page) => page.path === "/about" || page.path.startsWith("/about/")) },
    { label: "Community", paths: sitePages.filter((page) => ["/news", "/events", "/listen-learn", "/gallery", "/donate", "/contact"].includes(page.path)) },
  ];
  return <section className="chess-sitemap-page">
    <header className="chess-page-intro"><span className="chess-eyebrow">Find your way</span><h1>Website sitemap</h1><p>Browse Colorado Heritage pages by topic.</p></header>
    <div className="chess-sitemap-grid">{groups.map((group) => <section key={group.label} className="chess-sitemap-group">
      <h2>{group.label}</h2><ul>{group.paths.map((page) => <li key={page.path}>{page.externalUrl
        ? <a href={page.externalUrl} target="_blank" rel="noopener noreferrer" data-testid={`sitemap-link-${page.path.replaceAll("/", "-").replace(/^-/, "")}`}>{page.label} <ArrowUpRight size={12} aria-hidden="true" /></a>
        : <Link href={page.path} data-testid={`sitemap-link-${page.path.replaceAll("/", "-").replace(/^-/, "")}`}>{page.label}</Link>}</li>)}</ul>
    </section>)}</div>
    <div className="chess-sitemap-archives">
      {[{ label: "News & blog archive", type: "news" as const, entries: newsEntries }, { label: "Past events", type: "events" as const, entries: eventEntries }].map((group) =>
        <details key={group.type} className="chess-sitemap-archive">
          <summary>{group.label}<span>{group.entries.length} pages</span></summary>
          <ul>{group.entries.map((entry) => {
            const title = titleFromMarkdown(entry.markdown);
            return <li key={entry.path}><Link href={archivePath(entry, group.type)}>{title}</Link></li>;
          })}</ul>
        </details>)}
    </div>
  </section>;
}

function OverviewPage({ page }: { page: SitePageDefinition }) {
  const children = sitePages.filter((candidate) => {
    const parent = page.path === "/" ? "" : page.path;
    return candidate.path.startsWith(`${parent}/`) && !candidate.path.slice(parent.length + 1).includes("/");
  });
  return <div className="chess-overview">
    <header className="chess-page-intro">
      <span className="chess-eyebrow">Colorado Heritage Education School System</span>
      <h1>{page.label}</h1>
      <p>{page.description}</p>
    </header>
    <div className="chess-overview-content">
      <div className="chess-overview-note">
        <span className="chess-rule-mark" aria-hidden="true">CHESS</span>
        <p>Since 1991, Colorado Heritage has come alongside homeschooling families with encouragement and support rooted in Christian education.</p>
      </div>
      <div className="chess-overview-links">
        {children.map((child, index) => <Link href={child.path} className="chess-overview-link" key={child.path} data-testid={`overview-link-${child.path.replaceAll("/", "-").replace(/^-/, "")}`}>
          <span className="chess-link-number">{String(index + 1).padStart(2, "0")}</span>
          <span><strong>{child.label}</strong><small>{child.description}</small></span>
          <ArrowRight aria-hidden="true" size={18} />
        </Link>)}
      </div>
    </div>
  </div>;
}

function ContentPage({ page, source }: { page: SitePageDefinition; source?: MarkdownPage }) {
  const markdown = (source?.markdown || "").replace(/^[^\n]+ — Colorado Heritage\s*\n+/, "");
  const heroImage = markdown.match(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/);
  const mainContent = heroImage ? markdown.replace(heroImage[0], "") : markdown;
  const resourceUrl = page.externalUrl || (page.documentPath ? publicAsset(page.documentPath) : undefined);
  return <article className="chess-content-page">
    <header className="chess-page-intro chess-content-heading">
      <span className="chess-eyebrow">{page.path.split("/").filter(Boolean).slice(0, -1).join(" / ") || "Colorado Heritage"}</span>
      <h1>{page.label}</h1>
      {heroImage && <figure className="chess-page-image"><img src={heroImage[2]} alt={heroImage[1] || `${page.label} at Colorado Heritage`} /><figcaption>{heroImage[1] || page.label}</figcaption></figure>}
      {!markdown && <p>{page.description}</p>}
    </header>
      {page.kind === "protected"
        ? <section className="chess-content-placeholder"><p>This resource is intended for current CHESS families. Its source page was access-restricted during migration, so the original material could not be copied here. Contact the CHESS office for help accessing the current resource.</p><Link className="chess-read-link" href="/contact" data-testid="link-protected-resource-contact">Contact the CHESS office <ArrowRight size={15} aria-hidden="true" /></Link></section>
        : mainContent
          ? <MarkdownContent markdown={mainContent} />
          : <section className="chess-content-placeholder"><p>{page.description}</p></section>}
      {resourceUrl && <div className="chess-page-cta"><a className="chess-button" href={resourceUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-open-resource-${page.path.split("/").filter(Boolean).join("-")}`}>{page.externalUrl ? "Open" : "View"} {page.label} <ArrowUpRight size={15} aria-hidden="true" /></a></div>}
    {source?.truncated && <p className="chess-source-note">This page contains additional material that was not included in the available source text.</p>}
    <div className="chess-bottom-nav"><Link href="/" data-testid="link-back-home">Colorado Heritage home <ArrowRight size={15} aria-hidden="true" /></Link></div>
  </article>;
}

function ArchiveDetail({ entry, kind }: { entry: ArchiveEntry; kind: "news" | "events" }) {
  const title = titleFromMarkdown(entry.markdown);
  return <article className="chess-content-page chess-archive-detail">
    <header className="chess-page-intro chess-content-heading"><span className="chess-eyebrow">{kind === "news" ? "News & Blog" : "Events"} / Colorado Heritage</span><h1>{title}</h1></header>
    <MarkdownContent markdown={entry.markdown.replace(/^.*?Colorado Heritage\s*\n/, "")} />
    <div className="chess-bottom-nav"><Link href={`/${kind}`} data-testid={`link-back-${kind}`}>Back to {kind === "news" ? "News & Blog" : "Events"} <ArrowRight size={15} aria-hidden="true" /></Link></div>
  </article>;
}

export function PublicSitePages() {
  const [location] = useLocation();
  const path = decodeURI(location.split("?")[0].replace(/\/+$/, "") || "/");
  const page = byCanonicalPath.get(path);
  const archiveEntry = findArchiveEntry(path);
  const associatedSource = page?.sourcePath ? sourcePages[page.sourcePath] : undefined;
  const dynamicTitle = archiveEntry ? `${titleFromMarkdown(archiveEntry.markdown)} | Colorado Heritage` : page?.title || "Page not found | Colorado Heritage";
  const description = archiveEntry ? excerptFromMarkdown(archiveEntry.markdown) || "News and updates from Colorado Heritage." : page?.description || "The requested Colorado Heritage page could not be found.";
  usePageMeta(dynamicTitle, description);

  if (path === "/sitemap") return <main className="chess-public chess-main"><SitemapPage /></main>;
  if (path === "/news" || path === "/events") return <main className="chess-public chess-main"><ArchiveIndex type={path.slice(1) as "news" | "events"} /></main>;
  if (archiveEntry) return <main className="chess-public chess-main"><ArchiveDetail entry={archiveEntry} kind={path.startsWith("/events/") ? "events" : "news"} /></main>;
  if (page) {
    const overview = page.kind === "overview";
    return <main className={`chess-public chess-main ${overview ? "chess-overview-main" : ""}`}>
      {overview ? <OverviewPage page={page} /> : <ContentPage page={page} source={associatedSource} />}
    </main>;
  }
  return <main className="chess-public chess-main"><section className="chess-not-found"><span className="chess-eyebrow">A wrong turn?</span><h1>We couldn’t find that page.</h1><p>The page may have moved. Use the sitemap to find your way around Colorado Heritage.</p><Link href="/sitemap" className="chess-button" data-testid="link-not-found-sitemap">Browse the sitemap <ArrowRight size={16} aria-hidden="true" /></Link></section></main>;
}

export function PublicSiteHeader({ editing = false }: { editing?: boolean }) {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  useEffect(() => setOpen(false), [location]);
  const getPage = (path: string) => byCanonicalPath.get(path);
  return <header className="chess-site-header">
    <div className="chess-topline"><span>Christian education. Faithful partnership.</span><Link href="/contact" data-testid="header-contact-link">Contact the school <ArrowRight size={13} aria-hidden="true" /></Link></div>
    <div className="chess-header-inner">
      <a href={publicPath("/")} className="chess-brand" aria-label="Colorado Heritage home" data-testid="link-site-brand" onClick={(event) => editing && event.preventDefault()}>
        <img src={publicAsset("/images/chess-seal.png")} alt="Colorado Heritage Education School System seal" />
        <span className="chess-brand-copy"><strong>Colorado Heritage</strong><small>Education School System</small></span>
      </a>
      <button className="chess-menu-toggle" type="button" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="chess-main-navigation" onClick={() => setOpen((state) => !state)} data-testid="button-mobile-navigation">
        {open ? <X size={22} /> : <Menu size={22} />}<span>{open ? "Close" : "Menu"}</span>
      </button>
      <nav id="chess-main-navigation" className={`chess-navigation ${open ? "is-open" : ""}`} aria-label="Main navigation">
        {navigation.map((item: NavGroup) => {
          const parent = getPage(item.path);
          if (item.children?.length) {
            return <details className="chess-nav-dropdown" key={item.path} data-testid={`nav-dropdown-${item.label.toLowerCase().replaceAll(" ", "-")}`}>
              <summary aria-label={`${item.label} pages`}>{item.label}<ArrowDown size={12} aria-hidden="true" /></summary>
              <div className="chess-dropdown-panel">
                {parent && <a href={publicPath(item.path)} className="chess-dropdown-overview" data-testid={`nav-link-${item.label.toLowerCase()}-overview`} onClick={(event) => editing && event.preventDefault()}>Explore {item.label}<ArrowRight size={14} aria-hidden="true" /></a>}
                {item.children.map((childPath) => {
                  const child = getPage(childPath);
                  if (!child) return null;
                  return child.externalUrl
                    ? <a href={child.externalUrl} key={child.path} target="_blank" rel="noopener noreferrer" data-testid={`nav-link-${child.path.replaceAll("/", "-").replace(/^-/, "")}`} onClick={(event) => editing && event.preventDefault()}>{child.label}<ArrowUpRight size={12} aria-hidden="true" /></a>
                    : <a href={publicPath(child.path)} key={child.path} data-testid={`nav-link-${child.path.replaceAll("/", "-").replace(/^-/, "")}`} onClick={(event) => editing && event.preventDefault()}>{child.label}</a>;
                })}
              </div>
            </details>;
          }
          return <a href={publicPath(item.path)} className={item.emphasize ? "chess-nav-emphasis" : ""} key={item.path} data-testid={`nav-link-${item.label.toLowerCase().replaceAll(" ", "-")}`} onClick={(event) => editing && event.preventDefault()}>{item.label}</a>;
        })}
      </nav>
    </div>
  </header>;
}

export function PublicSiteFooter({ editing = false }: { editing?: boolean }) {
  const groupedPages = useMemo(() => footerGroups.map((group) => ({
    ...group,
    pages: group.paths.map((path) => byCanonicalPath.get(path)).filter((page): page is SitePageDefinition => Boolean(page)),
  })), []);
  return <footer className="chess-site-footer">
    <div className="chess-footer-top">
      <section className="chess-footer-identity">
        <a href={publicPath("/")} className="chess-footer-brand" data-testid="footer-brand-link" onClick={(event) => editing && event.preventDefault()}><img src={publicAsset("/images/chess-seal.png")} alt="Colorado Heritage seal" /><span><strong>Colorado Heritage</strong><small>Education School System</small></span></a>
        <p>A private Christian school system serving homeschooling families since 1991.</p>
        <span className="chess-footer-motto">“Pursuing the Knowledge of God.”</span>
      </section>
      {groupedPages.map((group) => <section className="chess-footer-group" key={group.label}>
        <h2>{group.label}</h2><ul>{group.pages.map((page) => <li key={page.path}>{page.externalUrl
          ? <a href={page.externalUrl} target="_blank" rel="noopener noreferrer" data-testid={`footer-link-${page.path.replaceAll("/", "-").replace(/^-/, "")}`} onClick={(event) => editing && event.preventDefault()}>{page.label}<ArrowUpRight size={12} aria-hidden="true" /></a>
          : <a href={publicPath(page.path)} data-testid={`footer-link-${page.path.replaceAll("/", "-").replace(/^-/, "")}`} onClick={(event) => editing && event.preventDefault()}>{page.label}</a>}</li>)}</ul>
      </section>)}
    </div>
    <div className="chess-footer-bottom"><span>© {new Date().getFullYear()} Colorado Heritage Education School System</span><a href={publicPath("/sitemap")} data-testid="footer-sitemap-link" onClick={(event) => editing && event.preventDefault()}>Website sitemap <ArrowRight size={14} aria-hidden="true" /></a></div>
  </footer>;
}

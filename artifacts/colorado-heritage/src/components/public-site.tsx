import { useMemo, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { useGetSiteContent, type CmsArticle, type CmsPage, type CmsStaff } from "@workspace/api-client-react";
import {
  articleHref, canonicalInternalPath, excerpt, faqJsonLd, fixText, formatDate, mediaUrl, pageMap, schoolJsonLd, sortArticles,
  setContentRedirects, splitSections, stripSourceTitle, useJsonLd, usePageMeta, useRobots, type SiteContentExt,
} from "../lib/cms";
import { cleanFilenameCaptions, isAdministrative, isFilenameCaption, portraitPosition, staffProfilePath } from "../../directory-helpers.mjs";
import "./public-site.css";
import "./cms.css";
import { Button, Eyebrow, MoreLink } from "./brand";
import { DocumentsContext, MarkdownContent, useDocUrl } from "./markdown";
import { FacultyGrid, Initials } from "./faculty-grid";
import { FaqAccordion, HomePage, SectionBody } from "./home-page";
import { CalendarPage, ContactPage, FaqPage, NewsIndex, PeoplePage, VisitPage } from "./special-pages";
import { SiteImage } from "./site-image";
import { MobileActionBar, PraxiBox, QuietVisit, VisitBand } from "./site-chrome";
import { PuckAdditionalRenderer, PuckBlockRenderer } from "./puck-render";

export { DocumentsContext, resolveDocument, MarkdownContent } from "./markdown";
export { FacultyGrid } from "./faculty-grid";
export { PublicSiteHeader, PublicSiteFooter, AnnouncementBar, MobileActionBar } from "./site-chrome";

const testId = (path: string) => path.replaceAll("/", "-").replace(/^-/, "");

/* ---------- Loading / error ---------- */

function PageSkeleton() {
  return <div className="cms-skeleton" aria-busy="true" aria-label="Loading page">
    <span className="cms-skel cms-skel-eyebrow" /><span className="cms-skel cms-skel-title" />
    <span className="cms-skel cms-skel-line" /><span className="cms-skel cms-skel-line" /><span className="cms-skel cms-skel-line short" />
  </div>;
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return <section className="cb-page cb-error" role="alert">
    <Eyebrow>Connection problem</Eyebrow>
    <h1>This page could not be loaded.</h1>
    <p>We could not reach the website content right now. Please check your connection and try again, or call the office at (970) 346-0099.</p>
    <button type="button" className="cb-btn cb-btn-primary" onClick={onRetry} data-testid="button-retry-content"><ArrowPathIcon className="cb-btn-icon" aria-hidden="true" /><span>Try again</span></button>
  </section>;
}

/* ---------- Generic pages ---------- */

function SitemapPage({ content }: { content: SiteContentExt }) {
  const groups = useMemo(() => {
    const names: Record<string, string> = { about: "About", programs: "Programs", admissions: "Admissions", parents: "Parents", news: "News", contact: "Contact" };
    const bucket = new Map<string, CmsPage[]>();
    content.pages.filter((p) => !p.archived).forEach((page) => {
      const top = page.path.split("/").filter(Boolean)[0] || "home";
      const label = names[top] ?? "More";
      bucket.set(label, [...(bucket.get(label) ?? []), page]);
    });
    return [...bucket.entries()];
  }, [content.pages]);
  return <article className="cb-page cb-page-wide">
    <header className="cb-page-head"><Eyebrow>Find your way</Eyebrow><h1>Website Sitemap</h1><p>Every CHESS page, by topic.</p></header>
    <div className="cb-sitemap">{groups.map(([label, pages]) => <section key={label}>
      <h2>{label}</h2><ul>{pages.map((page) => <li key={page.path}>{page.externalUrl
        ? <a href={page.externalUrl} target="_blank" rel="noopener noreferrer" data-testid={`sitemap-link-${testId(page.path)}`}>{fixText(page.label)}</a>
        : <Link href={page.path} data-testid={`sitemap-link-${testId(page.path)}`}>{fixText(page.label)}</Link>}</li>)}</ul>
    </section>)}
      <section><h2>Our People</h2><ul>{content.staff.map((s) => <li key={s.slug}><Link href={staffProfilePath(s)}>{s.name}</Link></li>)}</ul></section>
      <section><h2>Help</h2><ul><li><Link href="/faq">Frequently Asked Questions</Link></li><li><Link href="/news?archive=1">News &amp; Events Archive</Link></li></ul></section>
    </div>
  </article>;
}

function OverviewPage({ page, content }: { page: CmsPage; content: SiteContentExt }) {
  const pages = pageMap(content);
  const children = content.pages.filter((c) => c.path.startsWith(`${page.path}/`) && !c.path.slice(page.path.length + 1).includes("/") && !c.archived);
  const body = stripSourceTitle(page.markdown);
  const program = page.path === "/programs";
  return <article className="cb-page cb-page-wide">
    <header className="cb-page-head"><Eyebrow>{program ? "Programs" : "CHESS"}</Eyebrow><h1>{fixText(page.label)}</h1><p>{fixText(page.description)}</p></header>
    {page.blocks ? <PuckBlockRenderer blocks={page.blocks} legacyMarkdown={body} /> : body.trim() && <div className="cb-prose-wrap"><SectionBody body={body} /></div>}
    {children.length > 0 && <ul className="cb-overview-links">{children.map((child, i) => <li key={child.path}>
      <Link href={child.path} className="cb-overview-link" data-testid={`overview-link-${testId(child.path)}`}>
        <span className="cb-overview-num">{String(i + 1).padStart(2, "0")}</span>
        <span><strong>{fixText(pages.get(child.path)?.label ?? child.label)}</strong><small>{fixText(child.description)}</small></span>
        <span aria-hidden="true" className="cb-overview-arrow">→</span>
      </Link>
    </li>)}</ul>}
    {page.path.startsWith("/parents") ? <PraxiBox /> : <VisitBand title="Come see CHESS for yourself" text="Schedule a visit with our office to ask questions and see the school." />}
  </article>;
}

function ContentPage({ page, content }: { page: CmsPage; content: SiteContentExt }) {
  const path = page.path;
  let markdown = cleanFilenameCaptions(stripSourceTitle(page.markdown));
  // This internal staff question stays in the editor until the school confirms its answer.
  if (path === "/parents/praxi") {
    markdown = markdown.replace(/^\[CONFIRM: whether faculty should use this parent portal or a separate staff portal\. Contact the office for staff access\.\]\s*$/mi, "").trim();
  }
  if (markdown.trim() === "Colorado Heritage — Secure") markdown = "";
  const heroImage = path === "/gallery" ? null : markdown.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/m);
  if (heroImage) markdown = markdown.replace(heroImage[0], "");
  if (path === "/donate") return <DonationPage page={page} markdown={markdown} blocks={page.blocks} />;
  const docUrl = useDocUrl();
  const resourceUrl = page.externalUrl || docUrl(page.documentPath);
  const isProgram = path.startsWith("/programs/");
  const isParents = path.startsWith("/parents");
  const isTuition = path === "/admissions/tuition";
  const crumbs = path.split("/").filter(Boolean).slice(0, -1);
  const costFaqs = (content.faqs ?? []).filter((f) => /cost|tuition|pay|scholarship|fee|price|afford/i.test(f.question));
  const tuitionFaqs = isTuition ? (costFaqs.length ? costFaqs : content.faqs ?? []) : [];
  useJsonLd("faq", isTuition ? faqJsonLd(tuitionFaqs) : null);

  // Programs and tuition get a slim CTA after the first section.
  const sections = splitSections(markdown);
  const midCta = (isProgram || isTuition) && sections.length > 2;
  const firstChunk = midCta ? `${sections[0].title ? `## ${sections[0].title}\n` : ""}${sections[0].body}` : markdown;
  const rest = midCta ? sections.slice(1).map((s) => `${s.title ? `## ${s.title}\n` : ""}${s.body}`).join("\n") : "";

  return <article className={`cb-page ${path === "/gallery" || path === "/about/testimonials" ? "cb-page-wide" : ""} ${path === "/programs/diploma" ? "cb-page-diploma" : ""}`} data-path={path} data-testid={`page-${testId(path)}`}>
    {crumbs.length > 0 && <nav className="cb-crumbs" aria-label="Breadcrumb"><Link href="/">Home</Link>{crumbs.map((c, i) => { const p = `/${crumbs.slice(0, i + 1).join("/")}`; return <span key={p}><span aria-hidden="true">/</span><Link href={p}>{fixText(content.pages.find((x) => x.path === p)?.label ?? c)}</Link></span>; })}</nav>}
    <header className="cb-page-head">
      <h1>{fixText(page.label)}</h1>
      {page.description && <p>{fixText(page.description)}</p>}
    </header>
    {heroImage && <figure className="cb-page-image"><SiteImage src={heroImage[2]} alt={heroImage[1] && !isFilenameCaption(heroImage[1]) ? heroImage[1] : ""} loading="lazy" /></figure>}
    {page.kind === "protected" && !markdown.trim()
      ? <PraxiBox />
      : page.blocks
        ? <PuckBlockRenderer blocks={page.blocks} legacyMarkdown={markdown} />
        : markdown.trim()
        ? <div className="cb-prose-wrap">
          <SectionBody body={firstChunk} />
          {midCta && (isTuition
            ? <aside className="cb-quiet-cta"><p>Questions about cost? Call us. We are glad to walk through it with you.</p><a href="tel:+19703460099">(970) 346-0099</a></aside>
            : <QuietVisit text={`See if the ${fixText(page.label)} fits your family.`} />)}
          {rest && <SectionBody body={rest} />}
        </div>
        : <p className="cb-muted">{fixText(page.description)}</p>}
    {resourceUrl && <p className="cb-btn-row"><Button href={resourceUrl} variant="secondary" testId={`link-open-resource-${testId(path)}`}>{page.externalUrl ? "Open" : "Download"} {fixText(page.label)}</Button></p>}
    {isTuition && tuitionFaqs.length > 0 && <section className="cb-page-section"><h2>Questions about cost</h2><FaqAccordion faqs={tuitionFaqs} /></section>}
    {isParents ? <PraxiBox /> : isProgram || isTuition || path.startsWith("/admissions") || path.startsWith("/about")
      ? <VisitBand title={isProgram ? `See the ${fixText(page.label)} in person` : "Come see CHESS for yourself"} text="Schedule a visit with our office to ask questions and see the school." />
      : null}
  </article>;
}

function DonationPage({ page, markdown, blocks }: { page: CmsPage; markdown: string; blocks?: CmsPage["blocks"] }) {
  const normalized = markdown
    .replace(/^\s*(\d+)\.\s+(#{1,6})\s+/gm, "$2 $1. ")
    .replace(/^(#{1,6})\s+(\d+)\\?\.\s+/gm, "$1 $2. ")
    .replace(/^\s*\*\s+\*\s+\*\s*$/gm, "---");
  const sections = normalized.split(/^\s*---\s*$/m).map((part) => part.trim()).filter(Boolean);
  const intro = sections.shift() ?? "";
  const [scholarship = "", general = "", jogathon = "", cashCheck = ""] = sections;
  const headingLine = (section: string) => section.match(/^#{1,6}\s+.+$/m)?.[0] ?? "";
  const removeHeading = (section: string) => section.replace(/^#{1,6}\s+.+\n?/m, "");
  const cardDetails = (section: string) => removeHeading(section)
    .replace(/\*\*Please note:\*\*[\s\S]*?(?=\n\n|$)/g, "")
    .replace(/^\s*Donate to .+$/gim, "")
    .trim();
  const scholarshipItems = scholarship.split("\n").filter((line) => /^\s*-\s+/.test(line));
  const scholarshipRemainder = cardDetails(scholarship).split("\n").filter((line) => !/^\s*-\s+/.test(line)).join("\n").trim();
  const cardFeeNote = "Online card donations are subject to a card service fee. To ensure your full gift goes to CHESS, give by cash or check.";
  const cashContent = removeHeading(cashCheck)
    .replace("https://coloradoheritage.squarespace.com/contact-us", "/contact")
    .replace(/\n{3,}/g, "\n\n");
  return <article className="cb-page cb-page-wide cb-donate-page" data-testid="page-donate">
    <header className="cb-page-head">
      <h1>{fixText(page.label)}</h1>
      {page.description && <p>{fixText(page.description)}</p>}
    </header>
    <div className="cb-donate-intro">
      <Eyebrow>Give to CHESS</Eyebrow>
      <MarkdownContent markdown={intro} />
    </div>
    <section className="cb-donation-feature" aria-label="Scholarship fund">
      <div className="cb-donation-heading"><MarkdownContent markdown={headingLine(scholarship)} /></div>
      <p className="cb-donation-summary">Help cover class and student-support costs:</p>
      {scholarshipItems.length > 0 && <MarkdownContent className="chess-prose cb-donation-amounts" markdown={scholarshipItems.join("\n")} />}
      {scholarshipRemainder && <MarkdownContent className="chess-prose cb-donation-extra" markdown={scholarshipRemainder} />}
    </section>
    <div className="cb-donation-options">
      <section className="cb-donation-option">
        <MarkdownContent markdown={headingLine(general)} />
        <p>Support general school operating expenses.</p>
      </section>
      <section className="cb-donation-option">
        <MarkdownContent markdown={headingLine(jogathon)} />
        <MarkdownContent markdown={cardDetails(jogathon)} />
      </section>
    </div>
    <aside className="cb-donation-giving">
      <h2>Other ways to give</h2>
      <p>{cardFeeNote}</p>
      {cashContent && <MarkdownContent markdown={cashContent} />}
    </aside>
    <PuckAdditionalRenderer blocks={blocks} />
  </article>;
}

function StaffBio({ person }: { person: CmsStaff }) {
  const administrative = isAdministrative(person);
  return <article className="cb-page cms-bio">
    <nav className="cb-crumbs" aria-label="Breadcrumb"><Link href="/about">About</Link><span aria-hidden="true">/</span><Link href="/about/our-people">Our People</Link></nav>
    <div className="cms-bio-layout">
      <div className="cms-faculty-photo cms-bio-photo">{person.photo ? <img src={mediaUrl(person.photo)} alt={person.alt || `Portrait of ${person.name}`} style={{ objectPosition: portraitPosition(person) }} /> : <Initials name={person.name} />}</div>
      <div>
        <Eyebrow>{fixText(person.role)}</Eyebrow>
        <h1 className="cms-bio-name">{person.name}</h1>
        {person.blocks ? <PuckBlockRenderer blocks={person.blocks} legacyMarkdown={person.bio} /> : person.bio ? <MarkdownContent markdown={person.bio} /> : <p className="cb-muted">A full biography is coming soon.</p>}
        <p><MoreLink href={`/about/our-people#${administrative ? "administration" : "faculty"}`} testId="link-back-people">All of our people</MoreLink></p>
      </div>
    </div>
    <VisitBand title="Meet our teachers in person" text="Schedule a visit with our office to ask questions." />
  </article>;
}

function ArchiveDetail({ entry, kind }: { entry: CmsArticle; kind: "news" | "events" }) {
  useRobots(entry.archived);
  const body = stripSourceTitle(entry.markdown).replace(new RegExp(`^#\\s+${entry.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m"), "");
  return <article className="cb-page" data-testid="page-article">
    <nav className="cb-crumbs" aria-label="Breadcrumb"><Link href={kind === "news" ? "/news" : "/parents/calendar"}>{kind === "news" ? "News & Blog" : "Calendar & Events"}</Link></nav>
    <header className="cb-page-head">
      {entry.archived && <span className="cb-archived-tag">Archived — details may no longer apply</span>}
      <h1>{fixText(entry.title)}</h1>
      {entry.date && <p className="cb-muted">{formatDate(entry.date)}</p>}
    </header>
    {entry.blocks ? <PuckBlockRenderer blocks={entry.blocks} legacyMarkdown={body} /> : <MarkdownContent markdown={body} />}
    {kind === "news"
      ? <QuietVisit text="Curious about CHESS? Schedule a visit with our office." />
      : <p><MoreLink href="/parents/calendar">All upcoming events</MoreLink></p>}
  </article>;
}

/* ---------- Routing ---------- */

type Resolved =
  | { type: "home" } | { type: "sitemap" } | { type: "news" } | { type: "faq" }
  | { type: "article"; entry: CmsArticle; kind: "news" | "events" }
  | { type: "staff"; person: CmsStaff } | { type: "page"; page: CmsPage } | { type: "missing" };

function resolve(path: string, content: SiteContentExt): Resolved {
  if (path === "/") return { type: "home" };
  if (path === "/sitemap") return { type: "sitemap" };
  if (path === "/news") return { type: "news" };
  if (path === "/faq") return { type: "faq" };
  const staffMatch = path.match(/^\/about\/(?:our-people|faculty|staff)\/([^/]+)$/);
  if (staffMatch) {
    const person = content.staff.find((s) => s.slug === staffMatch[1]);
    return person ? { type: "staff", person } : { type: "missing" };
  }
  const page = content.pages.find((p) => p.path === path && !p.archived);
  if (page) return { type: "page", page };
  for (const kind of ["news", "events"] as const) {
    const entry = content[kind].find((a) => articleHref(a, kind) === path || canonicalInternalPath(a.path) === path);
    if (entry) return { type: "article", entry, kind };
  }
  return { type: "missing" };
}

const DEFAULT_DESC = "CHESS is a private Christian K–12 school in Greeley, Colorado that has partnered with homeschooling families since 1991.";

export function PublicSitePages({ contentOverride, previewPath }: { contentOverride?: SiteContentExt; previewPath?: string } = {}) {
  const [location] = useLocation();
  const path = decodeURI((previewPath ?? location).split("?")[0].replace(/\/+$/, "") || "/");
  const query = useGetSiteContent();
  const content = contentOverride ?? query.data as SiteContentExt | undefined;
  if (content) setContentRedirects(content.redirects);
  const resolved = content ? resolve(path, content) : null;

  let title = "Colorado Heritage Education School System | CHESS";
  let description = DEFAULT_DESC;
  if (resolved?.type === "home") { title = content?.home?.title || "Christian Homeschool Partnership in Greeley, CO | CHESS"; description = (content?.home as { metaDescription?: string } | undefined)?.metaDescription || content?.home?.description || description; }
  else if (resolved?.type === "page") { title = resolved.page.title || `${resolved.page.label} | CHESS`; description = (resolved.page as { metaDescription?: string }).metaDescription || resolved.page.description || description; }
  else if (resolved?.type === "article") { title = `${resolved.entry.title} | CHESS`; description = excerpt(resolved.entry.markdown) || description; }
  else if (resolved?.type === "staff") { title = `${resolved.person.name}, ${resolved.person.role} | CHESS`; description = excerpt(resolved.person.bio) || `${resolved.person.name} serves CHESS as ${resolved.person.role}.`; }
  else if (resolved?.type === "news") title = "News & Blog | CHESS";
  else if (resolved?.type === "faq") { title = "Frequently Asked Questions | CHESS"; description = "Answers about CHESS programs, tuition, the Diploma Program, and how to start."; }
  else if (resolved?.type === "sitemap") title = "Website Sitemap | CHESS";
  else if (resolved?.type === "missing") title = "Page not found | CHESS";
  usePageMeta(title, description, resolved?.type === "staff" ? staffProfilePath(resolved.person) : path);
  useJsonLd("school", schoolJsonLd);
  useJsonLd("faq-page", resolved && (resolved.type === "home" || resolved.type === "faq") && content
    ? faqJsonLd(resolved.type === "home" ? (content.faqs ?? []).filter((f) => f.showOnHome) : content.faqs ?? [])
    : null);
  const upcoming = resolved?.type === "page" && resolved.page.path === "/parents/calendar" && content
    ? sortArticles(content.events.filter((e) => !e.archived && e.date >= new Date().toISOString().slice(0, 10))).slice(0, 10)
    : [];
  useJsonLd("events", upcoming.length ? upcoming.map((e) => ({
    "@context": "https://schema.org", "@type": "Event", name: e.title, startDate: e.date, eventStatus: "https://schema.org/EventScheduled",
    location: { "@type": "Place", name: "Colorado Heritage Education School System", address: schoolJsonLd.address },
  })) : null);
  useRobots(resolved?.type === "missing");

  if (!contentOverride && query.isPending) return <main className="cb-main" id="main"><PageSkeleton /><MobileActionBar /></main>;
  if ((!contentOverride && query.isError) || !content || !resolved) return <main className="cb-main" id="main"><LoadError onRetry={() => query.refetch()} /></main>;

  let body: ReactNode;
  switch (resolved.type) {
    case "home": body = <HomePage content={content} />; break;
    case "sitemap": body = <SitemapPage content={content} />; break;
    case "news": body = <NewsIndex content={content} />; break;
    case "faq": body = <FaqPage content={content} />; break;
    case "article": body = <ArchiveDetail entry={resolved.entry} kind={resolved.kind} />; break;
    case "staff": body = <StaffBio person={resolved.person} />; break;
    case "page": {
      const p = resolved.page;
      if (p.path === "/contact") body = <ContactPage page={p} content={content} />;
      else if (p.path === "/admissions/visit") body = <VisitPage page={p} content={content} />;
      else if (p.path === "/about/our-people") body = <PeoplePage page={p} content={content} />;
      else if (p.path === "/parents/calendar" || p.path === "/families/school-calendar") body = <CalendarPage page={p} content={content} />;
      else if (p.kind === "overview") body = <OverviewPage page={p} content={content} />;
      else body = <ContentPage page={p} content={content} />;
      break;
    }
    default:
      body = <section className="cb-page cb-error"><Eyebrow>A wrong turn?</Eyebrow><h1>We couldn’t find that page.</h1><p>The page may have moved. Try the sitemap, or call the office and we will help.</p><p className="cb-btn-row"><Button href="/sitemap" arrow testId="link-not-found-sitemap">Browse the sitemap</Button><Button href="/" variant="secondary">CHESS home</Button></p></section>;
  }
  return <DocumentsContext.Provider value={content.documents}>
    <main className={`cb-main ${resolved.type === "home" ? "is-home" : ""}`} id="main">{body}</main>
    <MobileActionBar />
  </DocumentsContext.Provider>;
}

export { FacultyGrid as _FacultyGrid };

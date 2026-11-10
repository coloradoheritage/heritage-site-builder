import type { ComponentType, ReactNode, SVGProps } from "react";
import { Link } from "wouter";
import type { CmsArticle, CmsFaq, CmsStaff } from "@workspace/api-client-react";
import {
  AcademicCapIcon, BookOpenIcon, BuildingLibraryIcon, CalendarDaysIcon, CheckBadgeIcon, HeartIcon, HomeModernIcon,
  MapPinIcon, ShieldCheckIcon, UserGroupIcon, UsersIcon,
} from "@heroicons/react/24/outline";
import {
  OFFICE, VISIT_PATH, articleHref, excerpt, fixText, formatDate, isLivePost, mediaUrl, publicAsset, sortArticles, splitSections, type MdSection, type SiteContentExt,
} from "../lib/cms";
import { isAdministrative, portraitPosition, staffProfilePath } from "../../directory-helpers.mjs";
import { Button, MoreLink, Reveal } from "./brand";
import { MarkdownContent, inlineMarkdown, useResolvedHref } from "./markdown";
import { SiteImage } from "./site-image";
import { QuoteCards, splitTestimonials } from "./testimonials";
import { PuckAdditionalRenderer } from "./puck-render";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export function iconFor(text: string, index = 0): Icon {
  const t = text.toLowerCase();
  if (/independent school|enroll|records/.test(t)) return HomeModernIcon;
  if (/diploma|graduat|college|high school/.test(t)) return AcademicCapIcon;
  if (/academy|class|scripture|bible|subject/.test(t)) return BookOpenIcon;
  if (/fellowship|famil|community/.test(t)) return UserGroupIcon;
  if (/parent|lead/.test(t)) return HeartIcon;
  if (/faculty|teacher|staff/.test(t)) return UsersIcon;
  if (/since|1991|years/.test(t)) return BuildingLibraryIcon;
  if (/grade|k–12|k-12/.test(t)) return CalendarDaysIcon;
  if (/greeley|colorado/.test(t)) return MapPinIcon;
  if (/faith|belief/.test(t)) return ShieldCheckIcon;
  return [CheckBadgeIcon, BuildingLibraryIcon, AcademicCapIcon, UserGroupIcon][index % 4];
}

/* ---------- FAQ accordion (answers always in the HTML) ---------- */

export function FaqAccordion({ faqs, headingLevel = 3 }: { faqs: CmsFaq[]; headingLevel?: 2 | 3 }) {
  if (!faqs.length) return <div className="cb-empty"><strong>Questions are being written.</strong><p>Call {OFFICE.phone} and we will gladly answer yours.</p></div>;
  const H = headingLevel === 2 ? "h2" : "h3";
  return <div className="cb-faq" data-testid="faq-list">
    {faqs.map((f, i) => <details key={f.id} className="cb-faq-item" data-testid={`faq-item-${f.id}`} open={i === 0}>
      <summary><H className="cb-faq-q">{inlineMarkdown(f.question, `fq-${f.id}`)}</H><span className="cb-faq-toggle" aria-hidden="true" /></summary>
      <div className="cb-faq-a"><MarkdownContent markdown={f.answer} /></div>
    </details>)}
  </div>;
}

/* ---------- Teachers row ---------- */

export function TeacherRow({ staff }: { staff: CmsStaff[] }) {
  const teachers = staff.filter((s) => !isAdministrative(s) && s.photo).slice(0, 6);
  if (!teachers.length) return null;
  return <ul className="cb-teachers" data-testid="home-teachers">
    {teachers.map((p, i) => <Reveal as="li" key={p.slug} delay={i * 60}>
      <Link href={staffProfilePath(p)} className="cb-teacher" data-testid={`teacher-card-${p.slug}`}>
        <span className="cb-teacher-photo"><img src={mediaUrl(p.photo)} alt={p.alt || `Portrait of ${p.name}`} style={{ objectPosition: portraitPosition(p) }} loading="lazy" /></span>
        <strong>{p.name}</strong>
        <small>{fixText(p.role)}</small>
      </Link>
    </Reveal>)}
  </ul>;
}

/* ---------- Latest news ---------- */

export function LatestNews({ news, count = 3 }: { news: CmsArticle[]; count?: number }) {
  const latest = sortArticles(news.filter(isLivePost)).slice(0, count);
  if (!latest.length) return null;
  return <ul className="cb-card-grid" data-testid="home-latest-news">
    {latest.map((n, i) => <Reveal as="li" key={n.path} delay={i * 80}>
      <article className="cb-card">
        <span className="cb-card-meta">{formatDate(n.date)}</span>
        <h3><Link href={articleHref(n, "news")}>{fixText(n.title)}</Link></h3>
        <p className="cb-clamp">{n.summary?.trim() || excerpt(n.markdown, 160)}</p>
        <MoreLink href={articleHref(n, "news")}>Read more</MoreLink>
      </article>
    </Reveal>)}
  </ul>;
}

/* ---------- Card lists from markdown ("- **Title** — description → [link](...)") ---------- */

const CARD_ITEM = /^[-*]\s+\*\*(.+?)\*\*\s*[—–:-]?\s*(.*)$/;

function CardList({ items }: { items: string[] }) {
  const resolve = useResolvedHref();
  return <ul className={`cb-card-grid ${items.length === 2 || items.length === 4 ? "is-two" : ""}`}>
    {items.map((raw, i) => {
      const m = raw.match(CARD_ITEM)!;
      const title = m[1].replace(/\.$/, "");
      let desc = m[2];
      const links = [...desc.matchAll(/(?:→\s*)?\[([^\]]+)\]\(([^)\s]+)\)/g)];
      const last = links[links.length - 1];
      if (last && desc.trim().endsWith(last[0].trim())) desc = desc.slice(0, desc.lastIndexOf(last[0])).replace(/[\s→·]+$/, "");
      const Icon = iconFor(`${title} ${desc}`, i);
      return <Reveal as="li" key={i} delay={i * 70}>
        <article className="cb-card">
          <span className="cb-card-icon"><Icon aria-hidden="true" /></span>
          <h3>{inlineMarkdown(title, `ct-${i}`)}</h3>
          <p>{inlineMarkdown(desc, `cd-${i}`)}</p>
          {last && <MoreLink href={resolve(last[2])}>{fixText(last[1].replace(/\s*→\s*$/, ""))}</MoreLink>}
        </article>
      </Reveal>;
    })}
  </ul>;
}

/** Renders a section body, turning bold-titled bullet lists into brand cards. */
/** "### Title" blocks become brand cards: icon, title, clamped description, and every link as a visible action. */
function H3Cards({ blocks }: { blocks: { title: string; body: string }[] }) {
  const resolve = useResolvedHref();
  return <ul className={`cb-card-grid ${blocks.length === 2 || blocks.length === 4 ? "is-two" : ""}`} data-testid="home-h3-cards">
    {blocks.map((b, i) => {
      const paras = b.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
      const linkOnly = (p: string) => /^\s*(?:(?:→\s*)?\[[^\]]+\]\([^)\s]+\)[\s·|•,→]*)+$/.test(p);
      const desc = paras.filter((p) => !linkOnly(p)).join("\n\n");
      const seen = new Set<string>();
      const links = [...b.body.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)].filter((m) => !m[0].startsWith("!") && !seen.has(m[2]) && seen.add(m[2]));
      const Icon = iconFor(`${b.title} ${desc}`, i);
      return <Reveal as="li" key={i} delay={i * 70}>
        <article className="cb-card">
          <span className="cb-card-icon"><Icon aria-hidden="true" /></span>
          <h3>{inlineMarkdown(b.title, `h3c-${i}`)}</h3>
          <div className="cb-clamp-2"><MarkdownContent markdown={desc} /></div>
          {links.length > 0 && <ul className="cb-card-actions">{links.map((m, j) => <li key={j}><MoreLink href={resolve(m[2])}>{fixText(m[1].replace(/\s*→\s*$/, ""))}</MoreLink></li>)}</ul>}
        </article>
      </Reveal>;
    })}
  </ul>;
}

export function SectionBody({ body, h3Cards = false }: { body: string; h3Cards?: boolean }) {
  const qchunks = splitTestimonials(body);
  if (qchunks.some((c) => c.type === "quotes" && (c.items.length >= 2 || c.items.some((t) => t.attribution)))) {
    return <>{qchunks.map((c, i) => c.type === "quotes" ? <QuoteCards key={i} items={c.items} /> : <SectionBody key={i} body={c.text} h3Cards={h3Cards} />)}</>;
  }
  if (h3Cards) {
    const parts = body.split(/^###\s+/m);
    if (parts.length >= 3) {
      const blocks = parts.slice(1).map((p) => { const nl = p.indexOf("\n"); return { title: (nl < 0 ? p : p.slice(0, nl)).trim(), body: nl < 0 ? "" : p.slice(nl + 1) }; });
      // Trailing link-only/prose after the last card's first paragraph group stays with that card.
      return <>{parts[0].trim() && <MarkdownContent markdown={parts[0]} />}<H3Cards blocks={blocks} /></>;
    }
  }
  const lines = body.split("\n");
  const cardIdx = lines.map((l, i) => (CARD_ITEM.test(l.trim()) ? i : -1)).filter((i) => i >= 0);
  if (cardIdx.length < 2) return <MarkdownContent markdown={body} />;
  const first = cardIdx[0];
  const last = cardIdx[cardIdx.length - 1];
  const before = lines.slice(0, first).join("\n");
  const items = lines.slice(first, last + 1).map((l) => l.trim()).filter((l) => CARD_ITEM.test(l));
  const after = lines.slice(last + 1).join("\n");
  return <>
    {before.trim() && <MarkdownContent markdown={before} />}
    <CardList items={items} />
    {after.trim() && <MarkdownContent markdown={after} />}
  </>;
}

function TrustStrip({ body }: { body: string }) {
  const items = body.split("\n").map((l) => l.trim()).filter((l) => /^[-*]\s+/.test(l)).map((l) => l.replace(/^[-*]\s+/, ""));
  const rest = body.split("\n").filter((l) => !/^\s*[-*]\s+/.test(l)).join("\n");
  return <section className="cb-trust" aria-label="CHESS at a glance" data-testid="home-trust-strip">
    <ul>{items.map((t, i) => { const Icon = iconFor(t, i); return <Reveal as="li" key={i} delay={i * 60}><Icon aria-hidden="true" /><span>{inlineMarkdown(t, `tr-${i}`)}</span></Reveal>; })}</ul>
    {rest.trim() && <div className="cb-trust-note"><MarkdownContent markdown={rest} /></div>}
  </section>;
}

type Kind = "trust" | "teachers" | "faq" | "band" | "news" | "quotes" | "default";
function kindOf(s: MdSection): Kind {
  const t = s.title.toLowerCase();
  const isList = s.body.trim() && s.body.split("\n").filter((l) => l.trim()).every((l) => /^\s*[-*]\s+/.test(l));
  if ((!s.title || /trust|at a glance|quick facts/.test(t)) && isList) return "trust";
  if (/taught by|meet our teachers|our teachers/.test(t)) return "teachers";
  if (/questions parents ask|frequently asked|^faq/.test(t)) return "faq";
  if (/questions about getting started|come see chess|we'd love to meet|we’d love to meet/.test(t)) return "band";
  if (/blog|latest news|from the chess blog|news/.test(t)) return "news";
  if ((s.body.match(/^\s*>/gm) || []).length >= 2 || /famil(y|ies) (say|stories)|from chess families|testimonial/.test(t)) return "quotes";
  return "default";
}

export function HomeSections({ content }: { content: SiteContentExt }) {
  const sections = splitSections(content.home?.markdown ?? "");
  const faqs = (content.faqs ?? []).filter((f) => f.showOnHome);
  const hasNews = sections.some((s) => kindOf(s) === "news");
  const hasTeachers = sections.some((s) => kindOf(s) === "teachers");
  let tone = 0;
  const out: ReactNode[] = [];
  sections.forEach((s, i) => {
    const kind = kindOf(s);
    const key = `${s.id || "intro"}-${i}`;
    if (kind === "trust") { out.push(<TrustStrip key={key} body={s.body} />); return; }
    if (kind === "band") {
      if (!hasNews && i === sections.length - 1) out.push(<NewsSection key="auto-news" news={content.news} tone={tone++} />);
      out.push(<section key={key} id={s.id} className="cb-band" aria-labelledby={`h-${key}`}>
        <div className="cb-band-inner"><span className="cb-band-rule" aria-hidden="true" /><h2 id={`h-${key}`}>{inlineMarkdown(s.title, key)}</h2><MarkdownContent markdown={s.body} /></div>
      </section>);
      return;
    }
    const cls = `cb-home-section ${tone++ % 2 ? "is-tint" : ""} is-${kind}`;
    out.push(<section key={key} id={s.id || undefined} className={cls} aria-labelledby={s.title ? `h-${key}` : undefined}>
      <div className="cb-container">
        {s.title && <Reveal className="cb-section-head"><span className="cb-rule" aria-hidden="true" /><h2 id={`h-${key}`}>{inlineMarkdown(s.title, key)}</h2></Reveal>}
        {kind === "faq" && faqs.length
          ? <><FaqAccordion faqs={faqs} /><p className="cb-section-foot"><MoreLink href="/faq" testId="link-all-faqs">See all questions</MoreLink></p></>
          : kind === "teachers"
            ? <>{(() => { const parts = s.body.split(/\n(?=\s*\[[^\]]+\]\([^)]+\)\s*$)/m); return <><MarkdownContent markdown={parts[0]} /><TeacherRow staff={content.staff} />{parts.slice(1).join("\n").trim() ? <MarkdownContent markdown={parts.slice(1).join("\n")} /> : <p className="cb-btn-row"><Button href="/about/our-people" variant="secondary" arrow testId="button-meet-people">Meet all our people</Button></p>}</>; })()}</>
            : <SectionBody body={s.body} h3Cards />}
        {kind === "news" && <LatestNews news={content.news} />}
      </div>
    </section>);
    if (kind === "quotes" && !hasTeachers && content.staff.length) {
      out.push(<section key="auto-teachers" className={`cb-home-section ${tone++ % 2 ? "is-tint" : ""}`}><div className="cb-container"><div className="cb-section-head"><span className="cb-rule" aria-hidden="true" /><h2>Taught by Christian teachers who know homeschool families</h2></div><TeacherRow staff={content.staff} /><p className="cb-btn-row"><Button href="/about/our-people" variant="secondary" arrow>Meet all our people</Button></p></div></section>);
    }
  });
  if (!hasNews && !sections.some((s) => kindOf(s) === "band")) out.push(<NewsSection key="auto-news" news={content.news} tone={tone++} />);
  return <>{out}</>;
}

function NewsSection({ news, tone }: { news: CmsArticle[]; tone: number }) {
  if (!news.some(isLivePost)) return null;
  return <section className={`cb-home-section ${tone % 2 ? "is-tint" : ""}`} aria-labelledby="h-latest-news">
    <div className="cb-container">
      <div className="cb-section-head"><span className="cb-rule" aria-hidden="true" /><h2 id="h-latest-news">From the CHESS Blog</h2></div>
      <LatestNews news={news} />
      <p className="cb-section-foot"><MoreLink href="/news">All news & blog posts</MoreLink></p>
    </div>
  </section>;
}

/* ---------- Hero ---------- */

export function HomeHero({ content }: { content: SiteContentExt }) {
  const home = content.home;
  const image = content.homeImage ? mediaUrl(content.homeImage) : "";
  return <section className="cb-hero" aria-labelledby="home-title">
    {image && <SiteImage className="cb-hero-img" src={content.homeImage!} sizes="100vw" alt={content.homeImageAlt || ""} fetchPriority="high" />}
    {!image && <p className="cb-hero-photo-placeholder">{content.homeImageAlt || "[CONFIRM: upload an approved CHESS classroom or family photo.]"}</p>}
    <div className="cb-hero-overlay" aria-hidden="true" />
    <div className="cb-hero-inner">
      <p className="cb-hero-eyebrow">&ldquo;Pursuing the Knowledge of God.&rdquo;</p>
      <h1 id="home-title" data-testid="text-home-title">{fixText(home?.label || "A Christ-Centered Education, With Your Family at the Center")}</h1>
      {home?.description && <p className="cb-hero-sub" data-testid="text-home-subhead">{fixText(home.description)}</p>}
      <div className="cb-btn-row">
        <Button href={VISIT_PATH} onDark arrow testId="button-hero-visit">Schedule a Visit</Button>
        <Button href="/programs" variant="secondary" onDark testId="button-hero-programs">See Programs &amp; Tuition</Button>
      </div>
      <p className="cb-hero-call">Prefer to talk first? Call <a href={OFFICE.tel} data-testid="link-hero-call">{OFFICE.phone}</a></p>
    </div>
  </section>;
}

export function HomePage({ content }: { content: SiteContentExt }) {
  return <div className="cb-home">
    <HomeHero content={content} />
    {content.home?.blocks
      ? <><HomeSections content={content} /><PuckAdditionalRenderer blocks={content.home.blocks} /></>
      : <HomeSections content={content} />}
  </div>;
}

import { useMemo, useState, type FormEvent } from "react";
import { Link, useSearch } from "wouter";
import { useSubmitInquiry, type CmsArticle, type CmsStaff, type CmsPage, type InquiryInput } from "@workspace/api-client-react";
import {
  ArrowDownTrayIcon, CalendarDaysIcon, CheckCircleIcon, ClockIcon, EnvelopeIcon, MapPinIcon, PhoneIcon, UserIcon,
} from "@heroicons/react/24/outline";
import {
  MAP_EMBED, MAP_LINK, OFFICE, articleHref, excerpt, fixText, formatDate, sortArticles, stripSourceTitle, type SiteContentExt,
} from "../lib/cms";
import { administrativeStaff, isAdministrative } from "../../directory-helpers.mjs";
import { Button, Confirm, Eyebrow, MoreLink, Reveal } from "./brand";
import { MarkdownContent, useDocUrl, useResolvedHref } from "./markdown";
import { FaqAccordion } from "./home-page";
import { FacultyGrid } from "./faculty-grid";
import { PraxiBox, QuietVisit, VisitBand } from "./site-chrome";
import { PagePhoto } from "./site-image";
import { PuckAdditionalRenderer } from "./puck-render";

const PROGRAMS: InquiryInput["program"][] = ["Independent School", "Academy", "Diploma", "Not sure"];
const PROGRAM_LABEL: Record<string, string> = { "Independent School": "Independent School", Academy: "K–12 Academy", Diploma: "High School Diploma Program", "Not sure": "Not sure yet" };

/* ---------- Ask a Question / visit request form (persists to /api/inquiries) ---------- */

export function InquiryForm({ heading = "Ask a Question", intro, defaultQuestion = "" }: { heading?: string; intro?: string; defaultQuestion?: string }) {
  const submit = useSubmitInquiry();
  const [form, setForm] = useState({ parentName: "", email: "", phone: "", grades: "", program: "" as string, question: defaultQuestion, website: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof form, v: string) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: "" })); };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.parentName.trim()) next.parentName = "Please tell us your name.";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = "Please enter an email address we can reply to.";
    if (!form.grades.trim()) next.grades = "Please list your child's grade(s).";
    if (!form.program) next.program = "Please choose a program, or \"Not sure\".";
    setErrors(next);
    if (Object.keys(next).length) return;
    setServerError("");
    try {
      await submit.mutateAsync({ data: {
        parentName: form.parentName.trim(), email: form.email.trim(), phone: form.phone.trim() || undefined, grades: form.grades.trim(),
        program: form.program as InquiryInput["program"], question: form.question.trim() || undefined, website: form.website || undefined,
      } });
      setDone(true);
    } catch (err) {
      const data = (err as { data?: { error?: string } })?.data;
      setServerError(data?.error || (err instanceof Error ? err.message : "") || "Your message could not be sent.");
    }
  };

  if (done) return <div className="cb-form-done" role="status" data-testid="status-inquiry-sent">
    <CheckCircleIcon aria-hidden="true" />
    <div>
      <h3>Thank you!</h3>
      <p>Our office will reply within <Confirm>[CONFIRM: 1–2]</Confirm> business days. Office hours: Mon &amp; Wed 10:00 am–1:00 pm.</p>
    </div>
  </div>;

  const field = (k: "parentName" | "email" | "phone" | "grades", label: string, opts: { type?: string; optional?: boolean; auto?: string } = {}) => <div className="cb-field">
    <label htmlFor={`inq-${k}`}>{label}{opts.optional && <span className="cb-optional"> (optional)</span>}</label>
    <input id={`inq-${k}`} type={opts.type || "text"} autoComplete={opts.auto} value={form[k]} onChange={(e) => set(k, e.target.value)} aria-invalid={Boolean(errors[k])} aria-describedby={errors[k] ? `inq-${k}-err` : undefined} data-testid={`input-inquiry-${k}`} />
    {errors[k] && <p className="cb-field-error" id={`inq-${k}-err`}>{errors[k]}</p>}
  </div>;

  return <form className="cb-form" onSubmit={onSubmit} noValidate aria-labelledby="inquiry-heading">
    <h3 id="inquiry-heading">{heading}</h3>
    {intro && <p className="cb-form-intro">{intro}</p>}
    <div className="cb-form-grid">
      {field("parentName", "Parent name", { auto: "name" })}
      {field("email", "Email", { type: "email", auto: "email" })}
      {field("phone", "Phone", { type: "tel", optional: true, auto: "tel" })}
      {field("grades", "Child's grade(s)")}
    </div>
    <fieldset className="cb-field cb-radio-group" aria-describedby={errors.program ? "inq-program-err" : undefined}>
      <legend>Program interest</legend>
      <div>{PROGRAMS.map((p) => <label key={p} className={`cb-radio ${form.program === p ? "is-on" : ""}`}>
        <input type="radio" name="program" value={p} checked={form.program === p} onChange={() => set("program", p)} data-testid={`radio-program-${p.replace(/\s+/g, "-").toLowerCase()}`} />{PROGRAM_LABEL[p]}
      </label>)}</div>
      {errors.program && <p className="cb-field-error" id="inq-program-err">{errors.program}</p>}
    </fieldset>
    <div className="cb-field">
      <label htmlFor="inq-question">Question<span className="cb-optional"> (optional)</span></label>
      <textarea id="inq-question" rows={4} value={form.question} onChange={(e) => set("question", e.target.value)} data-testid="input-inquiry-question" />
    </div>
    <div className="cb-hp" aria-hidden="true"><label htmlFor="inq-website">Website</label><input id="inq-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set("website", e.target.value)} /></div>
    {serverError && <p className="cb-form-error" role="alert">{serverError} You can also call {OFFICE.phone}.</p>}
    <Button type="submit" disabled={submit.isPending} testId="button-submit-inquiry">{submit.isPending ? "Sending…" : "Send to the office"}</Button>
  </form>;
}

/* ---------- Shared office blocks ---------- */

export function OfficeHours() {
  return <div className="cb-table-wrap"><table className="cb-hours" data-testid="table-office-hours">
    <caption>Office hours</caption>
    <tbody>
      <tr><th scope="row">School year</th><td>Mon &amp; Wed 10:00 am–1:00 pm<br /><span className="cb-muted">Tue &amp; Thu academy days by appointment</span></td></tr>
      <tr><th scope="row">Summer</th><td>Mon–Thu 10:00 am–1:00 pm</td></tr>
      <tr><th scope="row">Fri–Sun</th><td>Closed</td></tr>
    </tbody>
  </table></div>;
}

export function AddressCard() {
  return <div className="cb-address-card">
    <ul>
      <li><MapPinIcon aria-hidden="true" /><span><strong>{OFFICE.name}</strong><br />{OFFICE.street}<br />{OFFICE.city}<br /><a href={MAP_LINK} target="_blank" rel="noopener noreferrer">Get directions</a></span></li>
      <li><PhoneIcon aria-hidden="true" /><a href={OFFICE.tel} data-testid="link-contact-phone">{OFFICE.phone}</a></li>
      <li><EnvelopeIcon aria-hidden="true" /><a href={`mailto:${OFFICE.email}`} data-testid="link-contact-email">{OFFICE.email}</a></li>
    </ul>
  </div>;
}

export function MapEmbed() {
  return <div className="cb-map"><iframe title="Map to CHESS, 1300 9th Street, Greeley, Colorado" src={MAP_EMBED} loading="lazy" referrerPolicy="no-referrer-when-downgrade" /></div>;
}

/** Booking links come from migrated page markdown (no URLs are invented here). */
function useBookingLinks(pages: CmsPage[]) {
  const resolve = useResolvedHref();
  return useMemo(() => {
    const md = pages.map((p) => p.markdown).join("\n");
    const links = [...md.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)]
      .filter((m) => /acuity|scheduling|calendly|book|appointment/i.test(m[2]) && !/\.(png|jpe?g)/i.test(m[2]));
    const find = (re: RegExp) => links.find((m) => re.test(m[1]) || re.test(m[2]));
    const kearns = find(/kearns|admission|3129877/i);
    const brown = find(/brown|principal|14642909/i);
    return { kearns: kearns ? resolve(kearns[2]) : undefined, brown: brown ? resolve(brown[2]) : undefined };
  }, [pages, resolve]);
}

function BookingCards({ pages }: { pages: CmsPage[] }) {
  const { kearns, brown } = useBookingLinks(pages);
  const card = (who: string, role: string, what: string, href: string | undefined, id: string) => <Reveal as="article" className="cb-card cb-booking">
    <span className="cb-card-icon"><UserIcon aria-hidden="true" /></span>
    <h3>{who}</h3>
    <p className="cb-card-meta">{role}</p>
    <p>{what}</p>
    {href
      ? <Button href={href} testId={`button-book-${id}`}>Book with {who.replace(/^(Mrs\.|Principal)\s+/, "$1 ")}</Button>
      : <><Button href={OFFICE.tel} variant="secondary" testId={`button-book-${id}-call`}>Call to book {OFFICE.phone}</Button><p className="cb-muted"><Confirm>[CONFIRM: online booking link]</Confirm></p></>}
  </Reveal>;
  return <div className="cb-card-grid is-two">
    {card("Mrs. Amy Kearns", "Admissions Coordinator", "Admissions help, program fit, and Diploma Program questions.", kearns, "kearns")}
    {card("Principal Mary Brown", "Principal", "General questions and principal interviews.", brown, "brown")}
  </div>;
}

/* ---------- Editable office content parsed from page markdown ---------- */

type OfficeSec = { title: string; body: string };
const HANDLED = /address|location|directions|phone|e-?mail|contact (info|details)|schedul|book|appointment|meet with|meeting/i;
const HOURS = /hours/i;
const CLOSED = /closed|closure|holiday/i;
const NOISE_LINE = /(acuityscheduling|squarespace|^#\s+|1300 9th|346-0099|@coloradoheritage\.org)/i;

function parseOffice(markdown: string) {
  const secs: OfficeSec[] = [];
  let cur: OfficeSec = { title: "", body: "" };
  stripSourceTitle(markdown).replace(/\r/g, "").split("\n").forEach((line) => {
    const m = line.match(/^#{2,3}\s+(.+?)\s*$/);
    if (m) { if (cur.title || cur.body.trim()) secs.push(cur); cur = { title: m[1], body: "" }; }
    else cur.body += `${line}\n`;
  });
  if (cur.title || cur.body.trim()) secs.push(cur);
  const intro = (secs[0] && !secs[0].title ? secs.shift()!.body : "").split("\n").filter((l) => !NOISE_LINE.test(l) && l.trim() !== OFFICE.name).join("\n").trim();
  const clean = (sec: OfficeSec) => ({ ...sec, body: sec.body.split("\n").filter((l) => !/acuityscheduling/i.test(l)).join("\n") });
  const hours = secs.filter((x) => HOURS.test(x.title) && !CLOSED.test(x.title)).map(clean);
  const closed = secs.filter((x) => CLOSED.test(x.title)).map(clean);
  const extra = secs.filter((x) => !HOURS.test(x.title) && !CLOSED.test(x.title) && !HANDLED.test(x.title)).map(clean).filter((x) => x.body.trim());
  return { intro, hours, closed, extra };
}

function HoursBlock({ hours, closed }: { hours: OfficeSec[]; closed: OfficeSec[] }) {
  return <div className="cb-stack" data-testid="office-hours">
    {hours.length
      ? hours.map((h, i) => <section key={i} className="cb-hours-sec"><h3>{h.title}</h3><MarkdownContent markdown={h.body} /></section>)
      : <OfficeHours />}
    {closed.map((c, i) => <section key={`c${i}`} className="cb-hours-sec"><h3>{c.title}</h3><MarkdownContent markdown={c.body} /></section>)}
  </div>;
}

/* ---------- /contact ---------- */

export function ContactPage({ page, content }: { page: CmsPage; content: SiteContentExt }) {
  const search = useSearch();
  const topic = new URLSearchParams(search).get("topic");
  const { intro, hours, closed, extra } = parseOffice(page.markdown);
  return <article className="cb-page" data-testid="page-contact">
    <header className="cb-page-head"><Eyebrow>Colorado Heritage Education School System</Eyebrow><h1>{fixText(page.label) || "Contact Us"}</h1>{page.description && <p>{fixText(page.description)}</p>}</header>
    {intro && <div className="cb-prose-wrap"><MarkdownContent markdown={intro} /></div>}
    <PuckAdditionalRenderer blocks={page.blocks} />
    <div className="cb-contact-grid">
      <div className="cb-stack"><AddressCard /><HoursBlock hours={hours} closed={closed} /></div>
      <MapEmbed />
    </div>
    <section className="cb-page-section" aria-labelledby="h-schedule-meeting">
      <h2 id="h-schedule-meeting">Schedule a meeting</h2>
      <p>Booking availability can differ from office hours. Choose who you would like to meet:</p>
      <BookingCards pages={[page, ...content.pages.filter((p) => p.path === "/admissions/visit")]} />
    </section>
    {extra.map((x, i) => <section key={i} className="cb-page-section"><h2>{x.title}</h2><MarkdownContent markdown={x.body} /></section>)}
    <section className="cb-page-section" id="ask">
      <InquiryForm heading="Ask a Question" intro="Send a short note and the office will reply." defaultQuestion={topic === "scholarship" ? "I have a question about scholarships." : ""} />
    </section>
  </article>;
}

/* ---------- /admissions/visit ---------- */

export function VisitPage({ page, content }: { page: CmsPage; content: SiteContentExt }) {
  const contact = content.pages.find((p) => p.path === "/contact");
  const own = parseOffice(page.markdown);
  const fallback = contact ? parseOffice(contact.markdown) : { hours: [], closed: [] };
  const hours = own.hours.length ? own.hours : fallback.hours;
  const closed = own.closed.length ? own.closed : fallback.closed;
  return <article className="cb-page" data-testid="page-visit">
    <header className="cb-page-head"><Eyebrow>Admissions</Eyebrow><h1>{fixText(page.label) || "Come Meet Us"}</h1>{page.description && <p>{fixText(page.description)}</p>}</header>
    {own.intro && <div className="cb-prose-wrap"><MarkdownContent markdown={own.intro} /></div>}
    <PuckAdditionalRenderer blocks={page.blocks} />
    <section className="cb-page-section" aria-labelledby="h-book">
      <h2 id="h-book"><CalendarDaysIcon className="cb-h-icon" aria-hidden="true" />Book a time</h2>
      <BookingCards pages={[page, ...(contact ? [contact] : [])]} />
    </section>
    {own.extra.map((x, i) => <section key={i} className="cb-page-section"><h2>{x.title}</h2><MarkdownContent markdown={x.body} /></section>)}
    <section className="cb-page-section cb-visit-split">
      <InquiryForm heading="Prefer we reach out?" intro="Tell us a little about your family and the office will be in touch." />
      <div className="cb-stack">
        <h2><ClockIcon className="cb-h-icon" aria-hidden="true" />When we are here</h2>
        <HoursBlock hours={hours} closed={closed} />
        <AddressCard />
        <MapEmbed />
      </div>
    </section>
  </article>;
}

/* ---------- /faq ---------- */

export function FaqPage({ content }: { content: SiteContentExt }) {
  const page = content.pages.find((item) => item.path === "/faq");
  const intro = stripSourceTitle(page?.markdown ?? "")
    .replace(/!\[[^\]]*\]\((?:[^)"]|"[^"]*")+\)/g, "")
    .replace(/^#{1,3}\s*Questions Parents Ask\s*\n?/im, "")
    .trim();
  return <article className="cb-page" data-testid="page-faq">
    <header className="cb-page-head"><Eyebrow>For parents</Eyebrow><h1>{fixText(page?.label || "Frequently Asked Questions")}</h1><p>{fixText(page?.description || "Plain answers about the Independent School, K–12 Academy classes, the High School Diploma Program, cost, and how to start.")}</p></header>
    <PagePhoto markdown={page?.markdown} />
    {intro && <div className="cb-prose-wrap"><MarkdownContent markdown={intro} /></div>}
    <PuckAdditionalRenderer blocks={page?.blocks} />
    <section className="cb-page-section" aria-labelledby="h-faq"><h2 id="h-faq">Questions Parents Ask</h2><FaqAccordion faqs={content.faqs ?? []} /></section>
    <VisitBand title="Still have a question?" text="Call the office or schedule a visit. We would love to meet your family." />
  </article>;
}

/* ---------- /about/our-people ---------- */

export function PeoplePage({ page, content }: { page: CmsPage; content: SiteContentExt }) {
  const admin = administrativeStaff(content.staff);
  type Ext = CmsStaff & { faculty?: boolean; board?: boolean; boardRole?: string };
  const staff = content.staff as Ext[];
  const faculty = staff.filter((s) => !isAdministrative(s) && (s.faculty === true || (s.faculty !== false && !s.board)));
  const boardPeople = staff.filter((s) => s.board).map((s) => ({ ...s, role: s.boardRole || s.role }));
  // Imported bios live on profile pages; keep only extra Board copy, minus names already shown as cards.
  const md = stripSourceTitle(page.markdown);
  const boardAt = md.search(/^#{1,3}\s*(our\s+)?board/im);
  let board = boardAt >= 0 ? md.slice(boardAt).replace(/^#{1,3}\s*(our\s+)?board[^\n]*\n/i, "") : "";
  const nextHeading = board.search(/^#{1,2}\s/m);
  if (nextHeading >= 0) board = board.slice(0, nextHeading);
  board = board.replace(/!\[[^\]]*\]\((?:[^)"]|"[^"]*")+\)/g, "");
  if (boardPeople.length) {
    const names = boardPeople.map((p) => p.name.replace(/^(mr|mrs|ms|miss|dr|pastor)\.?\s+/i, "").toLowerCase());
    board = board.split("\n").filter((l) => !names.some((n) => l.toLowerCase().includes(n))).join("\n");
  }
  board = board.replace(/^### [^\n]*\n([\s\S]*?)(?=^### |(?![\s\S]))/gm, (section, body: string) =>
    body.replace(/[\s*_\-|]/g, "") ? section : "");
  return <article className="cb-page cb-page-wide" data-testid="page-our-people">
    <header className="cb-page-head"><Eyebrow>About CHESS</Eyebrow><h1>{fixText(page.label) || "Our People"}</h1><p>{fixText(page.description)}</p></header>
    <section className="cb-page-section" id="administration" aria-labelledby="h-admin"><h2 id="h-admin">Administration</h2><FacultyGrid staff={admin} /></section>
    <PuckAdditionalRenderer blocks={page.blocks} />
    <section className="cb-page-section" id="faculty" aria-labelledby="h-faculty"><h2 id="h-faculty">Faculty</h2><FacultyGrid staff={faculty} /></section>
    {(boardPeople.length > 0 || board.replace(/[\s*_\-|]/g, "").length > 0) && <section className="cb-page-section" id="board" aria-labelledby="h-board"><h2 id="h-board">Board</h2>
      {boardPeople.length > 0 && <FacultyGrid staff={boardPeople} />}
      {board.replace(/[\s*_\-|]/g, "").length > 0 && <MarkdownContent markdown={board} />}
    </section>}
    <VisitBand title="Meet our teachers in person" text="Schedule a visit to meet our staff and ask your questions." />
  </article>;
}

/* ---------- /parents/calendar ---------- */

export function CalendarPage({ page, content }: { page: CmsPage; content: SiteContentExt }) {
  const docUrl = useDocUrl();
  const pdf = docUrl(page.documentPath) || page.externalUrl;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = [...content.events].filter((e) => !e.archived && (e.date || "").slice(0, 10) >= today).sort((a, b) => (a.date || "").localeCompare(b.date || "")).slice(0, 12);
  return <article className="cb-page" data-testid="page-calendar">
    <header className="cb-page-head"><Eyebrow>Parents</Eyebrow><h1>{fixText(page.label) || "Calendar & Events"}</h1><p>{fixText(page.description)}</p></header>
    <PagePhoto markdown={page.markdown} />
    {pdf && <div className="cb-btn-row"><Button href={pdf} testId="link-calendar-pdf"><ArrowDownTrayIcon className="cb-btn-icon" aria-hidden="true" /> Download the school calendar (PDF)</Button></div>}
    <section className="cb-page-section" aria-labelledby="h-upcoming">
      <h2 id="h-upcoming">Upcoming events</h2>
      {upcoming.length
        ? <ol className="cb-events">{upcoming.map((e, i) => <EventRow key={e.path} entry={e} i={i} />)}</ol>
        : <div className="cb-empty"><strong>No upcoming events are posted right now.</strong><p>The calendar PDF has every date for the school year.</p></div>}
    </section>
    {stripSourceTitle(page.markdown).trim() && <section className="cb-page-section"><MarkdownContent markdown={stripSourceTitle(page.markdown)} /></section>}
    {pdf && <object className="cb-pdf" data={`${pdf}#view=FitH`} type="application/pdf" aria-label="School calendar PDF"><p>Your browser cannot show the calendar here. <a href={pdf}>Open the calendar PDF</a>.</p></object>}
    <PuckAdditionalRenderer blocks={page.blocks} />
    <PraxiBox />
  </article>;
}

function EventRow({ entry, i }: { entry: CmsArticle; i: number }) {
  const d = new Date(`${(entry.date || "").slice(0, 10)}T12:00:00`);
  const valid = !Number.isNaN(d.getTime());
  return <Reveal as="li" delay={i * 40}>
    <Link href={articleHref(entry, "events")} className="cb-event" data-testid={`event-${i}`}>
      <span className="cb-event-date" aria-hidden="true">{valid ? <><small>{d.toLocaleDateString("en-US", { month: "short" })}</small><strong>{d.getDate()}</strong></> : <CalendarDaysIcon />}</span>
      <span><strong>{fixText(entry.title)}</strong><small>{formatDate(entry.date)}</small></span>
    </Link>
  </Reveal>;
}

/* ---------- /news (and ?archive=1) ---------- */

export function NewsIndex({ content }: { content: SiteContentExt }) {
  const search = useSearch();
  const archive = new URLSearchParams(search).get("archive") === "1";
  const [count, setCount] = useState(12);
  const list = archive
    ? sortArticles([...content.news, ...content.events].filter((a) => a.archived))
    : sortArticles(content.news.filter((a) => !a.archived));
  const byYear = useMemo(() => {
    const map = new Map<string, CmsArticle[]>();
    if (archive) list.forEach((a) => { const y = (a.date || "").slice(0, 4) || "Undated"; map.set(y, [...(map.get(y) ?? []), a]); });
    return map;
  }, [archive, list]);
  const hrefFor = (a: CmsArticle) => articleHref(a, content.events.includes(a) ? "events" : "news");
  return <article className="cb-page cb-page-wide" data-testid={archive ? "page-news-archive" : "page-news"}>
    <PagePhoto markdown={content.pages.find(p => p.path === "/news")?.markdown} />
    <header className="cb-page-head">
      <Eyebrow>{archive ? "Archive" : "From the CHESS community"}</Eyebrow>
      <h1>{archive ? "News & Events Archive" : "News & Blog"}</h1>
      <p>{archive ? "Older announcements and events, kept for reference. Dates and details may no longer apply." : "Articles, encouragement, and notes from CHESS."}</p>
      <p>{archive ? <MoreLink href="/news" testId="link-news-current">Back to current news</MoreLink> : <MoreLink href="/news?archive=1" testId="link-news-archive">Browse the archive</MoreLink>}</p>
    </header>
    {!list.length && <div className="cb-empty"><strong>Nothing posted yet.</strong><p>New stories will appear here.</p></div>}
    {archive
      ? [...byYear.entries()].map(([year, items]) => <section key={year} className="cb-page-section"><h2>{year}</h2>
        <ul className="cb-archive-list">{items.map((a) => <li key={a.path}><Link href={hrefFor(a)}><span className="cb-archived-tag">Archived</span>{fixText(a.title)}</Link><small>{formatDate(a.date)}</small></li>)}</ul>
      </section>)
      : <>
        <ul className="cb-card-grid">{list.slice(0, count).map((a, i) => <Reveal as="li" key={a.path} delay={(i % 3) * 60}>
          <article className="cb-card">
            <span className="cb-card-meta">{formatDate(a.date)}</span>
            <h2 className="cb-card-title"><Link href={articleHref(a, "news")} data-testid={`link-news-entry-${i}`}>{fixText(a.title)}</Link></h2>
            <p className="cb-clamp">{excerpt(a.markdown, 170) || "Read the full post."}</p>
            <MoreLink href={articleHref(a, "news")}>Read more</MoreLink>
          </article>
        </Reveal>)}</ul>
        {count < list.length && <p className="cb-btn-row is-center"><Button variant="secondary" onClick={() => setCount((c) => c + 12)} testId="button-load-more-news">Show more posts</Button></p>}
      </>}
    <PuckAdditionalRenderer blocks={content.pages.find((page) => page.path === "/news")?.blocks} />
  </article>;
}

export { PraxiBox, QuietVisit };

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Link, useLocation } from "wouter";
import { getGetSiteContentQueryKey, useGetSiteContent } from "@workspace/api-client-react";
import {
  ArrowUpRightIcon, Bars3Icon, CalendarDaysIcon, ChevronDownIcon, EnvelopeIcon, MapPinIcon, PhoneIcon, XMarkIcon,
} from "@heroicons/react/24/outline";
import { MAP_LINK, OFFICE, PORTAL_LINKS, PRAXI_PARENT_PORTAL, VISIT_PATH, articleHref, denverNow } from "../lib/cms";
import { Button, Logo, Tagline } from "./brand";
import type { SiteContentState } from "@workspace/api-client-react";
import { isValidMountainInput, toMountainInput } from "./puck-time";

type NavChild = { label: string; path: string; external?: boolean };
type NavItem = { label: string; path: string; children?: NavChild[] };

/** The exact six-menu information architecture from the v4 plan. */
export const NAV: NavItem[] = [
  { label: "About", path: "/about", children: [
    { label: "About CHESS", path: "/about" },
    { label: "Our Beliefs", path: "/about/beliefs" },
    { label: "Our People", path: "/about/our-people" },
    { label: "Testimonials", path: "/about/testimonials" },
  ] },
  { label: "Programs", path: "/programs", children: [
    { label: "All Programs", path: "/programs" },
    { label: "Independent School", path: "/programs/independent-school" },
    { label: "K–12 Academy", path: "/programs/academy" },
    { label: "Classes & Course Descriptions", path: "/programs/academy/classes" },
    { label: "High School Diploma", path: "/programs/diploma" },
  ] },
  { label: "Admissions", path: "/admissions", children: [
    { label: "How to Apply", path: "/admissions/apply" },
    { label: "Schedule a Visit", path: "/admissions/visit" },
    { label: "Tuition & Scholarships", path: "/admissions/tuition" },
    { label: "Acceptance Policy", path: "/admissions/acceptance-policy" },
  ] },
  { label: "Parents", path: "/parents", children: [
    { label: "Calendar & Events", path: "/parents/calendar" },
    { label: "Family Handbook", path: "/parents/handbook" },
    { label: "Testing & Homeschool Law", path: "/parents/testing" },
    { label: "Get Involved", path: "/parents/get-involved" },
    { label: "Praxi Parent Portal", path: "/parents/praxi" },
  ] },
  { label: "News", path: "/news", children: [
    { label: "News & Blog", path: "/news" },
    { label: "Gallery", path: "/gallery" },
    { label: "Listen & Learn", path: "/listen-learn" },
  ] },
  { label: "Contact", path: "/contact" },
];

const isParentsPath = (path: string) => path === "/parents" || path.startsWith("/parents/");

/* ---------- Announcements (server decides visibility; we only render activeAnnouncements) ---------- */

export function AnnouncementBar({ contentOverride }: { contentOverride?: SiteContentState } = {}) {
  const query = useGetSiteContent({ query: { queryKey: getGetSiteContentQueryKey(), refetchInterval: 30_000, refetchOnWindowFocus: true } });
  const draftNow = denverNow();
  const active = contentOverride
    ? (contentOverride.announcements ?? []).filter((announcement) => {
      const start = toMountainInput(announcement.startsAt);
      const end = toMountainInput(announcement.expiresAt);
      if (!announcement.enabled || (announcement.startsAt && (!start || !isValidMountainInput(start))) ||
          (announcement.expiresAt && (!end || !isValidMountainInput(end))) || (start && end && end <= start)) return false;
      return (!start || draftNow >= start) && (!end || draftNow < end);
    })
    : query.data?.activeAnnouncements ?? [];
  const events = contentOverride?.events ?? query.data?.events ?? [];
  if (!active.length) return null;
  return <div className="cb-announce" role="region" aria-label="School announcements" data-testid="announcement-bar">
    {active.map((a) => {
      const event = a.eventPath ? events.find((e) => e.path === a.eventPath || articleHref(e, "events") === a.eventPath) : undefined;
      const href = a.url || (event ? articleHref(event, "events") : a.eventPath);
      const label = a.buttonLabel || (href ? (event ? "Event details" : "Learn more") : "");
      return <div className="cb-announce-item" key={a.id} data-testid={`announcement-${a.id}`}>
        <p><strong>{a.title}</strong>{a.text && <span> {a.text}</span>}</p>
        {href && label && (/^https?:/i.test(href)
          ? <a href={href} target="_blank" rel="noopener noreferrer" className="cb-announce-link">{label} <span aria-hidden="true">→</span></a>
          : <Link href={href} className="cb-announce-link">{label} <span aria-hidden="true">→</span></Link>)}
      </div>;
    })}
  </div>;
}

/* ---------- Header ---------- */

export function PublicSiteHeader({ editing = false, contentOverride }: { editing?: boolean; contentOverride?: SiteContentState }) {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const contentQuery = useGetSiteContent({ query: { queryKey: getGetSiteContentQueryKey() } });
  const navRef = useRef<HTMLElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const path = location.split("?")[0].replace(/\/+$/, "") || "/";
  const pageRecords = contentOverride?.pages ?? contentQuery.data?.pages ?? [];
  const navigationRecords = contentOverride?.navigation ?? contentQuery.data?.navigation ?? [];
  const pageByPath = useMemo(() => new Map(pageRecords.map((page) => [page.path, page])), [pageRecords]);
  const navItems = useMemo(() => NAV.flatMap((item) => {
    const rootPage = pageByPath.get(item.path);
    if (!item.children && rootPage?.showInMenu === false) return [];
    const stored = navigationRecords.find((group) => group.path === item.path);
    const configuredChildren = stored?.children?.length ? stored.children : item.children?.map((child) => child.path) ?? [];
    const paths = [...configuredChildren];
    pageRecords.filter((page) => {
      const groupPrefix = item.path === "/" ? "/" : `${item.path}/`;
      return page.showInMenu === true && page.path !== item.path && page.path.startsWith(groupPrefix) && !paths.includes(page.path);
    }).sort((a, b) => (a.menuOrder ?? Number.MAX_SAFE_INTEGER) - (b.menuOrder ?? Number.MAX_SAFE_INTEGER)).forEach((page) => paths.push(page.path));
    const children = paths
      .filter((childPath) => pageByPath.get(childPath)?.showInMenu !== false)
      .map((childPath) => {
        const fixed = item.children?.find((child) => child.path === childPath);
        const page = pageByPath.get(childPath);
        return { label: page?.label || fixed?.label || childPath, path: childPath, external: fixed?.external };
      });
    return [{ ...item, children: children.length ? children : undefined }];
  }), [navigationRecords, pageByPath, pageRecords]);

  const closeAll = (except?: HTMLDetailsElement | null) => {
    navRef.current?.querySelectorAll("details[open]").forEach((d) => { if (d !== except) (d as HTMLDetailsElement).open = false; });
  };

  useEffect(() => { setOpen(false); closeAll(); }, [location]);

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) closeAll();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const openDetails = navRef.current?.querySelector<HTMLDetailsElement>("details[open]");
      if (openDetails) { openDetails.open = false; openDetails.querySelector("summary")?.focus(); return; }
      if (open) { setOpen(false); toggleRef.current?.focus(); }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);

  useEffect(() => {
    document.body.classList.toggle("cb-menu-open", open);
    return () => document.body.classList.remove("cb-menu-open");
  }, [open]);

  const guard = (event: ReactMouseEvent) => { if (editing) event.preventDefault(); else { closeAll(); } };
  const isCurrent = (p: string) => (p === "/" ? path === "/" : path === p || path.startsWith(`${p}/`));

  return <header className="cb-header">
    <div className="cb-utility">
      <div className="cb-utility-inner">
        <a href={OFFICE.tel} className="cb-utility-link" data-testid="link-header-phone"><PhoneIcon aria-hidden="true" />{OFFICE.phone}</a>
        <span className="cb-utility-right">
          <Link href="/donate" className="cb-utility-link" data-testid="link-donate" onClick={guard}>Donate</Link>
          {PORTAL_LINKS.map((portal) => <a key={portal.key} href={portal.url} target="_blank" rel="noopener noreferrer" className="cb-utility-link" data-testid={`link-portal-${portal.key}-utility`}>{portal.label}<ArrowUpRightIcon aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>)}
        </span>
      </div>
    </div>
    <div className="cb-header-inner">
      <Link href="/" className="cb-brand" aria-label="CHESS home" data-testid="link-site-brand" onClick={guard}><Logo onDark /></Link>
      <button ref={toggleRef} className="cb-menu-toggle" type="button" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="cb-main-navigation" onClick={() => setOpen((s) => !s)} data-testid="button-mobile-navigation">
        {open ? <XMarkIcon aria-hidden="true" /> : <Bars3Icon aria-hidden="true" />}<span>{open ? "Close" : "Menu"}</span>
      </button>
      <nav ref={navRef} id="cb-main-navigation" className={`cb-nav ${open ? "is-open" : ""}`} aria-label="Main navigation">
        <ul className="cb-nav-list">
          {navItems.map((item) => <li key={item.label} className={isCurrent(item.path) ? "is-current" : ""}>
            {item.children
              ? <details className="cb-dropdown" data-testid={`nav-dropdown-${item.label.toLowerCase()}`} onToggle={(e) => { const d = e.currentTarget; if (d.open) closeAll(d); }}>
                <summary>{item.label}<ChevronDownIcon aria-hidden="true" /></summary>
                <ul className="cb-dropdown-panel">
                  {item.children.map((child) => <li key={child.path}>
                    {child.external
                      ? <a href={child.path} target="_blank" rel="noopener noreferrer" data-testid="nav-link-praxi" onClick={() => closeAll()}>{child.label}<ArrowUpRightIcon aria-hidden="true" /></a>
                      : <Link href={child.path} aria-current={path === child.path ? "page" : undefined} data-testid={`nav-link-${child.path.replaceAll("/", "-").replace(/^-/, "")}`} onClick={guard}>{child.label}</Link>}
                  </li>)}
                </ul>
              </details>
              : <Link href={item.path} className="cb-nav-top" aria-current={path === item.path ? "page" : undefined} data-testid={`nav-link-${item.label.toLowerCase()}`} onClick={guard}>{item.label}</Link>}
          </li>)}
        </ul>
        <div className="cb-nav-actions">
          {isParentsPath(path)
            ? <Button href={PORTAL_LINKS[0].url} onDark testId="button-header-parent-portal">{PORTAL_LINKS[0].label}</Button>
            : <Button href={VISIT_PATH} onDark testId="button-header-visit">Schedule a Visit</Button>}
          <span className="cb-nav-mobile-extras">
            {PORTAL_LINKS.map((portal) => <Button key={portal.key} href={portal.url} variant="secondary" onDark testId={`button-mobile-portal-${portal.key}`}>{portal.label}</Button>)}
            <Link href="/donate" className="cb-nav-donate" onClick={guard}>Donate</Link>
          </span>
        </div>
      </nav>
    </div>
  </header>;
}

/** Sticky mobile action bar: Visit + Call (Praxi + Call on current-family pages). */
export function MobileActionBar() {
  const [location] = useLocation();
  const path = location.split("?")[0];
  const parents = isParentsPath(path);
  return <div className="cb-mobile-bar" role="region" aria-label="Quick actions">
    {parents
      ? <a href={PRAXI_PARENT_PORTAL} target="_blank" rel="noopener noreferrer" className="cb-mobile-bar-primary" data-testid="button-sticky-praxi"><ArrowUpRightIcon aria-hidden="true" />Praxi Portal</a>
      : <Link href={VISIT_PATH} className="cb-mobile-bar-primary" data-testid="button-sticky-visit"><CalendarDaysIcon aria-hidden="true" />Visit</Link>}
    <a href={OFFICE.tel} className="cb-mobile-bar-secondary" data-testid="button-sticky-call"><PhoneIcon aria-hidden="true" />Call</a>
  </div>;
}

/* ---------- Footer ---------- */

const FOOTER_COLUMNS: { label: string; links: NavChild[] }[] = [
  { label: "Programs", links: [
    { label: "All Programs", path: "/programs" }, { label: "Independent School", path: "/programs/independent-school" },
    { label: "K–12 Academy", path: "/programs/academy" }, { label: "High School Diploma", path: "/programs/diploma" },
    { label: "Tuition & Scholarships", path: "/admissions/tuition" },
  ] },
  { label: "About", links: [
    { label: "About CHESS", path: "/about" }, { label: "Our Beliefs", path: "/about/beliefs" },
    { label: "Our People", path: "/about/our-people" }, { label: "Testimonials", path: "/about/testimonials" },
    { label: "News & Blog", path: "/news" },
  ] },
  { label: "Connect", links: [
    { label: "Contact", path: "/contact" }, { label: "Apply", path: "/admissions/apply" },
    { label: "Donate", path: "/donate" }, { label: "Frequently Asked Questions", path: "/faq" },
    { label: "Sitemap", path: "/sitemap" },
  ] },
];

export function ContactStrip() {
  return <section className="cb-contact-strip" aria-label="Contact the CHESS office">
    <div className="cb-contact-strip-inner">
      <a href={MAP_LINK} target="_blank" rel="noopener noreferrer" data-testid="strip-address"><MapPinIcon aria-hidden="true" /><span>{OFFICE.street}, {OFFICE.city}</span></a>
      <a href={OFFICE.tel} data-testid="strip-phone"><PhoneIcon aria-hidden="true" /><span>{OFFICE.phone}</span></a>
      <a href={`mailto:${OFFICE.email}`} data-testid="strip-email"><EnvelopeIcon aria-hidden="true" /><span>{OFFICE.email}</span></a>
      <a href={PORTAL_LINKS[0].url} target="_blank" rel="noopener noreferrer" data-testid="strip-parent-portal"><ArrowUpRightIcon aria-hidden="true" /><span>{PORTAL_LINKS[0].label}</span></a>
    </div>
  </section>;
}

export function PublicSiteFooter({ editing = false }: { editing?: boolean }) {
  const guard = (event: ReactMouseEvent) => { if (editing) event.preventDefault(); };
  return <>
    <ContactStrip />
    <footer className="cb-footer">
      <div className="cb-footer-top">
        <section className="cb-footer-identity">
          <Link href="/" aria-label="CHESS home" data-testid="footer-brand-link" onClick={guard}><Logo onDark /></Link>
          <address>
            {OFFICE.street}<br />{OFFICE.city}<br />
            <a href={OFFICE.tel}>{OFFICE.phone}</a><br />
            <a href={`mailto:${OFFICE.email}`}>{OFFICE.email}</a>
          </address>
        </section>
        {FOOTER_COLUMNS.map((col) => <section className="cb-footer-col" key={col.label}>
          <h2>{col.label}</h2>
          <ul>{col.links.map((l) => <li key={l.path}><Link href={l.path} data-testid={`footer-link-${l.path.replaceAll("/", "-").replace(/^-/, "")}`} onClick={guard}>{l.label}</Link></li>)}</ul>
        </section>)}
      </div>
      <div className="cb-footer-tagline"><Tagline onDark /></div>
      <div className="cb-footer-disclaimer" data-testid="footer-disclaimer">
        Colorado Heritage Education School System admits students of any race, color, national and ethnic origin to all the rights, privileges, programs, and activities generally accorded or made available to students at Colorado Heritage. It does not discriminate on the basis of race, color, national and ethnic origin in administration of its educational policies, admissions policies, scholarship and loan programs, and athletic and other school-administered programs. Colorado Heritage Education School System is a 501 (c) (3) charitable organization.
      </div>
      <div className="cb-footer-bottom">
        <span>© {new Date().getFullYear()} Colorado Heritage Education School System</span>
        <span className="cb-footer-portals">{PORTAL_LINKS.map((portal) => <a key={portal.key} href={portal.url} target="_blank" rel="noopener noreferrer" data-testid={`footer-portal-${portal.key}`}>{portal.label}</a>)}</span>
      </div>
    </footer>
  </>;
}

/* ---------- CTA bands ---------- */

export function VisitBand({ title, text, secondary = "call" }: { title: string; text?: string; secondary?: "call" | "contact" }) {
  return <section className="cb-band" aria-label={title}>
    <div className="cb-band-inner">
      <span className="cb-band-rule" aria-hidden="true" />
      <h2>{title}</h2>
      {text && <p>{text}</p>}
      <div className="cb-btn-row is-center">
        <Button href={VISIT_PATH} onDark arrow testId="button-band-visit">Schedule a Visit</Button>
        {secondary === "call"
          ? <Button href={OFFICE.tel} variant="secondary" onDark testId="button-band-call">Call {OFFICE.phone}</Button>
          : <Button href="/contact" variant="secondary" onDark testId="button-band-contact">Contact Us</Button>}
      </div>
    </div>
  </section>;
}

export function QuietVisit({ text }: { text: string }) {
  return <aside className="cb-quiet-cta">
    <p>{text}</p>
    <Link href={VISIT_PATH} data-testid="link-quiet-visit">Schedule a Visit <span aria-hidden="true">→</span></Link>
  </aside>;
}

export function PraxiBox() {
  return <aside className="cb-quiet-cta is-praxi">
    <p>Current CHESS families: tuition payments, class registration, add/drop forms and records live in the Praxi Parent Portal.</p>
    <Button href={PRAXI_PARENT_PORTAL} variant="secondary" testId="button-praxi-box">Open Praxi Parent Portal</Button>
  </aside>;
}

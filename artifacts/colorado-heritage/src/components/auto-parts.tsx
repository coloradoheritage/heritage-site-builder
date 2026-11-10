// Parts of a public page that the site builds by itself (event lists, forms, staff grids, maps, ...). They are not
// text, so they cannot be edited in the page canvas; instead of leaving them out, the editor shows a plain note where
// they appear on the public page and a button to the place where they are edited.
import { Info } from "lucide-react";

export type AutoTab = { tab: string; label: string };
export type AutoPart = { id: string; place: "before" | "after"; title: string; text: string; tabs?: AutoTab[] };
type PageLike = { kind?: string; documentPath?: string; externalUrl?: string } | undefined;

const EVENTS: AutoTab = { tab: "events", label: "Events" };
const FAQS: AutoTab = { tab: "faqs", label: "FAQs" };
const NEWS: AutoTab = { tab: "news", label: "Blog posts" };
const STAFF: AutoTab = { tab: "staff", label: "Faculty & staff" };
const PAGES: AutoTab = { tab: "pages", label: "Pages" };
const INQUIRIES: AutoTab = { tab: "inquiries", label: "Inquiries" };
const HOME: AutoTab = { tab: "home", label: "Home photo & settings" };

export function autoPartsFor(path: string, page: PageLike): AutoPart[] {
  const parts: AutoPart[] = [];
  const document = Boolean(page?.documentPath || page?.externalUrl);
  if (path === "/") {
    parts.push({ id: "home-hero", place: "before", title: "The big photo at the top", text: "The home page opens with a large photo behind the headline. The headline and intro are edited here; the photo and its description are edited in Home photo & settings.", tabs: [HOME] });
    parts.push({ id: "home-auto", place: "after", title: "Latest blog posts, teachers, and FAQs", text: "Below your text the home page shows the newest blog posts, a row of teachers, and the FAQs marked “show on home page”. They are filled in automatically.", tabs: [NEWS, STAFF, FAQS] });
  } else if (path === "/contact") {
    parts.push({ id: "contact-auto", place: "after", title: "Address, office hours, map, booking, and question form", text: "The public page adds the school address, a map, booking cards, and a “Ask a Question” form after your text. The office hours come from the table under the heading “Office hours” in your text. Questions sent through the form arrive in Inquiries.", tabs: [INQUIRIES] });
  } else if (path === "/admissions/visit") {
    parts.push({ id: "visit-auto", place: "after", title: "Booking, question form, hours, and map", text: "The public page adds booking cards, a “Prefer we reach out?” form, office hours, the address, and a map after your text. Questions sent through the form arrive in Inquiries.", tabs: [INQUIRIES] });
  } else if (path === "/about/our-people") {
    parts.push({ id: "people-auto", place: "before", title: "The staff directory", text: "The public page shows the Administration, Faculty, and Board photo grids here, built from the people you add. Your text is only used for extra Board notes.", tabs: [STAFF] });
  } else if (path === "/parents/calendar" || path === "/families/school-calendar") {
    parts.push({ id: "calendar-events", place: "before", title: "The list of upcoming events", text: "The public page shows the next upcoming events here, built from the events you add.", tabs: [EVENTS] });
    if (document) parts.push({ id: "calendar-pdf", place: "after", title: "The calendar PDF", text: "The calendar PDF appears below your text. Choose it in Page settings." });
  } else if (path === "/faq") {
    parts.push({ id: "faq-auto", place: "after", title: "The question and answer list", text: "The public page shows every FAQ here, built from the FAQs you write.", tabs: [FAQS] });
  } else if (path === "/news") {
    parts.push({ id: "news-auto", place: "after", title: "The list of blog posts", text: "The public page shows your published blog posts here, newest first.", tabs: [NEWS] });
  } else if (path === "/donate") {
    parts.push({ id: "donate-layout", place: "before", title: "Laid out as donation cards", text: "The public page rearranges the text below into donation cards and sections, so it looks different from this editor. Change the words here; the layout is automatic." });
  } else if (path === "/admissions/tuition") {
    parts.push({ id: "tuition-faqs", place: "after", title: "Questions about cost", text: "The public page ends with the FAQs about cost and tuition, picked automatically from your FAQs.", tabs: [FAQS] });
  }
  if (page?.kind === "overview") parts.push({ id: "overview-links", place: "after", title: "Links to the pages in this section", text: "Below your text the public page lists the pages inside this section, built from the Pages list.", tabs: [PAGES] });
  if (page?.kind === "protected") parts.push({ id: "protected-box", place: "after", title: "Parent portal sign-in", text: "The public page shows the parent portal sign-in box here." });
  if (document && !parts.some((part) => part.id === "calendar-pdf")) parts.push({ id: "document-button", place: "after", title: "A download button", text: "The public page shows a button for this page's document. Choose the document in Page settings." });
  return parts;
}

export function AutoPartNotice({ part, onOpenTab }: { part: AutoPart; onOpenTab?: (tab: string) => void }) {
  return <aside className="cms-auto-part" contentEditable={false} data-testid={`auto-part-${part.id}`} aria-label={`Built into this page: ${part.title}`}>
    <Info size={18} aria-hidden="true" />
    <div>
      <strong>Built into this page: {part.title}</strong>
      <p>{part.text}</p>
      {part.tabs && onOpenTab && <span className="cms-auto-part-actions">{part.tabs.map((item) => <button type="button" key={item.tab} className="cms-btn" onClick={() => onOpenTab(item.tab)} data-testid={`auto-part-open-${item.tab}`}>Open {item.label}</button>)}</span>}
    </div>
  </aside>;
}

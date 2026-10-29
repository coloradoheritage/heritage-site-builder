import plan from "../../../../attached_assets/CHESS_site_plan_v4_1793291778431.txt";
import oldRoutes from "../../../colorado-heritage/seo-routes.json";
import sourceNews from "../../../colorado-heritage/src/data/newsArchive.json";
import documentManifest from "../data/document-manifest.json";
import { applySchoolPhotos } from "./school-photo-rollout";

type Content = Record<string, any>;
const slug = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const section = (from: string, to: string) => plan.slice(plan.indexOf(from) + from.length, plan.indexOf(to, plan.indexOf(from) + from.length)).trim();
export const MODEL = "You remain your child's primary teacher; CHESS provides private-school enrollment, classes, and accountability.";
export const portal = "https://app.praxischool.com/parent_login.php?s=1300";
export const booking = {
  amy: "https://app.acuityscheduling.com/schedule.php?owner=13645942&appointmentType=3129877",
  mary: "https://app.acuityscheduling.com/schedule.php?owner=13645942&appointmentType=14642909",
};
export const planRedirects: Record<string, string> = {
  "/home": "/", "/our-focus": "/about", "/our-purpose": "/about", "/mission-vision-statement": "/about",
  "/ou-beginning": "/about#history", "/our-history": "/about#history", "/our-foundation": "/about#foundation", "/our-foundation1": "/about#foundation",
  "/about/our-purpose": "/about#purpose", "/about/history": "/about#history", "/about/foundation": "/about#foundation",
  "/our-beliefs-1": "/about/beliefs", "/statement-of-faith": "/about/beliefs",
  "/acceptance-policy": "/admissions/acceptance-policy", "/acceptance-and-eligibility-policy-1": "/admissions/acceptance-policy", "/about/acceptance-policy": "/admissions/acceptance-policy",
  "/our-faculty": "/about/our-people", "/our-administrative-staff": "/about/our-people#administration", "/administrative-stafff": "/about/our-people#administration",
  "/our-board": "/about/our-people#board", "/board-members": "/about/our-people#board",
  "/about/faculty": "/about/our-people#faculty", "/about/staff": "/about/our-people#administration", "/about/board": "/about/our-people#board",
  "/testimonials": "/about/testimonials", "/independent-school": "/programs/independent-school", "/independent-school-3": "/programs/independent-school",
  "/academy": "/programs/academy", "/k12-academy-copy": "/programs/academy",
  "/k-12-academy-class-schedule-course-descriptions": "/programs/academy/classes", "/elem/jr-high-class-schedule": "/programs/academy/classes", "/high-school-class-schedule": "/programs/academy/classes",
  "/diploma-program": "/programs/diploma", "/diploma-program-overview": "/programs/diploma", "/high-school-diploma-program-copy-1": "/programs/diploma",
  "/programs/diploma/resources": "/programs/diploma#resources", "/programs/diploma/graduation": "/programs/diploma#graduation",
  "/families/diploma-resources": "/programs/diploma#family-resources", "/families/graduation-resources": "/programs/diploma#graduation-resources",
  "/how-to-apply": "/admissions/apply", "/families/apply": "/admissions/apply",
  "/feeschedule": "/admissions/tuition", "/families/tuition-and-fees": "/admissions/tuition", "/families/tuition-policies": "/admissions/tuition#payment-plans",
  "/families": "/parents", "/families/payment-portal": "/parents/praxi", "/families/faculty-portal": "/parents/praxi",
  "/semester-details": "/parents/handbook#semester-details", "/families/semester-details": "/parents/handbook#semester-details",
  "/dress-code": "/parents/handbook#dress-code", "/families/dress-code": "/parents/handbook#dress-code",
  "/families/electronics-policy": "/parents/handbook#electronics-policy", "/text-alerts": "/parents/handbook#text-alerts", "/families/text-alerts": "/parents/handbook#text-alerts",
  "/2021-2022-semester-schedule-dates": "/parents/calendar", "/families/school-calendar": "/parents/calendar", "/events": "/parents/calendar", "/new-events": "/parents/calendar",
  "/standardized-testing": "/parents/testing", "/standardizedtestingdates": "/parents/testing", "/families/testing": "/parents/testing",
  "/professional-evaluator-tutoring-resources": "/parents/testing#tutoring", "/families/tutoring-resources": "/parents/testing#tutoring",
  "/colorado-homeschool-law": "/parents/colorado-homeschool-law", "/families/homeschool-law": "/parents/colorado-homeschool-law",
  "/opportunities-to-serve": "/parents/get-involved", "/take-action": "/parents/get-involved", "/families/opportunities-to-serve": "/parents/get-involved",
  "/families/homeschool-services": "/programs/independent-school#homeschool-support",
  "/contact-us": "/contact", "/how-to-donate-2": "/donate",
};

export function cleanCopy(value: string): string {
  return (value || "")
    .replace(/Enrichment Accademy/gi, "K–12 Academy").replace(/Enrichment Academy/gi, "K–12 Academy")
    .replace(/accademy/gi, "Academy").replace(/womens-healt(?!h)/g, "womens-health")
    .replace(/“?umbrella school”? services/gi, "private-school enrollment and record-keeping services")
    .replace(/["“]?umbrella(?: school)?["”]?/gi, "Independent School")
    .replace(/\bIS\b/g, "Independent School").replace(/\beA\b/g, "K–12 Academy").replace(/\bDP\b/g, "High School Diploma Program")
    .replace(/10\/8/g, "10% down, then 8 monthly payments").replace(/For 25 years/gi, "Since 1991")
    .replace(/<[^>]+>/g, "") // Imported markup/styles are never trusted.
    .replace(/(?<!!)\[([^\]]*\.(?:jpg|jpeg|png|webp))\]\([^)]+\)/gi, "")
    .replace(/\[\s*\]\([^)]+\)/g, "")
    .replace(/^\s*[^/\n]+\.(?:jpg|jpeg|png|webp)\s*$/gmi, "")
    .replace(/^#{1,6}\s*(?:Comments?\s*\(\d+\)|Name.*) *$/gmi, "")
    .replace(/^\s*(?:Comments?\s*\(\d+\)|0 Likes|Share|0items|\$0)\s*$/gmi, "")
    .replace(/^\s*\\?[·•]\s*/gm, "- ")
    .replace(/^.*$/gm, line => ((line.match(/\*\*/g)?.length || 0) % 2) ? line.replace(/\*\*/g, "") : line)
    .replace(/!\[\s*\]\(/g, "![CHESS school community](")
    .replace(/\n{4,}/g, "\n\n").trim();
}

function fixLinks(markdown: string, redirects: Record<string, string>) {
  return cleanCopy(markdown).replace(/(!?)\[([^\]]*)\]\(([^)]+)\)/g, (all, image, text, href) => {
    if (image) return all;
    const original = href.replace(/^https?:\/\/(?:www\.)?coloradoheritage\.org/i, "");
    const asset = documentManifest[original as keyof typeof documentManifest];
    if (asset) return `[${text}](${asset})`;
    if (Object.hasOwn(documentManifest,original)) return `${text.replace(/\*/g,"")} (archived document no longer available)`;
    const target = redirects[original] || redirects[original.split("#")[0]];
    return target ? `[${text}](${target})` : all;
  });
}

export function seededFaqs() {
  const raw = section("Seed with these (plain language; no \"umbrella\", no abbreviations):", "JARGON RULE (site-wide)");
  return [...raw.matchAll(/(?:^|\n)(\d+)\. (.+)\n\s+([\s\S]*?)(?=\n\d+\. |\s*$)/g)].map(match => ({
    id: `faq-${match[1]}`, question: match[2].trim(), answer: match[3].trim().replace(/\s+/g, " "),
    showOnHome: [1,2,3,4,5,7].includes(Number(match[1])),
  }));
}

function homeCopy() {
  const regular = (heading: string, next: string) => section(heading, next);
  const benefits = regular("### 4. What makes CHESS different", "### 5. Faith & beliefs");
  const faith = regular("### 5. Faith & beliefs", "### 6. From CHESS families").replace("→ Read our Statement of Faith · Acceptance Policy", "[Read our Statement of Faith](/about/beliefs) · [Acceptance Policy](/admissions/acceptance-policy)");
  return `## Quick facts
- Serving families since 1991 (35 years)
- Grades K–12
- Over 500 diploma graduates
- About 75% of graduates continue to college

## From CHESS families
> "She thrived in the CHESS environment. I watched as her joy returned. The Godly aspect in each class grew my daughter spiritually, which is priceless."

— Kortney, Greeley CO

> "CHESS is very supportive of parents, and we can choose which classes to take with CHESS and which classes we would like to teach our kids at home… We count the drive as an easy sacrifice for so many wonderful benefits!"

— Polly, Firestone CO

> "As a new family to homeschooling, we were helped by CHESS to navigate the process… Switching to CHESS was the best decision we made for our high school student!"

— Crystal, Johnstown CO

[Read more family stories →](/about/testimonials)

## Taught by Christian teachers who know homeschool families
[Meet all our people →](/about/our-people)

## A diploma graduate's story
> "I don't know where to begin to thank you for all you've done… we would not have been able to home school all the way through high school without CHESS's diploma program."

[CONFIRM: attribution name/town and permission before publishing. Source testimonial is attributed to Michelle, Bailey CO. Graduate photo needed.]

## Questions about getting started? We'd love to meet your family.
[Schedule a Visit](/admissions/visit) · [Call (970) 346-0099](tel:+19703460099)

## You're called to teach your children — you don't have to do it alone
${regular("### 1. You're called to teach your children — you don't have to do it alone", "### 2. Who we are")}

## Who we are
${regular("### 2. Who we are", "### 3. Two ways to partner with CHESS (programs)").replace("- Link: Our Story & Beliefs →", "[Our Story & Beliefs →](/about)")}

## Two ways to partner with CHESS
### Independent School
Enroll your homeschool student in a private Colorado school, while you stay the primary teacher. CHESS maintains attendance and required records, fulfilling Colorado's compulsory attendance law, and families receive a 15% HSLDA membership discount.

[$125/year — view tuition](/admissions/tuition) · [Learn about the Independent School →](/programs/independent-school)

### K–12 Academy (On-Campus Classes)
Christ-centered classes on Tuesdays and Thursdays: science, math, history, Bible, literature, computer, art, music, drama, PE, and more — taught by godly teachers from a biblical worldview.

[From $270 per class — view tuition](/admissions/tuition) · [View classes & course descriptions →](/programs/academy/classes)

### Planning for high school?
The High School Diploma Program gives students a four-year plan, a private Christian school transcript, and the option to walk in our graduation ceremony, with Diploma, Honors, High Honors, and Highest Honors tracks.

[High School Diploma Program →](/programs/diploma)

## What makes CHESS different
${benefits}

## Faith & beliefs
${faith}

## How enrollment works
1. **Schedule a visit.** Meet with our admissions coordinator or principal to find the right fit for your family.
2. **Apply online.** Complete the New Family Application for the Independent School, Academy, or Diploma Program. [CONFIRM: application portal = Praxi?]
3. **Plan your year.** Choose classes, receive your enrollment confirmation, and join us on campus. [CONFIRM: step wording/deadlines]

[Schedule a Visit](/admissions/visit) · [Start Your Application](/admissions/apply)

## Tuition & scholarships
Christian education is an investment in your child's future. CHESS keeps costs transparent and offers scholarships to qualifying accepted families, funded through annual fundraisers.

[View tuition & fees →](/admissions/tuition)

## Questions Parents Ask

## Latest news

## Come See CHESS for Yourself
We'd love to meet your family, answer your questions, and help you find the right path. Call (970) 346-0099 or schedule a visit online.

[Schedule a Visit](/admissions/visit) · [Contact Us](/contact)`;
}

function tuitionCopy() {
  const raw = section("TOP: 3 KEY-NUMBER CARDS", "E4. FIRST-STEP CTA & PLACEMENT");
  const table = (n: number, heading: string, next: string) => {
    let text = section(heading, next).replace(/^TABLE \d+[^\n]*\n/, "").trim();
    text = n === 1 ? text.replace(/^\|([^\n]+)\|$/m, match => `${match}\n| --- | --- |`) : `| Fee | Amount |\n| --- | --- |\n${text}`;
    // The supplied testing table put multiple two-column rows on the same line.
    if (n === 4) text = `| Testing service | Fee |\n| --- | --- |\n| Private test session CORE | $85/test ($70/test for 2 students from the same family testing at the same time) |\n| Private test session COMPLETE | $100/test ($85/test for 2 students from the same family testing at the same time) |\n| Group Core | $55 |\n| Group Core and Complete | $65 |\n| CLT | $75 |\n| Home Testing Core (materials & hand scoring) | $55 |\n| Home Testing Complete | $65 |`;
    return text;
  };
  return `## 2026–2027 at a glance
- **Independent School: $125 per year**
- **Academy classes: from $270 per class** [CONFIRM: per school year wording]
- **High School Diploma Program: $170 per semester (+ $50 application fee)**

Pay 10% down, then 8 monthly payments. Scholarships are available for qualifying families.

Questions about cost? [Call (970) 346-0099](tel:+19703460099).

## K–12 Academy tuition
Classes meet for two 14-week semesters.

${table(1, "TABLE 1 — K–12 Academy tuition (classes meet for two 14-week semesters)", "TABLE 2 — Independent School")}

## Independent School
${table(2, "TABLE 2 — Independent School", "TABLE 3 — High School Diploma Program")}

## High School Diploma Program
${table(3, "TABLE 3 — High School Diploma Program", "TABLE 4 — Testing services")}

## Testing services
${table(4, "TABLE 4 — Testing services", "TABLE 5 — Non-Diploma Program families")}

## Non-Diploma Program families
${table(5, "TABLE 5 — Non-Diploma Program families", "SAMPLE COST box")}

## Sample cost
[CONFIRM before publishing]: Example: a high schooler taking two 2-day classes = $480 + $480 + $75 tech fee = $1,035 for the school year, payable over 8 months. Office approval needed.

## Payment plans
${raw.slice(raw.indexOf("- Payment plan —"), raw.indexOf("MULTI-CHILD DISCOUNTS:")).trim()}

[Download tuition policies (PDF)](/documents/tuition-fees-policy-2026-2027.pdf)

## Financial aid / scholarships
Scholarships for our classes are available to qualifying families who have been accepted into our school. If cost is a challenge, please ask — we will walk through options with you. Scholarships are funded by annual fundraisers.

[CONFIRM: how to apply, deadline, typical amounts.]

[Ask about scholarships →](/contact?topic=scholarship)

## Why Christian education is worth it
A Christ-centered education supports your child's academic and spiritual growth. CHESS partners with parents through classes, records, and guidance rooted in Scripture. We seek to keep costs transparent and will gladly talk through options with your family.

Although we seek to maintain our listed fee schedule, please contact us to determine up-to-date information.

[Frequently asked questions](/faq) · [Schedule a Visit](/admissions/visit) · [Call (970) 346-0099](tel:+19703460099)`;
}

export const SITE_PLAN_VERSION = 7;
function repairImportedContent(input: Content): Content {
  const content=structuredClone(input);
  content.redirects ||= {};
  content.redirects["/tuition"]="/admissions/tuition";
  const enrollmentForms=[
    {label:"New Independent School family",url:"/documents/new-family-enrollment-in-the-chess-independent-school.pdf"},
    {label:"Returning Independent School family",url:"/documents/returning-family-enrollment-in-the-chess-independent-school-ds5b.pdf"},
  ];
  const apply=content.pages.find((page:any)=>page.path==="/admissions/apply");
  if(apply&&!apply.markdown.includes(enrollmentForms[0].url)){
    apply.markdown=apply.markdown.replace(/^## Independent School\s*$/m,`## Independent School\n\n${enrollmentForms.map(f=>`[${f.label}](${f.url})`).join(" ")}`);
  }
  for(const document of content.documents){
    const form=enrollmentForms.find(f=>f.url===document.url);
    if(form&&/^here$/i.test(document.title.trim()))document.title=form.label+" enrollment form";
  }
  content.news=content.news.map((article:any)=>{
    if(article.title?.trim())return article;
    const path=`/news/school-update-${article.date}`;
    content.redirects[article.path]=path;
    for(const key of Object.keys(content.redirects))if(content.redirects[key]===article.path)content.redirects[key]=path;
    return {...article,title:`[CONFIRM] School update — ${article.date}`,path,archived:true};
  });
  for(const item of content.events){
    item.markdown=item.markdown
      .replace(/(\d{4})(\d{1,2}:\d{2})/g,"$1 at $2")
      .replace(/(\d{1,2}:\d{2})\s*([AP]M)\s*\d{1,2}:\d{2}/g,"$1 $2")
      .replace(/The Ranch5280 Arena CircleLoveland, CO 80538USA/g,"The Ranch, 5280 Arena Circle, Loveland, CO 80538, USA")
      .replace(/^Source::/gm,"Source:");
  }
  if(content.homeImage==="/api/media/files/c96cb7edeb1839d2a0684a6dc1cf19003fdd9e111d8f5666cd8c9e3e3b195975.webp"){
    content.homeImage="";
    content.homeImageAlt="[CONFIRM: upload an approved CHESS classroom or family photo.]";
  }
  content.planVersion=SITE_PLAN_VERSION;
  return applySchoolPhotos(content);
}
export function migrateSitePlan(original: Content): Content {
  if (Number(original.planVersion) >= SITE_PLAN_VERSION) return original;
  if (Number(original.planVersion) >= 6) {
    const content = applySchoolPhotos(original);
    content.planVersion = SITE_PLAN_VERSION;
    return content;
  }
  if (Number(original.planVersion) >= 4) return repairImportedContent(original);
  const content = structuredClone(original);
  const old = new Map<string, any>(content.pages.map((p: any) => [p.path, p]));
  const redirects: Record<string,string> = { ...oldRoutes.legacyRouteAliases, ...oldRoutes.sourcePaths, ...planRedirects };
  const source = (path: string) => (old.get(path)?.markdown || "").replace(/^[^\n]+ — Colorado Heritage\s*\n+/, "");
  const merged = (items: [string, string][]) => items.map(([path, heading]) => `## ${heading}\n${source(path)}`).join("\n\n");
  const set = (path: string, label: string, markdown: string, description = "", kind = "content", extras: Content = {}) => {
    old.set(path, { ...(old.get(path) || {}), path, label, title: `${label} | CHESS`, description, markdown, kind, ...extras });
  };
  set("/about", "About CHESS", merged([["/about/our-purpose","Purpose"],["/about/history","History"],["/about/foundation","Foundation"]]), "Colorado Heritage Education School System has supported homeschooling families with Christ-centered education since 1991.");
  set("/about/our-people", "Our People", `## Administration\n\n## Faculty\n\n## Board\n${source("/about/board").replace(/!\[[^\]]*\]\([^)]+\)/g, "")}`, "Meet the Christian teachers, administrative staff, and board who serve CHESS families.", "people");
  set("/admissions/acceptance-policy", "Acceptance Policy", source("/about/acceptance-policy"), "Learn about CHESS's biblical beliefs, family partnership, and acceptance expectations.");
  set("/programs/diploma", "High School Diploma", `${MODEL}\n\n${source("/programs/diploma")}\n\n${merged([["/programs/diploma/resources","Resources"],["/programs/diploma/graduation","Graduation"],["/families/diploma-resources","Family resources"],["/families/graduation-resources","Graduation resources"]])}`);
  set("/programs/independent-school", "Independent School", `${MODEL}\n\n${source("/programs/independent-school")}\n\n## Homeschool support\n${source("/families/homeschool-services")}`);
  set("/programs/academy", "K–12 Academy", `${MODEL}\n\n${source("/programs/academy")}`);
  set("/programs", "Programs", `${MODEL}\n\nFamilies can combine these programs.\n\n## Which program is right for us?\n| Program | Where / who | What CHESS provides | Cost |\n| --- | --- | --- | --- |\n| [Independent School](/programs/independent-school) | Homeschool at home | Records kept by CHESS | [$125/year](/admissions/tuition) |\n| [K–12 Academy](/programs/academy) | On-campus classes Tuesday / Thursday, K–12 | Core and enrichment classes | [From $270 per class](/admissions/tuition) |\n| [High School Diploma Program](/programs/diploma) | Grades 9–12 | Transcript & graduation | [$170/semester](/admissions/tuition) |\n\n[Classes & Course Descriptions](/programs/academy/classes) · [Schedule a Visit](/admissions/visit)`, "Private-school enrollment, K–12 Academy classes, and a High School Diploma Program for homeschooling families.");
  set("/admissions", "Admissions", "## 1. Schedule a visit\nMeet with our admissions coordinator or principal to find the right fit for your family.\n\n[Schedule a Visit](/admissions/visit)\n\n## 2. Apply\nChoose your program and complete the New Family Application.\n\n[How to Apply](/admissions/apply)\n\n## 3. Plan your year\nChoose classes and receive enrollment confirmation. [CONFIRM: remaining steps and deadlines]\n\n[Tuition & Scholarships](/admissions/tuition) · [Questions Parents Ask](/faq)\n\n## Our acceptance expectations\nCHESS partners with families in a Christ-centered education rooted in Scripture.\n\n[Read the Acceptance Policy](/admissions/acceptance-policy)");
  set("/admissions/apply", "How to Apply", `## Four steps to get started\n1. Choose your program — Independent School, K–12 Academy, or High School Diploma Program.\n2. [Schedule a visit](/admissions/visit).\n3. Submit your application.\n4. Pay the required fees. [CONFIRM: application deadlines and exact payment steps]\n\n${["Independent School","K–12 Academy","High School Diploma Program"].map(name=>`## ${name}\n[CONFIRM: New Family application portal/link and Returning Family application portal/link]\n\n[Ask the office about ${name} applications](/contact?topic=application)\n`).join("\n")}\n\n## Existing application resources\n${source("/families/apply")}\n\n[Tuition & Fees](/admissions/tuition)`);
  set("/admissions/tuition", "Tuition & Fees 2026–2027", tuitionCopy(), "Academy classes from $270, Independent School $125/year, 8-month payment plan and scholarships for qualifying families.", "tuition");
  const hours = `## Office hours\n| Season / day | Hours |\n| --- | --- |\n| School year: Monday & Wednesday | 10:00 am–1:00 pm |\n| Tuesday & Thursday academy days | By appointment; limited non-Academy availability |\n| Summer: Monday–Thursday | 10:00 am–1:00 pm |\n| Friday–Sunday | Closed |\n\n## Office closed\n[CONFIRM: current-year closure dates — Memorial Day, Labor Day, Thanksgiving week, Christmas December 13 [year]–January 3 [year].]\n`;
  const meetings = `## Schedule a meeting\n[Book with Mrs. Amy Kearns — admissions](${booking.amy})\n\n[Book with Principal Mary Brown — general questions / principal interview](${booking.mary})`;
  const address = "Colorado Heritage Education School System\n\n1300 9th Street, Greeley, CO 80631\n\n[Call (970) 346-0099](tel:+19703460099) · [office@coloradoheritage.org](mailto:office@coloradoheritage.org)";
  set("/contact", "Contact Us", `${address}\n\n${hours}\n${meetings}`, "Visit or contact CHESS at 1300 9th Street in Greeley, Colorado.", "contact");
  set("/admissions/visit", "Come Meet Us", `${address}\n\n${meetings}\n\n${hours}\n## Ask a question\nThank you! Our office will reply within [CONFIRM: 1–2] business days. Office hours: Mon & Wed 10:00 am–1:00 pm.`, "We'd love to meet your family and help you find the right program.", "visit");
  set("/parents", "Parents", "Resources for current CHESS families.\n\n[Calendar & Events](/parents/calendar)\n\n[Family Handbook](/parents/handbook)\n\n[Testing & Tutoring](/parents/testing)\n\n[Colorado Homeschool Law](/parents/colorado-homeschool-law)\n\n[Get Involved](/parents/get-involved)\n\n[Praxi Parent Portal](/parents/praxi)", "Current-family resources, calendars, handbook, and parent portal.");
  set("/parents/calendar", "Calendar & Events", source("/families/school-calendar"), "School calendar and upcoming CHESS events.", "calendar", { documentPath: old.get("/families/school-calendar")?.documentPath || "/documents/school-calendar.pdf" });
  set("/parents/handbook", "Family Handbook", merged([["/families/semester-details","Semester details"],["/families/dress-code","Dress code"],["/families/electronics-policy","Electronics policy"],["/families/text-alerts","Text alerts"]]));
  set("/parents/testing", "Testing & Tutoring", `${merged([["/families/testing","Testing"],["/families/tutoring-resources","Tutoring"]])}\n\n[Colorado Homeschool Law](/parents/colorado-homeschool-law)`);
  set("/parents/colorado-homeschool-law", "Colorado Homeschool Law", source("/families/homeschool-law"));
  set("/parents/get-involved", "Get Involved", source("/families/opportunities-to-serve"));
  set("/parents/praxi", "Praxi Parent Portal", `[Open the Praxi Parent Portal](${portal})\n\n[CONFIRM: whether faculty should use this parent portal or a separate staff portal. Contact the office for staff access.]`);
  set("/faq", "Frequently Asked Questions", "## Questions Parents Ask", "Plain answers for homeschool parents about CHESS: Independent School, K–12 Academy classes, the High School Diploma Program, cost, payment plans, and how to start.", "faq");
  for(const path of ["/new-page","/links-not-on-website"])set(path,"Legacy page — review needed","[CONFIRM: what this old URL held and whether it should redirect to the homepage.]","Legacy content pending school review.","content",{archived:true});
  const titles: Record<string,string> = {
    "/about":"About CHESS – Christian Education Since 1991","/about/beliefs":"Statement of Faith | CHESS","/about/our-people":"Faculty & Staff | CHESS",
    "/programs/independent-school":"Homeschool Independent School in Colorado | CHESS","/programs/academy":"K–12 Christian Homeschool Classes in Greeley | CHESS Academy",
    "/programs/academy/classes":"Class Schedule & Course Descriptions | CHESS Academy","/programs/diploma":"Homeschool High School Diploma Program, Colorado | CHESS",
    "/admissions/tuition":"Tuition & Fees 2026–2027 | CHESS Greeley","/admissions/apply":"How to Apply | CHESS Greeley","/admissions/visit":"Schedule a Visit | CHESS Greeley",
    "/parents/colorado-homeschool-law":"Colorado Homeschool Law Explained | CHESS","/contact":"Contact CHESS | 1300 9th St, Greeley, CO","/faq":"Frequently Asked Questions | CHESS Greeley",
  };
  const descriptions: Record<string,string> = {
    "/programs/independent-school":"Enroll as a private-school student while you homeschool. CHESS keeps your records and meets Colorado's attendance law. $125/year.",
    "/programs/academy":"Christ-centered core and enrichment classes on Tuesdays and Thursdays for homeschooled students, K–12, in Greeley, CO.",
    "/programs/diploma":"A four-year plan, private Christian school transcript, and graduation ceremony for homeschool high schoolers. Over 500 graduates.",
  };
  content.news = content.news.map((article: any) => {
    const originalSource = sourceNews.find(p=>p.path === article.path);
    let title = /^Comments?\s*\(/i.test(article.title) ? (article.path.split("/").pop() || "").replace(/-/g, " ").replace(/\b\w/g, (s:string)=>s.toUpperCase()) : article.title;
    if (originalSource?.markdown) title = originalSource.markdown.split("\n")[0].replace(/ — Colorado Heritage.*/, "");
    if (/^[a-z0-9]{20,}$/.test(article.path.split("/").pop())) {
      const firstHeading = article.markdown.match(/^#{1,4}\s+(.+)/m)?.[1];
      title = firstHeading || title;
    }
    let cleanSlug = slug(title.replace(/ — Colorado Heritage.*/, "")).replace(/womens-healt(?!h)/g, "womens-health");
    if (!cleanSlug || /^[a-z0-9]{20,}$/.test(cleanSlug)) cleanSlug = `archived-school-update-${article.date || "undated"}`;
    const path = `/news/${cleanSlug}`;
    redirects[article.path] = path;
    return { ...article, title: cleanCopy(title), path, markdown: cleanCopy(article.markdown), archived: article.archived || /^201[56]/.test(article.date) };
  });
  // Resolve rare same-title posts without "-1"/"copy" suffixes.
  const counts = new Map<string, number>();
  for (const a of content.news) counts.set(a.path, (counts.get(a.path) || 0) + 1);
  content.news = content.news.map((a: any) => counts.get(a.path)! > 1 ? { ...a, path: `${a.path}-${a.date || slug(a.markdown.slice(0,60))}` } : a);
  original.news.forEach((a:any,i:number)=>{ redirects[a.path]=content.news[i].path; });
  content.events = content.events.map((event: any) => {
    const recurrent = /chapel|pizza lunch|office closed|summer office hours|enrichment.acc?ademy.registration/i.test(event.title+" "+event.path);
    if (recurrent) redirects[event.path] = "/parents/calendar";
    const date = event.date || event.path.match(/\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//)?.slice(1).map((p:string)=>p.padStart(2,"0")).join("-");
    return { ...event, date, title: `${cleanCopy(event.title)}${date && !event.title.includes(date.slice(0,4)) ? ` — ${date}` : ""}`, archived: event.archived || /^201[56]/.test(date) || recurrent };
  });
  // Preserve redirects for all original Squarespace paths, resolving chains.
  for (let i=0;i<8;i++) for (const [key,value] of Object.entries(redirects)) {
    const [base,hash] = value.split("#");
    if (redirects[base] && redirects[base] !== value) redirects[key] = redirects[base] + (hash && !redirects[base].includes("#") ? `#${hash}` : "");
  }
  content.pages = [...old.values()].filter((p:any)=>!planRedirects[p.path]).map((p:any)=>({
    ...p, title: titles[p.path] || `${p.label} | CHESS`, description: descriptions[p.path] || p.description || `${p.label} — Colorado Heritage Education School System, Greeley, Colorado.`,
    markdown: fixLinks(p.markdown, redirects),
  }));
  content.staff = content.staff.map((p:any)=>({...p, bio:fixLinks(p.bio,redirects),role:cleanCopy(p.role),alt:cleanCopy(p.alt),faculty:!p.administrative || /Mathematics/i.test(p.role)}));
  const boardPeople = [
    {slug:"mr-nels-nelson",name:"Mr. Nels Nelson",role:"Board Chairman"},
    {slug:"mr-clyde-brown",name:"Mr. Clyde Brown",role:"Board Treasurer"},
    {slug:"mrs-teri-ong",name:"Mrs. Teri Ong",role:"Board Member"},
    {slug:"pastor-baxter-ong",name:"Pastor Baxter Ong",role:"Board Member"},
    {slug:"mr-seth-nelson",name:"Mr. Seth Nelson",role:"Board Member"},
    {slug:"mrs-mary-brown",name:"Mrs. Mary Brown",role:"Advisory Board Member"},
    {slug:"mrs-annie-nelson",name:"Mrs. Annie Nelson",role:"Advisory Board Secretary"},
  ];
  for(const board of boardPeople){
    const existing=content.staff.find((p:any)=>p.slug===board.slug);
    if(existing){existing.board=true;existing.boardRole=board.role;}
    else content.staff.push({...board,board:true,boardRole:board.role,faculty:false,administrative:false,photo:"",alt:board.name,bio:"[CONFIRM: board biography and photo.]",photoPositionX:50,photoPositionY:0});
  }
  content.news = content.news.map((p:any)=>({...p,markdown:fixLinks(p.markdown,redirects)}));
  content.events = content.events.map((p:any)=>({...p,markdown:fixLinks(p.markdown,redirects)}));
  content.documents = content.documents.map((doc:any)=>({...doc, url:documentManifest[doc.id.replace(/^https?:\/\/(?:www\.)?coloradoheritage\.org/i,"") as keyof typeof documentManifest] || doc.url, title:doc.title.replace(/\*/g,"")}));
  for(const [id,url] of Object.entries(documentManifest))if(url&&!content.documents.some((d:any)=>d.url===url))content.documents.push({id,title:id.split("/").pop()!.replace(/[-_]/g," ").replace(/\.pdf$/i,""),url});
  content.home = {
    path: "/", label: "A Christ-Centered Education, With Your Family at the Center",
    title: "Christian School & Homeschool Support in Greeley, CO | CHESS",
    metaDescription: "Colorado Heritage Education School System partners with homeschooling families: Independent School, K–12 Academy classes, and a diploma program since 1991.",
    description: "Since 1991, Colorado Heritage Education School System has partnered with homeschooling families in Greeley and across Colorado — private-school enrollment, K–12 classes, and a high school diploma program grounded in the truths of Scripture.",
    markdown: homeCopy(), kind:"home",
  };
  // The imported gallery is mostly artwork. Do not describe it as a classroom/family photo.
  content.homeImage ||= "";
  content.homeImageAlt ||= "[CONFIRM: upload an approved CHESS classroom or family photo.]";
  content.faqs = seededFaqs();
  content.announcements = [
    { id:"enrollment-example",enabled:false,title:"Enrollment open — school starts Aug 31",text:"[CONFIRM: school year and enrollment dates before enabling.]",expiresAt:"2026-09-01T00:00",buttonLabel:"How to Apply",url:"/admissions/apply" },
    { id:"choir-example",enabled:false,title:"Sign up for choir",text:"Come to choir on [CONFIRM: date]. Set expiration to the end of that day before enabling.",buttonLabel:"Contact the office",url:"/contact" },
  ];
  content.navigation = [
    {label:"About",path:"/about",children:["/about","/about/beliefs","/about/our-people","/about/testimonials"]},
    {label:"Programs",path:"/programs",children:["/programs","/programs/independent-school","/programs/academy","/programs/academy/classes","/programs/diploma"]},
    {label:"Admissions",path:"/admissions",children:["/admissions/apply","/admissions/visit","/admissions/tuition","/admissions/acceptance-policy"]},
    {label:"Parents",path:"/parents",children:["/parents/calendar","/parents/handbook","/parents/testing","/parents/get-involved","/parents/praxi"]},
    {label:"News",path:"/news",children:["/news","/gallery","/listen-learn"]},
    {label:"Contact",path:"/contact",children:[]},
  ];
  content.planVersion = SITE_PLAN_VERSION;
  content.redirects = redirects;
  return repairImportedContent(content);
}

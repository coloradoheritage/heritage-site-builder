type Content = Record<string, any>;
type CmsPage = Record<string, any>;

const DIPLOMA_QUOTE = `### From a Diploma Program family

> “We are so thankful for the Christian emphasis at Colorado Heritage and for the caliber of the teachers. We graduated our four students from your Diploma Program, and we can truly say that the experience from start to finish was a blessing! I highly recommend this school to homeschooling parents or to those who are thinking about homeschooling and who want their high school student(s) to receive a quality education which is firmly housed in traditional Biblical values and beliefs.”
>
> — Mary, Nunn CO

[Read more family stories](/about/testimonials)`;

function pageFor(content: Content, path: string): CmsPage | undefined {
  return (content.pages || []).find((page: CmsPage) => page.path === path);
}

function replacePage(content: Content, path: string, transform: (markdown: string) => string) {
  const page = pageFor(content, path);
  if (page && typeof page.markdown === "string") page.markdown = transform(page.markdown);
}

function addVisitBlock(page: CmsPage) {
  page.blocks ||= { root: { props: {} }, content: [] };
  if (!Array.isArray(page.blocks.content)) page.blocks.content = [];
  const blocks = page.blocks.content as Array<Record<string, any>>;
  if (!blocks.some((block) => block.type === "FamilyStepButton" && block.props?.title === "Come see CHESS for yourself")) {
    if (!blocks.some((block) => block.type === "LegacyMarkdown")) {
      blocks.unshift({
        type: "LegacyMarkdown",
        props: { id: `legacy-${page.path.replace(/[^a-z0-9]+/gi, "-")}`, markdown: page.markdown || "" },
      });
    }
    blocks.push({
      type: "FamilyStepButton",
      props: {
        id: `visit-${page.path.replace(/[^a-z0-9]+/gi, "-")}`,
        title: "Come see CHESS for yourself",
        richText: '<p>Schedule a visit to meet our school community, or call our office to ask questions.</p>',
        buttonLabel: "Schedule a Visit",
        href: "/admissions/visit",
        secondaryButtonLabel: "Call (970) 346-0099",
        secondaryHref: "tel:+19703460099",
      },
    });
  }
}

function removeImportArtifacts(markdown: string) {
  return markdown
    .replace(/\uFEFF/g, "")
    .replace(/^\s*!\s*$/gm, "")
    .replace(/^\s*(?:\\?\*\s*){2,}$/gm, "")
    .replace(/^[ \t]*\\+[ \t]*$/gm, "")
    .replace(/^(#{1,6})\s+\*\*(.*?)\*\*\s*$/gm, (_line, hashes: string, text: string) => `${hashes} ${text}`)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function applyChangeOrder(input: Content, version: number): Content {
  const content = structuredClone(input);

  // Remove duplicate headings while preserving the existing purpose, history, and foundation copy.
  replacePage(content, "/about", (source) => removeImportArtifacts(source)
    .replace(/^## Purpose\s*\n+Our Purpose\s*\n+### Our Purpose\s*$/m, "## Purpose")
    .replace(/^## History\s*\n+Our History\s*$/m, "## History")
    .replace(/^## Foundation\s*\n+Our Foundation\s*\n+### Our Foundation\s*$/m, "## Foundation")
    .replace(/^### (As Colorado Heritage continues to grow[^\n]*)\s*$/gm, "$1"));

  // Repair the imported dangling links; policy text not present in the source stays a visible confirmation item.
  replacePage(content, "/about/beliefs", (source) => {
    if (/^## Statement of Faith\s*$/m.test(source) && !/\]\(https?:\/\/(?:www\.)?coloradoheritage\.org\/statement-of-faith\)/i.test(source)) return source;
    const prefix = source.split(/\]\(https?:\/\/(?:www\.)?coloradoheritage\.org\/statement-of-faith\)/i)[0].trimEnd();
    return `${prefix}

## Statement of Faith

[CONFIRM: insert the approved CHESS Statement of Faith text or current document link.]

## Acceptance Policy

Read the current [Acceptance Policy](/admissions/acceptance-policy) for enrollment expectations.`;
  });

  replacePage(content, "/programs/independent-school", (source) => removeImportArtifacts(source)
    .replace(/^Our Independent School & How to Apply\/Re-Enroll\s*$/gmi, "")
    .replace(/^### our Independent School - How to apply\/re-enroll\s*$/gmi, "## How to Apply or Re-Enroll")
    .replace(/^### ALSO IMPORTANT\s*$/gmi, "## Also Important")
    .replace(/^### HOW TO APPLY TO THE COLORADO HERITAGE INDEPENDENT SCHOOL\s*$/gmi, "## How to Apply to the Colorado Heritage Independent School")
    .replace(/^## high school Diploma Program\\?\*\s*$/gmi, "## High School Diploma Program")
    .replace(/^## INDEPENDENT school\\?\*\s*$/gmi, "## Independent School")
    .replace(/^## K–12 Academy \(K–12 Academy\)\\?\*\s*$/gmi, "## K–12 Academy")
    .replace(/^Please see\s*$/gmi, "")
    .replace(/^# (Education is one of the greatest gifts[^\n]*)$/gm, "$1")
    .replace(/HSLDA is a non-profit advocacy organization that makes homeschooling possible by protecting homeschooling families and equipping them to provide the best educational experience for their children\./,
      "HSLDA is a nonprofit advocacy organization that supports homeschooling families and protects their freedom to homeschool.")
    .replace(/(You remain your child's primary teacher; CHESS provides private-school enrollment, classes, and accountability\.)/,
      (sentence) => source.includes("The CHESS Independent School is the private-school enrollment and record-keeping option")
        ? sentence
        : `${sentence}\n\nThe CHESS Independent School is the private-school enrollment and record-keeping option for families who teach their children at home.`));

  replacePage(content, "/programs/academy", (source) => removeImportArtifacts(source)
    .replace(/^### Important Information About Our Academy and how to apply\s*$/gmi, "## About Our Academy and How to Apply")
    .replace(/^### Colorado Heritage is a private Christian School\s*$/gmi, "## Colorado Heritage Is a Private Christian School")
    .replace(/^### VISION STATEMENT\s*$/gmi, "## Vision")
    .replace(/^### MISSION\s*$/gmi, "## Mission")
    .replace(/^### MOTTO\s*$/gmi, "## Motto")
    .replace(/^### Our Philosophy,\s*$/gmi, "## Our Philosophy, Statement of Faith, and Acceptance Policy")
    .replace(/^### statement of faith, and Acceptance Policy\s*$/gmi, "")
    .replace(/^### Are you a _new family_[^\n]*$/gmi, "## New Families: How to Apply")
    .replace(/^###\s*\*\*Testimonials\*\*\s*$/gmi, "## Testimonials"));

  replacePage(content, "/programs/academy/classes", (source) => removeImportArtifacts(source)
    .replace(/(?:T means Tuesday\. )*Tuesday \(T\) classes start September 1\./, "T means Tuesday. Tuesday (T) classes start September 1.")
    .replace(/(?:H means Thursday-only\. )*Thursday-only \(H\) classes start Thursday, September 3\./, "H means Thursday-only. Thursday-only (H) classes start Thursday, September 3.")
    .replace(/High school classes meet two days a week, Tuesday and Thursday \(T\/H\) - unless otherwise noted\./,
      "T/H means Tuesday and Thursday. High school classes meet both days unless otherwise noted.")
    .replace(/### Course Descriptions[\s\S]*?(?=\n\nNot a member of CHESS|$)/,
      `### Course Descriptions

- [Grade Group K–2](/documents/k-2-course-descriptions-26-27-for-website.pdf)
- [Grade Group 3–5](/documents/3-5-course-descriptions-26-27-for-website-wz33.pdf)
- [Grade Group 6–8](/documents/6-8-course-descriptions-26-27-for-website.pdf)
- [Grade Group 9–12](/documents/9-12coursedescriptions26-27forwebsite.pdf)`));

  replacePage(content, "/parents/testing", (source) => removeImportArtifacts(source)
    .replace(/^### group AND PRIVATE standardized Testing service\s*$/gmi, "## Group and Private Standardized Testing Service")
    .replace(/^### GROUP TESTING\s*$/gmi, "## Group Testing")
    .replace(/^### __ GROUP Testing Details\s*$/gmi, "### Group Testing Details")
    .replace(/^### FOR Private Testing\s*$/gmi, "## Private Testing")
    .replace(/^### FOR PERSONAL EVALUATIONS\s*$/gmi, "## Personal Evaluations")
    .replace(/^### PROFESSIONAL EVALUATOR\/tutoring Resource\\?\*\s*$/gmi, "## Professional Evaluator and Tutoring Resource")
    .replace(/^\[CHESS FAMILIES, PLEASE CLICK HERE FOR TESTING DATES\]\(\/parents\/testing\)\s*$/gmi, "")
    .replace(/\\\*/g, ""));

  replacePage(content, "/programs/diploma", (source) => {
    let markdown = removeImportArtifacts(source)
      .replace(/^Our High School Diploma Program & How to Apply\s*$/gmi, "")
      .replace(/^### High School Diploma Program\s*$/gmi, "## High School Diploma Program")
      .replace(/^### Please note\s*$/gmi, "### Important Information");

    const applySection = `If you are a **new** family seeking enrollment in our Diploma Program, you may apply or schedule a meeting to learn more. Transcripts are not necessary for an informational meeting but could be helpful.

If you are a **current** family seeking enrollment in our Diploma Program, please schedule a meeting.

Please read our [Statement of Faith](/about/beliefs#statement-of-faith) and [Acceptance Policy](/about/beliefs#acceptance-policy).

[Apply Now](https://app.praxischool.com/site_login.php?s=1300) [Schedule a Meeting to Learn More](/contact)`;
    markdown = markdown.replace(/If you are a \*\*new\*\* family seeking enrollment in our Diploma Program,[\s\S]*?(?=\n### \*\*Testimonials\*\*|\n### Testimonials|\n## Resources)/, applySection);

    const testimonialStart = markdown.search(/^### \*\*Testimonials\*\*|^### Testimonials/m);
    if (testimonialStart >= 0) {
      const resourcesStart = markdown.search(/^## Resources\b/m);
      const end = resourcesStart >= 0 ? resourcesStart : markdown.length;
      markdown = `${markdown.slice(0, testimonialStart).trimEnd()}\n\n${DIPLOMA_QUOTE}\n\n${markdown.slice(end).replace(/^## Resources[\s\S]*$/m, "").trim()}`;
    }
    // Empty secure/resource headings are not links and should not look like available family resources.
    const resourcesIndex = markdown.search(/^## Resources\b/m);
    if (resourcesIndex >= 0) {
      const tail = markdown.slice(resourcesIndex);
      if (!/\[[^\]]+\]\([^)]+\)|https?:\/\/|\/documents\//i.test(tail)) markdown = markdown.slice(0, resourcesIndex).trimEnd();
    }
    return removeImportArtifacts(markdown);
  });

  replacePage(content, "/admissions/apply", (source) => removeImportArtifacts(source)
    .replace(/(## Independent School\n)([\s\S]*?)(?=\n## |$)/, (_section, heading, body: string) =>
      heading + body.replace("[CONFIRM: New Family application portal/link and Returning Family application portal/link]",
        "[New Family Application](https://app.praxischool.com/site_login.php?s=1300) [Returning Family Re-Enrollment](https://app.praxischool.com/parent_login.php?s=1300)"))
    .replace(/^\[Ask the office about .* applications\]\(\/contact\?topic=application\)\s*$/gmi, ""));
  replacePage(content, "/admissions/apply", removeImportArtifacts);

  replacePage(content, "/parents/praxi", (source) => {
    if (/Praxi is CHESS’s online parent portal/i.test(source)) return source;
    return `${source.trim()}

Praxi is CHESS’s online parent portal for tuition payments, class registration, add/drop forms, and school records.`;
  });

  for (const path of ["/programs/independent-school", "/programs/academy", "/programs/academy/classes", "/programs/diploma", "/parents/testing"]) {
    replacePage(content, path, removeImportArtifacts);
  }

  for (const path of ["/parents/calendar", "/parents/get-involved", "/parents/praxi", "/donate", "/news"]) {
    const page = pageFor(content, path);
    if (page) addVisitBlock(page);
  }

  for (const page of content.pages || []) {
    if (typeof page.markdown === "string") {
      page.markdown = page.markdown
        .replace(/^### 2\\?\. You can Donate to the chess General Fund for Operating Expenses\s*$/gmi, "### CHESS General Fund for Operating Expenses")
        .replace(/^### 3\\?\. You can donate to our YEARLY Fall JOG-A-THON SCHOLARSHIP FUNDRAISER\s*$/gmi, "### Annual Fall Jog-a-Thon Scholarship Fundraiser")
        .replace(/^### How to Donate to CHESS with cash or a check\s*$/gmi, "### How to Donate to CHESS with Cash or a Check");
      // Keep existing file links tied to their immutable document ID, so replacing a PDF
      // updates every page rather than leaving copies pointing at the previous file.
      for (const doc of content.documents || []) {
        if (doc.id && doc.url && doc.id !== doc.url) {
          page.markdown = page.markdown.split(`](${doc.url})`).join(`](${doc.id})`);
        }
      }
      for (const block of page.blocks?.content || []) {
        if (block.type !== "LegacyMarkdown" || typeof block.props?.markdown !== "string") continue;
        for (const doc of content.documents || []) {
          if (doc.id && doc.url && doc.id !== doc.url) {
            block.props.markdown = block.props.markdown.split(`](${doc.url})`).join(`](${doc.id})`);
          }
        }
      }
    }
    if (page.path === "/new-page" || page.path === "/links-not-on-website") {
      page.archived = true;
      page.showInMenu = false;
    }
  }
  for (const group of content.navigation || []) {
    group.children = (group.children || []).filter((path: string) => !["/new-page", "/links-not-on-website"].includes(path));
  }
  for (const event of content.events || []) {
    if (/^201[67]/.test(String(event.date || ""))) event.archived = true;
  }

  content.planVersion = version;
  return content;
}

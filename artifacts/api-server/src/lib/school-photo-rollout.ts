import photos from "../data/school-photos.json";

/** School-supplied photography replaces unapproved decorative imports, once. */
export function applySchoolPhotos(input: Record<string, any>) {
  const content = structuredClone(input);
  const image = (filename: string) => {
    const p = photos.find(p => p.filename === filename);
    if (!p) throw new Error(`Missing approved school photo: ${filename}`);
    return `![${p.alt}](${p.url})`;
  };
  const stripImages = (text: string) => text.replace(/!\[[^\]]*\]\([^)]+\)/g, "").replace(/\n{3,}/g, "\n\n").trim();
  // Keep school portraits and logos. Remove legacy stock/AI/unknown article imagery,
  // while preserving every word and link in the existing editorial content.
  content.home.markdown = stripImages(content.home.markdown);
  for (const item of [...content.pages, ...content.news, ...content.events]) item.markdown = stripImages(item.markdown);
  const hero = photos.find(p => p.filename === "hero-graduation-041.jpg")!;
  content.homeImage = hero.url;
  content.homeImageAlt = hero.alt;
  const homeSections: [RegExp, string][] = [
    [/^(## Two ways to partner with CHESS)\s*$/m, "choir-nnn_6088.jpg"],
    [/^(## What makes CHESS different)\s*$/m, "plays-nnn_5834.jpg"],
    [/^(## A diploma graduate's story)\s*$/m, "graduation-sarahporterphotography2306.jpg"],
    [/^(## Who we are)\s*$/m, "choir-nnn_6141.jpg"],
    [/^(## Tuition & scholarships)\s*$/m, "graduation-sarahporterphotography2312.jpg"],
  ];
  for (const [heading, filename] of homeSections) content.home.markdown = content.home.markdown.replace(heading, `$1\n\n${image(filename)}\n`);
  // A real ceremony photo is now supplied; keep unconfirmed attribution hidden/editable.
  content.home.markdown = content.home.markdown.replace(" Graduate photo needed.", "");
  const mapping: Record<string, string> = {
    "/programs": "choir-nnn_6088.jpg",
    "/programs/independent-school": "classroom-chess-classroom-.jpg",
    "/programs/academy": "plays-nnn_5834.jpg",
    "/programs/academy/classes": "classroom-chess-classroom-.jpg",
    "/programs/diploma": "graduation-sarahporterphotography2306.jpg",
    "/about": "graduation-sarahporterphotography2312.jpg",
    "/about/beliefs": "choir-nnn_6141.jpg",
    "/about/testimonials": "graduation-sarahporterphotography2211.jpg",
    "/admissions": "choir-nnn_6083.jpg",
    "/admissions/apply": "graduation-sarahporterphotography2211.jpg",
    "/admissions/acceptance-policy": "choir-nnn_6092.jpg",
    "/admissions/tuition": "choir-nnn_6088.jpg",
    "/admissions/visit": "classroom-chess-classroom-.jpg",
    "/contact": "graduation-sarahporterphotography2211.jpg",
    "/parents": "literary-night-dsc_9501.jpg",
    "/parents/calendar": "literary-night-dsc_9501.jpg",
    "/parents/handbook": "plays-dsc_4269.jpg",
    "/parents/testing": "classroom-chess-classroom-.jpg",
    "/parents/colorado-homeschool-law": "classroom-chess-classroom-.jpg",
    "/parents/get-involved": "plays-nnn_5765.jpg",
    "/news": "literary-night-dsc_9501.jpg",
    "/listen-learn": "choir-nnn_6141.jpg",
    "/donate": "plays-dsc_4366.jpg",
    "/faq": "choir-nnn_6170.jpg",
  };
  for (const page of content.pages) {
    if (page.path === "/gallery") page.markdown = `## Life at CHESS\n\n${photos.map(p => image(p.filename)).join("\n\n")}`;
    else if (mapping[page.path]) page.markdown = `${image(mapping[page.path])}\n\n${page.markdown}`;
  }
  return content;
}

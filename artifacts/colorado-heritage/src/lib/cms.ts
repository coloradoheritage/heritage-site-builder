import { useEffect } from "react";
import { sitePages, legacyRouteAliases } from "../data/siteSitemap";
import type { CmsArticle, CmsPage, SiteContentState } from "@workspace/api-client-react";

export const PRAXI_PARENT_PORTAL = "https://app.praxischool.com/parent_login.php?s=1300";
export const STAFF_PORTAL = "https://app.praxischool.com/";
/** Login links from the old coloradoheritage.org site. The parent link is in the header, menu and footer; the staff link is footer only. Fixed in code (not page links), so the menu editor does not manage them. */
export const PORTAL_LINKS = [
  { key: "parent", label: "Payment/Account Portal", url: PRAXI_PARENT_PORTAL },
  { key: "staff", label: "Faculty/Staff Portal", url: STAFF_PORTAL },
] as const;
export const SITE_ORIGIN = "https://heritage-site-builder.replit.app";

export const publicAsset = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
export const publicPath = (path: string) => `${import.meta.env.BASE_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}` || "/";
export const mediaUrl = (path: string) => (!path ? "" : /^(https?:|data:|blob:)/.test(path) ? path : publicAsset(path));

/** Fixes known spelling mistakes in rendered copy without altering stored data. */
export function fixText(value: string): string {
  return (value || "").replace(/Accademy/g, "Academy").replace(/ACCADEMY/g, "ACADEMY").replace(/accademy/g, "academy");
}

let contentRedirects: Record<string, string> = {};
/** Saved CMS redirects (legacy path -> new path); applied before other aliases so links never hop twice. */
export function setContentRedirects(map?: Record<string, string>) { contentRedirects = map ?? {}; }

export function canonicalInternalPath(pathname: string): string {
  const normalized = pathname.replace(/^https?:\/\/(?:www\.)?coloradoheritage\.org/i, "").split("?")[0].replace(/\/+$/, "") || "/";
  if (contentRedirects[normalized]) {
    let target = contentRedirects[normalized];
    for (let i = 0; i < 5 && contentRedirects[target] && contentRedirects[target] !== target; i += 1) target = contentRedirects[target];
    return target;
  }
  if (legacyRouteAliases[normalized]) return legacyRouteAliases[normalized];
  const sourceMatch = sitePages.find((page) => page.sourcePath === normalized);
  if (sourceMatch) return sourceMatch.path;
  if (normalized === "/new-events") return "/events";
  if (normalized.startsWith("/new-events/")) return normalized.replace(/^\/new-events/, "/events");
  if (normalized === "/news/category" || normalized === "/news/tag") return "/news";
  return normalized;
}

export function articleHref(article: CmsArticle, kind: "news" | "events") {
  const path = canonicalInternalPath(article.path);
  if (path.startsWith(`/${kind}/`)) return path;
  return path.startsWith("/") ? path : `/${kind}/${path}`;
}

export function stripSourceTitle(markdown: string) {
  return (markdown || "").replace(/^[^\n]+ — Colorado Heritage\s*\n+/, "");
}

export function formatDate(date: string) {
  if (!date) return "";
  const parsed = new Date(date.length <= 10 ? `${date}T12:00:00` : date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/** A post visitors can see in lists: not archived and not an unpublished blog draft. */
export function isLivePost(article: CmsArticle) {
  return !article.archived && !article.draft;
}

export function sortArticles(list: CmsArticle[]) {
  return [...list].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

/** Splits the inside of a markdown image target `src "caption"` into its parts. */
export function splitImageTarget(target: string): { src: string; caption: string } {
  const match = target.match(/^(.*?)(?:\s+"([^"]*)")?\s*$/s);
  return { src: (match?.[1] ?? target).trim(), caption: (match?.[2] ?? "").trim() };
}

export function excerpt(markdown: string, length = 185) {
  const text = stripSourceTitle(markdown)
    .replace(/!\[[^\]]*\]\((?:[^)"]|"[^"]*")+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_`>]/g, "")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .find((part) => part.length > 55 && !/^(School year office hours|0items|o Independent|- )/.test(part));
  return text ? fixText(`${text.slice(0, length)}${text.length > length ? "…" : ""}`) : "";
}

export function pageMap(content: SiteContentState | undefined) {
  return new Map<string, CmsPage>((content?.pages ?? []).map((page) => [page.path, page]));
}

export function labelForPath(path: string, pages: Map<string, CmsPage>) {
  if (path === "/events") return "Calendar & Events";
  if (path === "/news") return "News & Blog";
  return fixText(pages.get(path)?.label ?? path);
}

let shareImage: string | null = null;
async function resolveShareImage() {
  if (shareImage) return shareImage;
  try {
    const res = await fetch(publicAsset("/images/social-share.jpg"), { method: "HEAD" });
    const type = res.headers.get("content-type") || "";
    shareImage = res.ok && type.startsWith("image") ? "/images/social-share.jpg" : "/images/chess-seal.png";
  } catch {
    shareImage = "/images/chess-seal.png";
  }
  return shareImage;
}

function setMetaTag(attr: "name" | "property", key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = value;
}

export function usePageMeta(title: string, description: string, path: string) {
  useEffect(() => {
    const cleanTitle = fixText(title);
    const cleanDescription = fixText(description).slice(0, 155);
    const url = `${SITE_ORIGIN}${publicPath(path)}`;
    document.title = cleanTitle;
    setMetaTag("name", "description", cleanDescription);
    setMetaTag("property", "og:title", cleanTitle);
    setMetaTag("property", "og:description", cleanDescription);
    setMetaTag("property", "og:url", url);
    setMetaTag("property", "og:type", "website");
    setMetaTag("property", "og:site_name", "Colorado Heritage Education School System");
    setMetaTag("name", "twitter:card", "summary_large_image");
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = url;
    let cancelled = false;
    resolveShareImage().then((image) => {
      if (cancelled) return;
      const abs = `${SITE_ORIGIN}${publicAsset(image)}`;
      setMetaTag("property", "og:image", abs);
      setMetaTag("name", "twitter:image", abs);
    });
    return () => { cancelled = true; };
  }, [title, description, path]);
}

/** Resize + compress an image file to a webp data URL. */
export async function compressImage(
  file: File,
  opts: { maxSize: number; targetBytes: number },
): Promise<{ dataUrl: string; bytes: number; width: number; height: number }> {
  // Some mobile file pickers and automated upload tools provide an empty MIME type.
  // The browser decoder and server re-encoder still validate the actual image bytes.
  if (!/^image\/(?:jpeg|png|webp)$/.test(file.type) && !/\.(?:jpe?g|png|webp)$/i.test(file.name)) {
    throw new Error("Please choose an image file (JPG, PNG, or WebP).");
  }
  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That image could not be read. Try a different file."));
      el.src = bitmapUrl;
    });
    const sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
    const scale = Math.min(1, opts.maxSize / Math.max(sw, sh));
    const width = Math.round(sw * scale);
    const height = Math.round(sh * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser could not process this image.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
    let quality = 0.86;
    let blob: Blob | null = null;
    for (let i = 0; i < 8; i += 1) {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
      if (!blob) throw new Error("Your browser could not create a WebP image.");
      if (blob.type !== "image/webp") throw new Error("This browser cannot save WebP images. Please try Chrome, Edge, or Firefox.");
      if (blob.size <= opts.targetBytes) break;
      quality -= 0.1;
      if (quality < 0.3) break;
    }
    if (!blob) throw new Error("Image compression failed.");
    if (blob.size > 2 * 1024 * 1024) throw new Error("The compressed image is still over 2 MB. Please choose a smaller photo.");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read the compressed image."));
      reader.readAsDataURL(blob as Blob);
    });
    return { dataUrl, bytes: blob.size, width, height };
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

/* ---------- CHESS v4 shared constants & helpers ---------- */

export type SiteContentExt = SiteContentState & { home?: CmsPage; homeImage?: string; homeImageAlt?: string };

export const OFFICE = {
  name: "Colorado Heritage Education School System",
  phone: "(970) 346-0099",
  tel: "tel:+19703460099",
  email: "office@coloradoheritage.org",
  street: "1300 9th Street",
  city: "Greeley, CO 80631",
};
export const MAP_EMBED = "https://www.google.com/maps?q=1300+9th+Street,+Greeley,+CO+80631&output=embed";
export const MAP_LINK = "https://www.google.com/maps/search/?api=1&query=1300+9th+Street+Greeley+CO+80631";
export const VISIT_PATH = "/admissions/visit";

/** Current America/Denver wall-clock time as YYYY-MM-DDTHH:mm (for admin status display only). */
export function denverNow(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export type AnnouncementStatus = "Off" | "Scheduled" | "Live" | "Expired";
export function announcementStatus(a: { enabled: boolean; startsAt?: string; expiresAt?: string }, now = denverNow()): AnnouncementStatus {
  if (!a.enabled) return "Off";
  if (a.expiresAt && now >= a.expiresAt) return "Expired";
  if (a.startsAt && now < a.startsAt) return "Scheduled";
  return "Live";
}

export const hasConfirm = (value?: string) => /\[CONFIRM/i.test(value || "");

export function plainText(markdown: string): string {
  return (markdown || "")
    .replace(/!\[[^\]]*\]\((?:[^)"]|"[^"]*")+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(\*|_)(.+?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Injects (or removes) a JSON-LD script in <head>; re-runs on every SPA navigation. */
export function useJsonLd(id: string, data: unknown) {
  const json = data ? JSON.stringify(data) : "";
  useEffect(() => {
    const selector = `script[data-jsonld="${id}"]`;
    let el = document.head.querySelector<HTMLScriptElement>(selector);
    if (!json) { el?.remove(); return; }
    if (!el) {
      el = document.createElement("script");
      el.type = "application/ld+json";
      el.dataset.jsonld = id;
      document.head.appendChild(el);
    }
    el.textContent = json;
    return () => { document.head.querySelector(selector)?.remove(); };
  }, [id, json]);
}

export function useRobots(noindex: boolean) {
  useEffect(() => {
    setMetaTag("name", "robots", noindex ? "noindex, follow" : "index, follow");
  }, [noindex]);
}

export const schoolJsonLd = {
  "@context": "https://schema.org",
  "@type": ["School", "EducationalOrganization"],
  name: OFFICE.name,
  alternateName: "CHESS",
  url: SITE_ORIGIN,
  logo: `${SITE_ORIGIN}/images/chess-seal.png`,
  telephone: "+1-970-346-0099",
  email: OFFICE.email,
  foundingDate: "1991",
  description: "A private Christian K–12 school partnering with homeschooling families in Greeley, Colorado since 1991.",
  educationalLevel: "Kindergarten through 12th grade (K–12)",
  address: { "@type": "PostalAddress", streetAddress: OFFICE.street, addressLocality: "Greeley", addressRegion: "CO", postalCode: "80631", addressCountry: "US" },
};

export function faqJsonLd(faqs: { question: string; answer: string }[]) {
  const clean = faqs.filter((f) => f.question.trim() && f.answer.trim() && !hasConfirm(f.question) && !hasConfirm(f.answer));
  if (!clean.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: clean.map((f) => ({ "@type": "Question", name: plainText(f.question), acceptedAnswer: { "@type": "Answer", text: plainText(f.answer) } })),
  };
}

export const slugifyHeading = (value: string) => plainText(value).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export type MdSection = { title: string; id: string; body: string };
/** Splits markdown on level-2 headings. Content before the first heading has an empty title. */
export function splitSections(markdown: string): MdSection[] {
  const out: MdSection[] = [];
  let current: MdSection = { title: "", id: "", body: "" };
  (markdown || "").replace(/\r/g, "").split("\n").forEach((line) => {
    const m = line.match(/^##\s+(.+?)\s*(?:\{#([a-z0-9-]+)\})?\s*$/i);
    if (m && !line.startsWith("###")) {
      if (current.title || current.body.trim()) out.push(current);
      current = { title: m[1], id: m[2] || slugifyHeading(m[1]), body: "" };
    } else current.body += `${line}\n`;
  });
  if (current.title || current.body.trim()) out.push(current);
  return out;
}

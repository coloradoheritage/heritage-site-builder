import { useEffect } from "react";
import { sitePages, legacyRouteAliases } from "../data/siteSitemap";
import type { CmsArticle, CmsPage, SiteContentState } from "@workspace/api-client-react";

export const PRAXI_PARENT_PORTAL = "https://app.praxischool.com/parent_login.php?s=1300";
export const SITE_ORIGIN = "https://heritage-site-builder.replit.app";

export const publicAsset = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
export const publicPath = (path: string) => `${import.meta.env.BASE_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}` || "/";
export const mediaUrl = (path: string) => (!path ? "" : /^(https?:|data:|blob:)/.test(path) ? path : publicAsset(path));

/** Fixes known spelling mistakes in rendered copy without altering stored data. */
export function fixText(value: string): string {
  return (value || "").replace(/Accademy/g, "Academy").replace(/ACCADEMY/g, "ACADEMY").replace(/accademy/g, "academy");
}

export function canonicalInternalPath(pathname: string): string {
  const normalized = pathname.replace(/^https?:\/\/(?:www\.)?coloradoheritage\.org/i, "").split("?")[0].replace(/\/+$/, "") || "/";
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

export function sortArticles(list: CmsArticle[]) {
  return [...list].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

export function excerpt(markdown: string, length = 185) {
  const text = stripSourceTitle(markdown)
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
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
    const cleanDescription = fixText(description);
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

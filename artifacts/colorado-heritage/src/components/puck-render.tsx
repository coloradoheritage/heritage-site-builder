import { Render, type Config, type Data } from "@puckeditor/core";
import sanitizeHtml from "sanitize-html";
import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { MarkdownContent, useResolvedHref } from "./markdown";
import { SiteImage } from "./site-image";
import { denverNow, mediaUrl } from "../lib/cms";
import { isValidMountainInput, toMountainInput } from "./puck-time";
import "./puck-content.css";

export type KnownBlock =
  | "LegacyMarkdown" | "PhotoWithText" | "FamilyStepButton" | "FaqItem" | "StaffCard"
  | "Testimonial" | "TuitionTable" | "VideoOrMap" | "Announcement";
export type PuckPayload = Data & { content: Array<{ type: KnownBlock; props: Record<string, unknown> }> };

function safeSiteHref(value: unknown): string {
  const href = typeof value === "string" ? value.trim() : "";
  return /^(\/(?!\/)|https?:\/\/|mailto:|tel:)/i.test(href) ? href : "";
}

function safeEmbedUrl(value: unknown): string {
  try {
    const url = new URL(String(value ?? ""));
    const youtube = ["youtube.com", "www.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(url.hostname) &&
      /^\/embed\/[A-Za-z0-9_-]+$/.test(url.pathname);
    const maps = ["google.com", "www.google.com", "maps.google.com"].includes(url.hostname) &&
      /^\/maps(?:\/embed)?\/?$/.test(url.pathname);
    return url.protocol === "https:" && (youtube || maps) ? url.href : "";
  } catch {
    return "";
  }
}

// Was Puck's built-in "richtext" field, but Puck's <Render> coerces a "richtext"
// value into a structured object — which turned our stored HTML strings into
// "[object Object]" (and made LegacyMarkdown fall back to its markdown mirror).
// Editing no longer happens inside Puck (we use our own SectionsEditor), so a
// plain string field is all <Render> needs: it passes richText through untouched.
const rich = { type: "textarea" } as const;
export const chessPuckConfig: Config = {
  components: {
    LegacyMarkdown: {
      label: "Existing page text",
      fields: { richText: rich },
      defaultProps: { markdown: "" },
      render: ({ markdown, originalMarkdown, richText }) => typeof richText === "string"
        ? <RichHtml value={richText} />
        : <MarkdownContent markdown={String(markdown ?? originalMarkdown ?? "")} />,
    },
    PhotoWithText: {
      label: "Photo with text",
      fields: {
        heading: { type: "text", label: "Heading" }, richText: rich,
        image: { type: "custom", label: "Photo, description & framing", render: () => <span>Use the photo picker in the editor.</span> },
        imageSide: { type: "select", label: "Photo position", options: [{ label: "Left", value: "left" }, { label: "Right", value: "right" }] },
      },
      defaultProps: { heading: "A closer look", richText: "<p>Add a few words about this photo.</p>", image: { url: "", alt: "", focalX: 50, focalY: 50 }, imageUrl: "", alt: "", imageSide: "left" },
      render: ({ heading, richText, image, imageUrl, alt, imageSide }) => {
        const photo = image && typeof image === "object" ? image as { url?: string; alt?: string; focalX?: number; focalY?: number } : null;
        const src = photo?.url || imageUrl;
        const description = photo?.alt || alt;
        return <section className={`puck-photo-text is-${imageSide}`}>
        {src && <SiteImage src={String(src)} alt={String(description ?? "")} loading="lazy" sizes="(min-width: 900px) 50vw, 100vw" style={{ objectPosition: `${photo?.focalX ?? 50}% ${photo?.focalY ?? 50}%` }} />}
        <div>{heading && <h2>{String(heading)}</h2>}<RichHtml value={String(richText ?? "")} /></div>
      </section>;
      },
    },
    FamilyStepButton: {
      label: "Family step",
      fields: {
        title: { type: "text", label: "Step title" },
        richText: rich,
        buttonLabel: { type: "text", label: "Button label" },
        href: { type: "text", label: "Link address" },
        secondaryButtonLabel: { type: "text", label: "Second button label (optional)" },
        secondaryHref: { type: "text", label: "Second button link (optional)" },
      },
      defaultProps: { title: "Your next step", richText: "<p>Tell families what to do next.</p>", buttonLabel: "Learn more", href: "/contact" },
      render: ({ title, richText, buttonLabel, href, secondaryButtonLabel, secondaryHref }) => {
        const secondLabel = String(secondaryButtonLabel ?? "").trim();
        const secondUrl = safeSiteHref(secondaryHref);
        return <section className="puck-family-step">
          <h2>{String(title ?? "")}</h2>
          <RichHtml value={String(richText ?? "")} />
          <div className="puck-family-step-actions">
            <a href={safeSiteHref(href) || "/contact"}>{String(buttonLabel || "Learn more")} <ArrowRight size={16} /></a>
            {secondLabel && secondUrl && <a href={secondUrl}>{secondLabel} <ArrowRight size={16} /></a>}
          </div>
        </section>;
      },
    },
    FaqItem: {
      label: "Question and answer",
      fields: { question: { type: "text", label: "Question" }, richText: rich },
      defaultProps: { question: "A question families ask", richText: "<p>Write a clear answer.</p>" },
      render: ({ question, richText }) => <details className="puck-faq"><summary>{String(question ?? "")}</summary><RichHtml value={String(richText ?? "")} /></details>,
    },
    StaffCard: {
      label: "Staff profile card",
      fields: { name: { type: "text", label: "Name" }, role: { type: "text", label: "Role" }, photo: { type: "custom", label: "Photo, description & framing", render: () => <span>Use the photo picker in the editor.</span> }, bio: rich },
      defaultProps: { name: "Staff member", role: "Faculty", photo: { url: "", alt: "", focalX: 50, focalY: 50 }, alt: "", bio: "<p>Add a short introduction.</p>" },
      render: ({ name, role, photo, alt, bio }) => {
        const details = photo && typeof photo === "object" ? photo as { url?: string; alt?: string; focalX?: number; focalY?: number } : null;
        const src = details?.url || photo;
        return <article className="puck-staff-card">{src && <SiteImage src={String(src)} alt={String(details?.alt || alt || "")} loading="lazy" sizes="260px" style={{ objectPosition: `${details?.focalX ?? 50}% ${details?.focalY ?? 50}%` }} />}<div><h2>{String(name ?? "")}</h2><p className="puck-kicker">{String(role ?? "")}</p><RichHtml value={String(bio ?? "")} /></div></article>;
      },
    },
    Testimonial: {
      label: "Family testimonial",
      fields: { quote: rich, attribution: { type: "text", label: "Family name or attribution" } },
      defaultProps: { quote: "<p>Share a family's experience at CHESS.</p>", attribution: "" },
      render: ({ quote, attribution }) => <blockquote className="puck-testimonial"><RichHtml value={String(quote ?? "")} />{attribution && <cite>{String(attribution)}</cite>}</blockquote>,
    },
    TuitionTable: {
      label: "Tuition information",
      fields: {
        heading: { type: "text", label: "Table title" },
        columns: { type: "array", label: "Column headings", min: 1, max: 4, arrayFields: { label: { type: "text", label: "Column heading" } }, defaultItemProps: { label: "Column" }, getItemSummary: (item, i) => item.label || `Column ${Number(i) + 1}` },
        rows: {
          type: "array", label: "Table rows", min: 1,
          arrayFields: {
            cell1: { type: "text", label: "Column 1 value" },
            cell2: { type: "text", label: "Column 2 value" },
            cell3: { type: "text", label: "Column 3 value" },
            cell4: { type: "text", label: "Column 4 value" },
          },
          defaultItemProps: { cell1: "", cell2: "", cell3: "", cell4: "" },
          getItemSummary: (item, i) => item.cell1 || `Row ${Number(i) + 1}`,
        },
      },
      defaultProps: {
        heading: "Tuition and fees",
        columns: [{ label: "Program" }, { label: "Tuition" }, { label: "Details" }],
        rows: [{ cell1: "Independent School", cell2: "Add current amount", cell3: "Annual tuition" }],
      },
      render: ({ heading, columns, rows }) => {
        const heads = Array.isArray(columns) ? columns.slice(0, 4) as { label?: string }[] : [];
        const values = Array.isArray(rows) ? rows as Record<string, string>[] : [];
        return <section className="puck-tuition"><div className="cb-table-wrap" role="region" aria-label={String(heading || "Tuition information")} tabIndex={0}>
          <table><caption>{String(heading ?? "Tuition and fees")}</caption>
            <thead><tr>{heads.map((column, i) => <th scope="col" key={i}>{column.label || `Column ${i + 1}`}</th>)}</tr></thead>
            <tbody>{values.map((row, r) => <tr key={r}>{heads.map((_column, c) => {
              const value = String(row[`cell${c + 1}`] ?? "");
              return c === 0 ? <th scope="row" key={c}>{value}</th> : <td key={c}>{value}</td>;
            })}</tr>)}</tbody>
          </table>
        </div></section>;
      },
    },
    VideoOrMap: {
      label: "Video or map",
      fields: { heading: { type: "text", label: "Heading" }, url: { type: "text", label: "Embed URL" }, description: { type: "text", label: "Description" } },
      defaultProps: { heading: "Visit CHESS", url: "", description: "" },
      render: ({ heading, url, description }) => {
        const safeUrl = safeEmbedUrl(url);
        return <section className="puck-embed"><h2>{String(heading ?? "")}</h2>{safeUrl && <iframe src={safeUrl} title={String(heading || "CHESS video or map")} loading="lazy" sandbox="allow-scripts allow-same-origin allow-presentation" referrerPolicy="strict-origin-when-cross-origin" allow="fullscreen; picture-in-picture" />}{description && <p>{String(description)}</p>}</section>;
      },
    },
    Announcement: {
      label: "Announcement",
      fields: {
        title: { type: "text", label: "Title" },
        enabled: {
          type: "custom",
          label: "Announcement",
          render: ({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) =>
            <label className="puck-announcement-toggle"><input type="checkbox" checked={value !== false} onChange={(event) => onChange(event.target.checked)} /> Show announcement</label>,
        },
        richText: rich, startsAt: { type: "text", label: "Starts (Colorado local time)" }, expiresAt: { type: "text", label: "Expires (Colorado local time)" },
      },
      defaultProps: { title: "School update", enabled: true, richText: "<p>Share a time-sensitive update.</p>", startsAt: "", expiresAt: "" },
      render: ({ title, enabled, richText, startsAt, expiresAt }) => {
        const now = denverNow();
        const start = toMountainInput(startsAt);
        const end = toMountainInput(expiresAt);
        const invalid = (startsAt && (!start || !isValidMountainInput(start))) || (expiresAt && (!end || !isValidMountainInput(end)));
        if (enabled === false || invalid || (start && end && end <= start) || (start && now < start) || (end && now >= end)) return <></>;
        return <aside className="puck-announcement"><strong>{String(title ?? "")}</strong><RichHtml value={String(richText ?? "")} /></aside>;
      },
    },
  },
};

function RichHtml({ value }: { value: string }) {
  const resolve = useResolvedHref();
  const clean = useMemo(() => sanitizeHtml(value, {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "a", "blockquote", "span", "img", "table", "thead", "tbody", "tr", "th", "td", "hr", "code", "pre"],
    allowedAttributes: { a: ["href", "target", "rel"], span: ["style"], p: ["style"], h1: ["style"], h2: ["style"], h3: ["style"], h4: ["style"], h5: ["style"], h6: ["style"], img: ["src", "alt", "title", "loading"], th: ["scope", "colspan", "rowspan"], td: ["colspan", "rowspan"] },
    allowedStyles: {
      span: { color: [/^#(?:1A365D|D4AF37|2D3748)$/i], "text-align": [/^(left|center|right)$/] },
      p: { color: [/^#(?:1A365D|D4AF37|2D3748)$/i], "text-align": [/^(left|center|right)$/] },
      h1: { color: [/^#(?:1A365D|D4AF37|2D3748)$/i], "text-align": [/^(left|center|right)$/] },
      h2: { color: [/^#(?:1A365D|D4AF37|2D3748)$/i], "text-align": [/^(left|center|right)$/] },
      h3: { color: [/^#(?:1A365D|D4AF37|2D3748)$/i], "text-align": [/^(left|center|right)$/] },
      h4: { color: [/^#(?:1A365D|D4AF37|2D3748)$/i], "text-align": [/^(left|center|right)$/] },
      h5: { color: [/^#(?:1A365D|D4AF37|2D3748)$/i], "text-align": [/^(left|center|right)$/] },
      h6: { color: [/^#(?:1A365D|D4AF37|2D3748)$/i], "text-align": [/^(left|center|right)$/] },
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
  }), [value]);
  // A photo caption is stored as the image title; show it under the photo (nothing when empty).
  const captioned = clean.replace(/<img\b([^>]*?)\stitle=(["'])(.*?)\2([^>]*)>/gi, (_match, before: string, _quote: string, title: string, after: string) =>
    title.trim() ? `<span class="chess-figure"><img${before}${after}><span class="chess-caption">${title}</span></span>` : `<img${before}${after}>`);
  const resolved = captioned.replace(/\shref=(["'])(.*?)\1/gi, (_match, quote: string, href: string) => ` href=${quote}${resolve(href)}${quote}`);
  return <div className="chess-prose" dangerouslySetInnerHTML={{ __html: resolved }} />;
}

export function blocksFromLegacy(markdown: string): PuckPayload {
  return { root: { props: {} }, content: [{ type: "LegacyMarkdown", props: { id: "legacy-original", markdown } }], zones: {} } as PuckPayload;
}
export function asPuckPayload(value: unknown, markdown: string): PuckPayload {
  if (value && typeof value === "object" && Array.isArray((value as PuckPayload).content)) return value as PuckPayload;
  return blocksFromLegacy(markdown);
}
export function PuckBlockRenderer({ blocks, legacyMarkdown }: { blocks?: unknown; legacyMarkdown?: string }) {
  if (!blocks || typeof blocks !== "object" || !Array.isArray((blocks as PuckPayload).content)) return null;
  const payload = blocks as PuckPayload;
  // A LegacyMarkdown block renders its own richText when it has one. Only a block
  // WITHOUT richText falls back to the shared page markdown, and only the first such
  // block does — so a stray empty section can never re-render the whole page body a
  // second time underneath the real content.
  let legacyFallbackUsed = false;
  const known = payload.content.filter((block) => Object.prototype.hasOwnProperty.call(chessPuckConfig.components, block.type)).map((block) => {
    if (block.type !== "LegacyMarkdown" || typeof legacyMarkdown !== "string") return block;
    if (typeof block.props.richText === "string") return block;
    if (legacyFallbackUsed) return { ...block, props: { ...block.props, markdown: "" } };
    legacyFallbackUsed = true;
    return { ...block, props: { ...block.props, markdown: legacyMarkdown } };
  });
  if (!known.length) return null;
  return <div className="chess-puck-content"><Render config={chessPuckConfig} data={{ ...payload, content: known }} /></div>;
}
export function PuckAdditionalRenderer({ blocks }: { blocks?: unknown }) {
  if (!blocks || typeof blocks !== "object" || !Array.isArray((blocks as PuckPayload).content)) return null;
  const payload = blocks as PuckPayload;
  const additions = payload.content.filter((block) => block.type !== "LegacyMarkdown" && Object.prototype.hasOwnProperty.call(chessPuckConfig.components, block.type));
  return additions.length ? <div className="chess-puck-content"><Render config={chessPuckConfig} data={{ ...payload, content: additions }} /></div> : null;
}

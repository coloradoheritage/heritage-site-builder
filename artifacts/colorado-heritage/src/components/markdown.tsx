import { createContext, useContext, type ReactNode } from "react";
import { Link } from "wouter";
import type { CmsDocument } from "@workspace/api-client-react";
import { canonicalInternalPath, fixText, mediaUrl, slugifyHeading } from "../lib/cms";
import { cleanFilenameCaptions } from "../../directory-helpers.mjs";
import { Button, Confirm } from "./brand";
import { SiteImage } from "./site-image";

/** Documents keyed by their original (immutable) link; url holds the current editable destination. */
export const DocumentsContext = createContext<CmsDocument[]>([]);
export function resolveDocument(href: string, docs: CmsDocument[]): string {
  if (!href) return href;
  const clean = href.trim();
  const hit = docs.find((doc) => doc.id === clean)
    ?? docs.find((doc) => doc.id === clean.replace(/^https?:\/\/(?:www\.)?coloradoheritage\.org/i, ""));
  return hit?.url || href;
}
export function useDocUrl() {
  const docs = useContext(DocumentsContext);
  return (href?: string) => (href ? mediaUrl(resolveDocument(href, docs)) : undefined);
}

export function resolveHref(href: string): string {
  if (!href || href.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(href)) return href;
  try {
    const parsed = new URL(href, "https://www.coloradoheritage.org");
    const isOfficial = parsed.hostname === "coloradoheritage.org" || parsed.hostname.endsWith(".coloradoheritage.org");
    if (!isOfficial) return href;
    return `${canonicalInternalPath(parsed.pathname)}${parsed.search}${parsed.hash}`;
  } catch {
    return href;
  }
}

/** Final href for any markdown link: document table first, then canonical internal paths. */
export function useResolvedHref() {
  const docs = useContext(DocumentsContext);
  return (href: string) => {
    const docHref = resolveDocument(href, docs);
    return docHref !== href ? mediaUrl(docHref) : resolveHref(href);
  };
}

function MdLink({ href, children, testId }: { href: string; children: ReactNode; testId: string }) {
  const resolved = useResolvedHref()(href);
  if (/^https?:\/\//i.test(resolved)) return <a href={resolved} target="_blank" rel="noopener noreferrer" data-testid={testId}>{children}</a>;
  if (/^(mailto:|tel:|#)/i.test(resolved) || /\.(pdf|xlsx?|docx?)(\?|#|$)/i.test(resolved)) return <a href={resolved} data-testid={testId}>{children}</a>;
  return <Link href={resolved} data-testid={testId}>{children}</Link>;
}

const INLINE = /\[(CONFIRM[^\]]*)\]|(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|(\*\*|__)(.+?)\5|(?<![\w/])(\*|_)(?!\s)(.+?)\7(?![\w])|`([^`]+)`/g;
const ESCAPED_MARKDOWN = /\\([\\`*_{}\[\]()#+\-.!|>])/g;

export function inlineMarkdown(value: string, keyPrefix = "i"): ReactNode[] {
  const tokens: ReactNode[] = [];
  const source = value.replace(ESCAPED_MARKDOWN, (_match, character: string) => `\uE000${character.codePointAt(0)}\uE001`);
  const restoreEscaped = (text: string) => text.replace(/\uE000(\d+)\uE001/g, (_match, code: string) => String.fromCodePoint(Number(code)));
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  const re = new RegExp(INLINE.source, "g");
  while ((match = re.exec(source))) {
    if (match.index > cursor) tokens.push(restoreEscaped(source.slice(cursor, match.index)));
    const key = `${keyPrefix}-${index++}`;
    if (match[1] !== undefined) tokens.push(<Confirm key={key}>[{match[1]}]</Confirm>);
    else if (match[4] !== undefined) {
      if (match[2]) {
        const image = <SiteImage key={key} src={resolveHref(match[4])} alt={match[3] || "Colorado Heritage Education School System"} loading="lazy" />;
        const caption = match[0].match(/\s"([^"]*)"\)$/)?.[1]?.trim();
        tokens.push(caption ? <span key={key} className="chess-figure">{image}<span className="chess-caption">{caption}</span></span> : image);
      }
      else if (!match[3].trim()) { /* drop empty imported links like "[\n](" */ }
      else tokens.push(<MdLink key={key} href={match[4]} testId={`link-content-${keyPrefix}-${index}`}>{inlineMarkdown(match[3], `${key}-t`)}</MdLink>);
    } else if (match[5]) tokens.push(<strong key={key}>{inlineMarkdown(match[6], `${key}-b`)}</strong>);
    else if (match[7]) tokens.push(<em key={key}>{match[8]}</em>);
    else if (match[9]) tokens.push(<code key={key}>{match[9]}</code>);
    cursor = re.lastIndex;
  }
  if (cursor < source.length) tokens.push(restoreEscaped(source.slice(cursor)));
  return tokens;
}

const NOISE = /^(School year office hours begin|o Independent School|o See our latest Blog|0items|\$0|Click below to view the Colorado Heritage You Tube Channel|0 Likes|Share|1 hour|\\?- general questions|Book|reCAPTCHA|Show All|Comments \(\d+\))$/i;
const LINK_ONLY = /^\s*(?:\[[^\]]+\]\([^)\s]+\)[\s·|•,]*){1,3}$/;

function cells(row: string) {
  return row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

function ButtonRow({ text, k }: { text: string; k: string }) {
  const resolve = useResolvedHref();
  const links = [...text.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)];
  return <p className="cb-btn-row">{links.map((m, i) => (
    <Button key={`${k}-${i}`} href={resolve(m[2])} variant={i === 0 ? "primary" : "secondary"} arrow={i === 0} testId={`button-content-${slugifyHeading(m[1])}`}>{fixText(m[1])}</Button>
  ))}</p>;
}

export function MarkdownContent({ markdown, className = "chess-prose" }: { markdown: string; className?: string }) {
  const lines = fixText(cleanFilenameCaptions(markdown || "")).replace(/\r/g, "").split("\n").filter((l) => !NOISE.test(l.trim()) && l.trim() !== "!");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let table: string[] = [];
  let quote: string[] = [];
  let key = 0;
  const flushParagraph = () => {
    const text = paragraph.join(" ").trim();
    paragraph = [];
    if (!text) return;
    const k = `p-${key++}`;
    if (LINK_ONLY.test(text) && !/→/.test(text) && !/^\s*!\[/.test(text)) { blocks.push(<ButtonRow key={k} text={text} k={k} />); return; }
    blocks.push(<p key={k}>{inlineMarkdown(text, k)}</p>);
  };
  const flushList = () => {
    if (!list) return;
    const k = `l-${key++}`;
    const items = list.items.map((item, i) => <li key={i}>{inlineMarkdown(item, `${k}-${i}`)}</li>);
    blocks.push(list.ordered ? <ol key={k}>{items}</ol> : <ul key={k}>{items}</ul>);
    list = null;
  };
  const flushTable = () => {
    if (!table.length) return;
    const k = `t-${key++}`;
    const rows = table.map(cells);
    const hasHead = rows.length > 1 && rows[1].every((c) => /^:?-{2,}:?$/.test(c));
    const head = hasHead ? rows[0] : null;
    const body = hasHead ? rows.slice(2) : rows;
    blocks.push(<div className="cb-table-wrap" key={k} role="region" aria-label="Table" tabIndex={0}><table>
      {head && <thead><tr>{head.map((c, i) => <th scope="col" key={i}>{inlineMarkdown(c, `${k}-h${i}`)}</th>)}</tr></thead>}
      <tbody>{body.map((r, ri) => <tr key={ri}>{r.map((c, ci) => ci === 0 && !head ? <th scope="row" key={ci}>{inlineMarkdown(c, `${k}-${ri}-${ci}`)}</th> : <td key={ci}>{inlineMarkdown(c, `${k}-${ri}-${ci}`)}</td>)}</tr>)}</tbody>
    </table></div>);
    table = [];
  };
  const flushQuote = () => {
    if (!quote.length) return;
    const k = `q-${key++}`;
    blocks.push(<blockquote key={k}>{quote.join("\n").split(/\n\s*\n/).map((p, i) => <p key={i}>{inlineMarkdown(p.replace(/\n/g, " "), `${k}-${i}`)}</p>)}</blockquote>);
    quote = [];
  };
  const flushAll = () => { flushParagraph(); flushList(); flushTable(); flushQuote(); };

  lines.forEach((raw) => {
    const line = raw.trim();
    if (!line) { flushParagraph(); flushList(); flushTable(); if (quote.length) quote.push(""); return; }
    if (line.startsWith("|")) { flushParagraph(); flushList(); flushQuote(); table.push(line); return; }
    if (table.length) flushTable();
    if (line.startsWith(">")) { flushParagraph(); flushList(); quote.push(line.replace(/^>\s?/, "")); return; }
    if (quote.length) flushQuote();
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) { flushAll(); blocks.push(<hr className="cb-rule" key={`hr-${key++}`} />); return; }
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*(?:\{#([a-z0-9-]+)\})?$/i);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      const id = heading[3] || slugifyHeading(heading[2]);
      const children = inlineMarkdown(heading[2], `h-${key}`);
      const k = `h-${key++}`;
      blocks.push(level <= 2 ? <h2 id={id} key={k}>{children}</h2> : level === 3 ? <h3 id={id} key={k}>{children}</h3> : <h4 id={id} key={k}>{children}</h4>);
      return;
    }
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const ordered = line.match(/^\d+[.)]\s+(.*)$/);
    if (bullet || ordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      if (list && list.ordered !== isOrdered) flushList();
      if (!list) list = { ordered: isOrdered, items: [] };
      list.items.push((bullet ?? ordered)![1]);
      return;
    }
    if (/^!\[/.test(line) || /^\[!\[/.test(line)) {
      flushAll();
      blocks.push(<p className="chess-inline-image" key={`img-${key++}`}>{inlineMarkdown(line, `image-${key}`)}</p>);
      return;
    }
    if (/^_{1}[^_].+[^_]_{1}$/.test(line) && !/\]\(/.test(line)) {
      flushAll();
      blocks.push(<blockquote key={`quote-${key++}`}><p>{inlineMarkdown(line.replace(/^_+|_+$/g, ""), `quote-${key}`)}</p></blockquote>);
      return;
    }
    if (list) {
      // A continuation line of the last list item.
      if (/^\s{2,}/.test(raw)) { list.items[list.items.length - 1] += ` ${line}`; return; }
      flushList();
    }
    paragraph.push(line);
  });
  flushAll();
  return <div className={className}>{blocks}</div>;
}

import { inlineMarkdown } from "./markdown";
import { Reveal } from "./brand";

export type Testimonial = { quote: string[]; attribution?: string };
export type QuoteChunk = { type: "md"; text: string } | { type: "quotes"; items: Testimonial[] };

const ATTR = /^\s*[—–]|^\s*-{1,2}\s+\S/;

/** Splits markdown into prose + runs of "> quote" followed by optional "— Name" attribution lines. */
export function splitTestimonials(body: string): QuoteChunk[] {
  const lines = body.replace(/\r/g, "").split("\n");
  const out: QuoteChunk[] = [];
  let md: string[] = [];
  let run: Testimonial[] = [];
  const flushMd = () => { if (md.join("").trim()) out.push({ type: "md", text: md.join("\n") }); md = []; };
  const flushRun = () => { if (run.length) out.push({ type: "quotes", items: run }); run = []; };
  let i = 0;
  while (i < lines.length) {
    if (/^\s*>/.test(lines[i])) {
      const q: string[] = [];
      while (i < lines.length && (/^\s*>/.test(lines[i]))) { q.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
      let j = i; while (j < lines.length && !lines[j].trim()) j++;
      let attribution: string | undefined;
      if (j < lines.length && ATTR.test(lines[j]) && lines[j].length < 160) { attribution = lines[j].trim().replace(/^[—–-]+\s*/, ""); i = j + 1; }
      if (!run.length) flushMd();
      run.push({ quote: q.join("\n").split(/\n\s*\n/).map((p) => p.replace(/\n/g, " ").trim()).filter(Boolean), attribution });
      continue;
    }
    if (run.length && !lines[i].trim()) { i++; continue; }
    flushRun(); md.push(lines[i]); i++;
  }
  flushRun(); flushMd();
  return out;
}

export function QuoteCards({ items }: { items: Testimonial[] }) {
  return <ul className={`cb-quote-grid ${items.length === 1 ? "is-single" : ""}`} data-testid="testimonial-cards">
    {items.map((t, i) => <Reveal as="li" key={i} delay={i * 70}>
      <figure className="cb-quote-card" data-testid={`testimonial-card-${i}`}>
        <span className="cb-quote-mark" aria-hidden="true">&ldquo;</span>
        <blockquote>{t.quote.map((p, k) => <p key={k}>{inlineMarkdown(p, `tq-${i}-${k}`)}</p>)}</blockquote>
        {t.attribution && <figcaption>{inlineMarkdown(t.attribution, `ta-${i}`)}</figcaption>}
      </figure>
    </Reveal>)}
  </ul>;
}

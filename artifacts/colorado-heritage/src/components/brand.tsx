import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "wouter";
import { ArrowRightIcon, ArrowUpRightIcon } from "@heroicons/react/24/outline";
import { publicAsset } from "../lib/cms";

type Variant = "primary" | "secondary" | "tertiary";

/** The one shared CHESS button. Primary = navy fill (white fill when onDark). Secondary = outline. Tertiary = text link. Never gold. */
export function Button({
  href, variant = "primary", onDark = false, children, arrow = false, testId, onClick, type = "button", disabled, className = "",
}: {
  href?: string; variant?: Variant; onDark?: boolean; children: ReactNode; arrow?: boolean; testId?: string;
  onClick?: () => void; type?: "button" | "submit"; disabled?: boolean; className?: string;
}) {
  const cls = `cb-btn cb-btn-${variant}${onDark ? " cb-on-dark" : ""} ${className}`.trim();
  const external = href ? /^https?:\/\//i.test(href) : false;
  const inner = <>
    <span>{children}</span>
    {external ? <ArrowUpRightIcon className="cb-btn-icon" aria-hidden="true" /> : arrow ? <ArrowRightIcon className="cb-btn-icon" aria-hidden="true" /> : null}
  </>;
  if (!href) return <button type={type} className={cls} onClick={onClick} disabled={disabled} data-testid={testId}>{inner}</button>;
  if (external) return <a className={cls} href={href} target="_blank" rel="noopener noreferrer" data-testid={testId} onClick={onClick}>{inner}<span className="sr-only"> (opens in a new tab)</span></a>;
  if (/^(tel:|mailto:|#)/i.test(href) || /\.(pdf|xlsx?|docx?)(\?|$)/i.test(href)) return <a className={cls} href={href} data-testid={testId} onClick={onClick}>{inner}</a>;
  return <Link className={cls} href={href} data-testid={testId} onClick={onClick}>{inner}</Link>;
}

/** "Learn more →" style link used on cards. */
export function MoreLink({ href, children = "Learn more", testId }: { href: string; children?: ReactNode; testId?: string }) {
  if (/^https?:\/\//i.test(href)) return <a className="cb-more" href={href} target="_blank" rel="noopener noreferrer" data-testid={testId}>{children} <span aria-hidden="true">→</span></a>;
  return <Link className="cb-more" href={href} data-testid={testId}>{children} <span aria-hidden="true">→</span></Link>;
}

export function Tagline({ onDark = false, className = "" }: { onDark?: boolean; className?: string }) {
  return <p className={`cb-tagline ${onDark ? "is-dark" : ""} ${className}`.trim()}>&ldquo;Pursuing the Knowledge of God.&rdquo;</p>;
}

/** Horizontal lockup: official emblem (unaltered) + wordmark. Wordmark goes white on navy. */
export function Logo({ onDark = true, compact = false }: { onDark?: boolean; compact?: boolean }) {
  return <span className={`cb-logo ${onDark ? "is-dark" : ""} ${compact ? "is-compact" : ""}`}>
    <span className="cb-logo-emblem"><img src={publicAsset("/images/chess-seal.png")} alt="" width={60} height={60} /></span>
    <span className="cb-logo-word"><strong>Colorado Heritage</strong><small>Education School System</small></span>
  </span>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="cb-eyebrow">{children}</span>;
}

/** Fade-up on first view. No-ops when the visitor prefers reduced motion. */
export function Reveal({ children, as: Tag = "div", className = "", delay = 0 }: { children: ReactNode; as?: "div" | "section" | "li" | "article"; className?: string; delay?: number }) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) { el.classList.add("is-in"); return; }
    const io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { el.classList.add("is-in"); io.disconnect(); } }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <Tag ref={ref as never} className={`cb-reveal ${className}`.trim()} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>{children}</Tag>;
}

/** A gold [CONFIRM] placeholder chip so the office can see what still needs filling in. */
export function Confirm({ children }: { children: ReactNode }) {
  return <mark className="cb-confirm" title="Placeholder for the CHESS office to confirm">{children}</mark>;
}

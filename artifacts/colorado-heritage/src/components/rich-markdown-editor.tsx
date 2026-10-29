import { useEffect, useRef, useState } from "react";
import { marked } from "marked";
import { AlignCenter, AlignLeft, AlignRight, Bold, Check, Heading2, Italic, Link2, List, ListOrdered, Redo, Underline, Undo } from "lucide-react";
import type { CmsPage } from "@workspace/api-client-react";

function markdownToEditorHtml(markdown: string): string {
  const rendered = marked.parse(markdown || "", { async: false });
  if (typeof rendered !== "string") return "";
  const parsed = new DOMParser().parseFromString(rendered, "text/html");
  parsed.querySelectorAll("script,style,iframe,object,embed,form").forEach((element) => element.remove());
  parsed.body.querySelectorAll("*").forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || name === "style" || name === "srcdoc") {
        element.removeAttribute(attribute.name);
      } else if ((name === "href" || name === "src") && /^\s*(javascript|vbscript|data):/i.test(attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    }
    if (element.tagName === "A" && element.getAttribute("target") === "_blank") {
      element.setAttribute("rel", "noopener noreferrer");
    }
  });
  return parsed.body.innerHTML;
}

function markdownText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/([`*_{}\[\]()#+\-.!|>])/g, "\\$1");
}

function inlineHtmlToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return markdownText(node.textContent ?? "");
  if (!(node instanceof HTMLElement)) return "";
  const children = Array.from(node.childNodes).map(inlineHtmlToMarkdown).join("");
  if (node.tagName === "BR") return "\n";
  if (node.tagName === "A") {
    const href = (node.getAttribute("href") ?? "").replace(/"/g, "&quot;");
    return node.getAttribute("target") === "_blank"
      ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${children}</a>`
      : `[${children}](${node.getAttribute("href") ?? ""})`;
  }
  if (node.tagName === "IMG") return `![${markdownText(node.getAttribute("alt") ?? "")}](${node.getAttribute("src") ?? ""})`;
  if (node.tagName === "STRONG" || node.tagName === "B") return `**${children}**`;
  if (node.tagName === "EM" || node.tagName === "I") return `_${children}_`;
  if (node.tagName === "U") return `<u>${children}</u>`;
  if (node.tagName === "CODE") return `\`${children}\``;
  return children;
}

function listHtmlToMarkdown(list: HTMLElement, depth = 0): string {
  const ordered = list.tagName === "OL";
  const indent = "  ".repeat(depth);
  return Array.from(list.children).filter((child) => child.tagName === "LI").map((item, index) => {
    const nested = Array.from(item.children).filter((child) => child.tagName === "UL" || child.tagName === "OL");
    const text = Array.from(item.childNodes)
      .filter((child) => !(child instanceof HTMLElement && (child.tagName === "UL" || child.tagName === "OL")))
      .map(inlineHtmlToMarkdown).join("").trim();
    const prefix = ordered ? `${index + 1}.` : "-";
    return `${indent}${prefix} ${text}${nested.length ? `\n${nested.map((child) => listHtmlToMarkdown(child as HTMLElement, depth + 1)).join("\n")}` : ""}`;
  }).join("\n");
}

function tableHtmlToMarkdown(table: HTMLElement): string {
  const rows = Array.from(table.querySelectorAll("tr")).map((row) =>
    Array.from(row.children).map((cell) => inlineHtmlToMarkdown(cell).replace(/\|/g, "\\|").trim()),
  ).filter((row) => row.length);
  if (!rows.length) return "";
  const header = rows[0];
  const separator = header.map(() => "---");
  return [header, separator, ...rows.slice(1)].map((row) => `| ${row.join(" | ")} |`).join("\n");
}

function editorHtmlToMarkdown(editor: HTMLElement): string {
  const blocks = Array.from(editor.childNodes).map((node): string => {
    if (node.nodeType === Node.TEXT_NODE) return markdownText(node.textContent ?? "").trim();
    if (!(node instanceof HTMLElement)) return "";
    const tag = node.tagName;
    if (/^H[1-6]$/.test(tag)) {
      const content = Array.from(node.childNodes).map(inlineHtmlToMarkdown).join("").trim();
      const align = node.style.textAlign || node.getAttribute("align");
      return align && ["center", "right"].includes(align) ? `<${tag.toLowerCase()} align="${align}">${content}</${tag.toLowerCase()}>` : `## ${content}`;
    }
    if (tag === "UL" || tag === "OL") return listHtmlToMarkdown(node);
    if (tag === "BLOCKQUOTE") return Array.from(node.childNodes).map(inlineHtmlToMarkdown).join("").trim().split("\n").map((line) => `> ${line}`).join("\n");
    if (tag === "TABLE") return tableHtmlToMarkdown(node);
    if (tag === "HR") return "---";
    if (tag === "PRE") return `\`\`\`\n${node.textContent ?? ""}\n\`\`\``;
    if (tag === "P" || tag === "DIV") {
      const content = Array.from(node.childNodes).map(inlineHtmlToMarkdown).join("").trim();
      const align = node.style.textAlign || node.getAttribute("align");
      return align && ["center", "right"].includes(align) ? `<p align="${align}">${content}</p>` : content;
    }
    return inlineHtmlToMarkdown(node).trim();
  }).filter(Boolean);
  return blocks.join("\n\n").trim();
}

export function VisualBodyEditor({ markdown, onMarkdown, pages = [], onDone, testId = "visual-page-editor", ariaLabel = "Page text" }: {
  markdown: string; onMarkdown: (value: string) => void; pages?: CmsPage[]; onDone?: () => void; testId?: string; ariaLabel?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastValueRef = useRef("");
  const forceRenderRef = useRef(true);
  const [sourceMode, setSourceMode] = useState(false);
  const [linkFormOpen, setLinkFormOpen] = useState(false);
  const [linkType, setLinkType] = useState<"page" | "outside">("page");
  const [linkPage, setLinkPage] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [openNewTab, setOpenNewTab] = useState(false);
  const [linkError, setLinkError] = useState("");
  const selectionRef = useRef<Range | null>(null);

  useEffect(() => {
    if (sourceMode || !editorRef.current) return;
    if (forceRenderRef.current || markdown !== lastValueRef.current) {
      editorRef.current.innerHTML = markdownToEditorHtml(markdown);
      lastValueRef.current = markdown;
      forceRenderRef.current = false;
    }
  }, [markdown, sourceMode]);

  const sync = () => {
    if (!editorRef.current) return;
    const next = editorHtmlToMarkdown(editorRef.current);
    lastValueRef.current = next;
    onMarkdown(next);
  };
  const format = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    sync();
  };
  const addLink = () => {
    const selection = window.getSelection();
    selectionRef.current = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    setLinkError("");
    setLinkFormOpen((open) => !open);
  };
  const applyLink = () => {
    const input = linkType === "page" ? linkPage : linkUrl.trim();
    if (!input) {
      setLinkError(linkType === "page" ? "Choose a site page." : "Enter a web address.");
      return;
    }
    if (/^\s*(javascript|vbscript|data):/i.test(input) || input.startsWith("//") || (/^[a-z][a-z\d+.-]*:/i.test(input) && !/^(https?:|mailto:|tel:)/i.test(input))) {
      setLinkError("Use a site page, website address, email address, or phone number.");
      return;
    }
    const href = /^(https?:|mailto:|tel:|\/|#)/i.test(input) ? input : `https://${input}`;
    const editor = editorRef.current;
    if (!editor) return;
    const selectedRange = selectionRef.current;
    editor.focus();
    const selection = window.getSelection();
    if (selection && selectionRef.current) {
      selection.removeAllRanges();
      selection.addRange(selectionRef.current);
    }
    document.execCommand("createLink", false, href);
    if (openNewTab) {
      const startNode = selectedRange?.startContainer;
      const parent = startNode instanceof Element ? startNode : startNode?.parentElement;
      const anchor = parent?.closest<HTMLAnchorElement>("a") ??
        Array.from(editor.querySelectorAll<HTMLAnchorElement>("a")).find((candidate) => candidate.getAttribute("href") === href);
      anchor?.setAttribute("target", "_blank");
      anchor?.setAttribute("rel", "noopener noreferrer");
    }
    sync();
    setLinkFormOpen(false);
    setLinkPage("");
    setLinkUrl("");
  };
  const toggleSource = () => {
    if (sourceMode) {
      forceRenderRef.current = true;
      setSourceMode(false);
    } else {
      sync();
      setSourceMode(true);
    }
  };

  return <div className="cms-rich-editor">
    <div className="cms-rich-toolbar" role="toolbar" aria-label="Text formatting">
      {!sourceMode ? <>
        <span>Format</span>
        <button type="button" title="Bold" aria-label="Bold" data-testid="format-bold" onMouseDown={(event) => event.preventDefault()} onClick={() => format("bold")}><Bold size={16} /></button>
        <button type="button" title="Italic" aria-label="Italic" data-testid="format-italic" onMouseDown={(event) => event.preventDefault()} onClick={() => format("italic")}><Italic size={16} /></button>
        <button type="button" title="Underline" aria-label="Underline" data-testid="format-underline" onMouseDown={(event) => event.preventDefault()} onClick={() => format("underline")}><Underline size={16} /></button>
        <span className="cms-rich-divider" />
        <button type="button" title="Section heading" aria-label="Section heading" data-testid="format-heading" onMouseDown={(event) => event.preventDefault()} onClick={() => format("formatBlock", "h2")}><Heading2 size={16} /></button>
        <button type="button" title="Bulleted list" aria-label="Bulleted list" data-testid="format-bullets" onMouseDown={(event) => event.preventDefault()} onClick={() => format("insertUnorderedList")}><List size={16} /></button>
        <button type="button" title="Numbered list" aria-label="Numbered list" data-testid="format-numbered-list" onMouseDown={(event) => event.preventDefault()} onClick={() => format("insertOrderedList")}><ListOrdered size={16} /></button>
        <span className="cms-rich-divider" />
        <button type="button" title="Align left" aria-label="Align left" data-testid="format-align-left" onMouseDown={(event) => event.preventDefault()} onClick={() => format("justifyLeft")}><AlignLeft size={16} /></button>
        <button type="button" title="Align center" aria-label="Align center" data-testid="format-align-center" onMouseDown={(event) => event.preventDefault()} onClick={() => format("justifyCenter")}><AlignCenter size={16} /></button>
        <button type="button" title="Align right" aria-label="Align right" data-testid="format-align-right" onMouseDown={(event) => event.preventDefault()} onClick={() => format("justifyRight")}><AlignRight size={16} /></button>
        <span className="cms-rich-divider" />
        <button type="button" title="Add a link" aria-label="Add a link" data-testid="format-link" onMouseDown={(event) => event.preventDefault()} onClick={addLink}><Link2 size={16} /></button>
        <button type="button" title="Undo" aria-label="Undo" data-testid="format-undo" onMouseDown={(event) => event.preventDefault()} onClick={() => format("undo")}><Undo size={16} /></button>
        <button type="button" title="Redo" aria-label="Redo" data-testid="format-redo" onMouseDown={(event) => event.preventDefault()} onClick={() => format("redo")}><Redo size={16} /></button>
        <span className="cms-rich-note">Select words, then choose a format.</span>
      </> : <span className="cms-rich-note">Advanced source is for technical editors. Most people can leave it closed.</span>}
      <button type="button" className="cms-rich-source-toggle" aria-expanded={sourceMode} aria-controls="advanced-page-source" onClick={toggleSource} data-testid="toggle-advanced-source">{sourceMode ? "Visual editor" : "Advanced source"}</button>
    </div>
    {linkFormOpen && <div className="cms-rich-link-form" role="group" aria-label="Add a link" data-testid="rich-link-form">
      <div className="cms-rich-link-kind" role="group" aria-label="Link type">
        <button type="button" className={linkType === "page" ? "is-selected" : ""} aria-pressed={linkType === "page"} onClick={() => { setLinkType("page"); setLinkError(""); }} data-testid="link-type-page">CHESS page</button>
        <button type="button" className={linkType === "outside" ? "is-selected" : ""} aria-pressed={linkType === "outside"} onClick={() => { setLinkType("outside"); setLinkError(""); }} data-testid="link-type-outside">Outside website</button>
      </div>
      {linkType === "page"
        ? <label>Choose a site page<select value={linkPage} onChange={(event) => setLinkPage(event.target.value)} data-testid="select-link-page"><option value="">Choose a page…</option>{pages.map((page) => <option key={page.path} value={page.path}>{page.label || page.title || page.path}</option>)}</select></label>
        : <label>Web address<input type="url" value={linkUrl} placeholder="https://example.org" onChange={(event) => setLinkUrl(event.target.value)} data-testid="input-link-url" /></label>}
      <label className="cms-check"><input type="checkbox" checked={openNewTab} onChange={(event) => setOpenNewTab(event.target.checked)} data-testid="check-link-new-tab" /> Open in new tab</label>
      {linkError && <span className="cms-rich-link-error" role="alert">{linkError}</span>}
      <div className="cms-rich-link-actions">
        <button type="button" className="cms-btn" onClick={() => setLinkFormOpen(false)} data-testid="button-cancel-link">Cancel</button>
        <button type="button" className="cms-btn cms-btn-primary" onClick={applyLink} data-testid="button-apply-link">Add link</button>
      </div>
    </div>}
    {sourceMode
      ? <textarea id="advanced-page-source" className="cms-rich-source" aria-label="Advanced page source" data-testid={testId} value={markdown} spellCheck={false} onChange={(event) => { lastValueRef.current = event.target.value; onMarkdown(event.target.value); }} />
      : <div ref={editorRef} className="cms-rich-content" contentEditable suppressContentEditableWarning role="textbox" aria-label={ariaLabel} aria-multiline="true" data-testid={testId} onInput={sync} />}
    <div className="cms-rich-footer">
      <span>{sourceMode ? "Changes here are shown in the visual editor when you switch back." : "Click in the page and type. Select text to format it."}</span>
      {onDone && <button type="button" className="cms-btn" onClick={onDone}><Check size={13} /> Done editing</button>}
    </div>
  </div>;
}

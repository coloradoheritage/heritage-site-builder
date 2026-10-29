import { useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Bold,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Eye,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  PanelRightClose,
  Redo2,
  Save,
  Undo2,
} from "lucide-react";

const startingCopy =
  "## First steps to get started\n\n1. Choose your program: Independent School, K–12 Academy, or High School Diploma Program.\n2. Schedule a visit and placement assessment.\n3. Submit your application.\n\n[Download the application](https://coloradoheritage.org/documents/application.pdf)";

const startingHtml = `<h2>First steps to get started</h2><ol><li>Choose your program: Independent School, K–12 Academy, or High School Diploma Program.</li><li>Schedule a visit and placement assessment.</li><li>Submit your application.</li></ol><p><a href="https://coloradoheritage.org/documents/application.pdf">Download the application</a></p>`;

function markdownToHtml(value: string) {
  const escaped = value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = escaped.split("\n");
  const output: string[] = [];
  let list: "ol" | "ul" | null = null;
  const closeList = () => {
    if (list) output.push(`</${list}>`);
    list = null;
  };
  lines.forEach((line) => {
    const ordered = line.match(/^\s*\d+\.\s+(.*)$/);
    const unordered = line.match(/^\s*[-*]\s+(.*)$/);
    const item = ordered || unordered;
    if (item) {
      const nextList = ordered ? "ol" : "ul";
      if (list !== nextList) {
        closeList();
        list = nextList;
        output.push(`<${list}>`);
      }
      output.push(`<li>${item[1]}</li>`);
      return;
    }
    closeList();
    if (!line.trim()) return;
    if (line.startsWith("### ")) output.push(`<h3>${line.slice(4)}</h3>`);
    else if (line.startsWith("## ")) output.push(`<h2>${line.slice(3)}</h2>`);
    else if (line.startsWith("# ")) output.push(`<h2>${line.slice(2)}</h2>`);
    else {
      const linked = line.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');
      output.push(`<p>${linked.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</p>`);
    }
  });
  closeList();
  return output.join("");
}

function htmlToMarkdown(value: string) {
  const documentBody = new DOMParser().parseFromString(value, "text/html").body;
  const render = (node: ChildNode): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (!(node instanceof HTMLElement)) return "";
    if (node.tagName === "OL" || node.tagName === "UL") {
      return Array.from(node.children)
        .map((item, index) => `${node.tagName === "OL" ? `${index + 1}.` : "-"} ${Array.from(item.childNodes).map(render).join("")}\n`)
        .join("");
    }
    const content = Array.from(node.childNodes).map(render).join("");
    if (node.tagName === "H2" || node.tagName === "H3") return `## ${content}\n\n`;
    if (node.tagName === "P") return `${content}\n\n`;
    if (node.tagName === "LI") return `- ${content}\n`;
    if (node.tagName === "A") return `[${content}](${node.getAttribute("href") ?? ""})`;
    if (node.tagName === "STRONG" || node.tagName === "B") return `**${content}**`;
    if (node.tagName === "EM" || node.tagName === "I") return `_${content}_`;
    return content;
  };
  return Array.from(documentBody.childNodes).map(render).join("").trim();
}

export function Simple() {
  const [title, setTitle] = useState("How to Apply");
  const [summary, setSummary] = useState("A clear path to finding the right program for your family.");
  const [body, setBody] = useState(startingHtml);
  const [source, setSource] = useState(startingCopy);
  const [sourceMode, setSourceMode] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [saved, setSaved] = useState(true);
  const bodyRef = useRef<HTMLDivElement>(null);

  const runFormat = (command: string, value?: string) => {
    bodyRef.current?.focus();
    document.execCommand(command, false, value);
    if (bodyRef.current) setBody(bodyRef.current.innerHTML);
    setSaved(false);
  };

  const enterSource = () => {
    const plain = bodyRef.current?.innerHTML ?? body;
    setBody(plain);
    setSource(htmlToMarkdown(plain));
    setSourceMode(true);
  };

  const leaveSource = () => {
    setBody(markdownToHtml(source));
    setSourceMode(false);
    setSaved(false);
  };

  const save = () => {
    setSaved(true);
  };

  return (
    <main className="ch-simple">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap');
        .ch-simple, .ch-simple * { box-sizing: border-box; }
        .ch-simple {
          --ink: #243b3a; --muted: #72817c; --paper: #fbfaf6; --canvas: #f1f2ec;
          --line: #e3e6dc; --forest: #255b4e; --forest-dark: #1c493f; --sun: #e6c879;
          min-height: 100dvh; background: var(--canvas); color: var(--ink);
          font: 14px/1.5 'DM Sans', sans-serif; padding-bottom: 36px;
        }
        .ch-simple button, .ch-simple input, .ch-simple textarea { font: inherit; }
        .ch-head {
          height: 68px; display:flex; align-items:center; justify-content:space-between; gap:16px;
          padding: 0 clamp(18px, 4vw, 52px); background:#fffefa; border-bottom:1px solid var(--line);
        }
        .ch-brand, .ch-head-actions, .ch-brand-name, .ch-status, .ch-btn, .ch-crumbs { display:flex; align-items:center; }
        .ch-brand { gap:14px; min-width:0; }
        .ch-back { width:34px; height:34px; display:grid; place-items:center; color:#52635e; background:#f5f5ef; border:1px solid var(--line); border-radius:9px; cursor:pointer; }
        .ch-brand-mark { width:34px; height:34px; display:grid; place-items:center; background:var(--forest); color:#fff9e9; border-radius:10px; font:500 19px 'Newsreader',serif; }
        .ch-brand-name { gap:8px; font-weight:600; font-size:13px; white-space:nowrap; }
        .ch-brand-name span { width:1px; height:18px; background:var(--line); }
        .ch-head-actions { gap:10px; }
        .ch-status { color:var(--muted); gap:7px; font-size:12px; padding-right:6px; white-space:nowrap; }
        .ch-status-dot { width:7px; height:7px; border-radius:50%; background:#5e9a72; }
        .ch-status-dot.unsaved { background:#c99543; }
        .ch-btn { justify-content:center; gap:8px; border:1px solid #d9ded4; background:#fffefa; color:var(--ink); padding:9px 14px; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; transition:transform .16s, background .16s; }
        .ch-btn:hover { transform:translateY(-1px); background:#f8f8f2; }
        .ch-btn.primary { background:var(--forest); color:#fff; border-color:var(--forest); }
        .ch-btn.primary:hover { background:var(--forest-dark); }
        .ch-btn:focus-visible, .ch-back:focus-visible { outline:3px solid #d3b65f; outline-offset:2px; }
        .ch-crumbs { max-width:1200px; margin:0 auto; padding:22px 24px 4px; gap:9px; color:#83908a; font-size:12px; }
        .ch-crumbs b { color:#48645b; font-weight:600; }
        .ch-main { max-width:1200px; margin:0 auto; padding:13px 24px 0; }
        .ch-title-row { display:flex; justify-content:space-between; align-items:flex-end; gap:24px; margin:0 0 23px; }
        .ch-title-row h1 { margin:0 0 4px; font:400 clamp(29px,4vw,39px)/1.15 'Newsreader', Georgia,serif; letter-spacing:-.025em; color:#243d38; }
        .ch-title-row p { margin:0; color:#73817b; font-size:13px; }
        .ch-more { width:36px; height:36px; display:grid; place-items:center; border:1px solid var(--line); border-radius:8px; color:#60716b; background:#fffefa; cursor:pointer; }
        .ch-workspace { display:grid; grid-template-columns:minmax(0,1fr) 252px; gap:18px; align-items:start; }
        .ch-editor-card, .ch-side-card { background:#fffefa; border:1px solid #e0e4da; border-radius:12px; box-shadow:0 7px 24px rgba(45,66,57,.035); }
        .ch-card-top { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 19px; border-bottom:1px solid #eceee7; }
        .ch-card-top-title { display:flex; align-items:center; gap:9px; color:#314a42; font-weight:700; font-size:13px; }
        .ch-card-top-title i { display:block; width:8px; height:8px; border-radius:50%; background:#79a58b; box-shadow:0 0 0 4px #eff5ed; }
        .ch-view-toggle { display:flex; gap:3px; padding:3px; background:#f3f4ef; border-radius:8px; }
        .ch-view-toggle button { border:0; padding:6px 10px; background:transparent; color:#72807a; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; }
        .ch-view-toggle button.active { background:#fff; color:var(--forest); box-shadow:0 1px 4px #233d391c; }
        .ch-doc { margin:20px; border:1px solid #ecece4; border-radius:9px; background:#fff; overflow:hidden; }
        .ch-doc-label { display:flex; justify-content:space-between; padding:13px 20px 0; color:#9aa39d; text-transform:uppercase; letter-spacing:.09em; font-size:9px; font-weight:700; }
        .ch-field-title { display:block; width:100%; border:0; outline:0; padding:12px 20px 4px; color:#253e38; font:400 34px/1.18 'Newsreader', Georgia,serif !important; letter-spacing:-.025em; background:transparent; }
        .ch-field-title:focus, .ch-summary:focus { background:#fffdf5; box-shadow:inset 0 -1px #d5b95f; }
        .ch-summary { display:block; resize:vertical; width:calc(100% - 40px); margin:0 20px 15px; padding:5px 0 12px; border:0; border-bottom:1px solid #f0f0ea; outline:0; color:#75817b; font-size:14px; line-height:1.55; background:transparent; }
        .ch-toolbar { display:flex; align-items:center; gap:2px; border-top:1px solid #edeee8; border-bottom:1px solid #edeee8; padding:7px 12px; background:#fbfbf8; }
        .ch-tool { display:grid; place-items:center; width:31px; height:30px; border:0; border-radius:6px; background:transparent; color:#53645e; cursor:pointer; }
        .ch-tool:hover { background:#ecefe8; color:var(--forest); }
        .ch-tool-divider { height:19px; width:1px; margin:0 7px; background:#e1e5dc; }
        .ch-tool-label { padding:0 10px 0 3px; font-size:11px; color:#76827d; }
        .ch-editor-body { min-height:228px; padding:18px 22px 24px; outline:none; color:#394b45; font-size:14px; line-height:1.75; }
        .ch-editor-body:focus { background:#fffefa; }
        .ch-editor-body h2 { margin:0 0 10px; color:#2b4940; font:500 23px/1.25 'Newsreader', Georgia,serif; }
        .ch-editor-body h3 { font:500 19px 'Newsreader', Georgia,serif; }
        .ch-editor-body p { margin:10px 0; }
        .ch-editor-body ol, .ch-editor-body ul { padding-left:22px; margin:8px 0 17px; }
        .ch-editor-body ol { list-style:decimal; }
        .ch-editor-body ul { list-style:disc; }
        .ch-editor-body li { padding:3px 0 3px 3px; }
        .ch-editor-body a { color:#266253; text-decoration:underline; text-underline-offset:3px; }
        .ch-source { display:block; resize:vertical; width:100%; min-height:320px; border:0; padding:18px 22px; outline:0; background:#fbfbf8; color:#38564d; font:13px/1.7 ui-monospace, SFMono-Regular, Menlo, monospace; }
        .ch-source-tip { display:flex; align-items:center; gap:8px; margin:0 20px 15px; padding:9px 11px; border-radius:7px; color:#67786f; background:#f1f5ef; font-size:11px; }
        .ch-source-tip svg { color:#638572; flex:none; }
        .ch-card-foot { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:11px 20px; background:#fbfbf8; border-top:1px solid #edeee8; color:#8a9790; font-size:11px; }
        .ch-card-foot button { padding:0; color:#3a6959; border:0; background:transparent; font-size:11px; font-weight:700; cursor:pointer; }
        .ch-side { display:grid; gap:12px; }
        .ch-side-card { padding:17px; }
        .ch-side-heading { display:flex; justify-content:space-between; align-items:center; color:#314941; font-size:13px; font-weight:700; }
        .ch-side-heading svg { color:#82918a; }
        .ch-publish-state { display:flex; align-items:flex-start; gap:10px; margin:15px 0 14px; padding:12px; background:#f3f6f0; border:1px solid #e7ede3; border-radius:8px; }
        .ch-state-icon { display:grid; place-items:center; width:26px; height:26px; flex:none; border-radius:50%; background:#dcebdd; color:#39704d; }
        .ch-publish-state strong { display:block; font-size:12px; color:#3b5948; }
        .ch-publish-state small { display:block; margin-top:2px; color:#7b8b80; font-size:10px; line-height:1.45; }
        .ch-side-action { width:100%; }
        .ch-publish-note { margin:9px 0 0; color:#89948d; font-size:10px; line-height:1.5; }
        .ch-divider { height:1px; background:#edf0e9; margin:14px 0; }
        .ch-meta-row { display:flex; justify-content:space-between; gap:8px; color:#7e8b84; font-size:11px; margin:10px 0; }
        .ch-meta-row strong { color:#475d53; font-weight:600; text-align:right; }
        .ch-help { display:flex; align-items:flex-start; gap:10px; color:#718078; font-size:11px; line-height:1.55; }
        .ch-help svg { flex:none; color:#7b9a85; margin-top:1px; }
        .ch-preview-page { padding:24px 23px 28px; }
        .ch-preview-page .ch-field-title { padding:12px 0 6px; font-size:37px !important; }
        .ch-preview-page .ch-summary { width:100%; margin:0; border:0; padding:3px 0 17px; }
        .ch-preview-page .ch-editor-body { padding:17px 0 8px; }
        .ch-preview-page .ch-doc { margin:18px 0 0; border:0; }
        .ch-preview-page .ch-doc-label, .ch-preview-page .ch-toolbar { display:none; }
        .ch-preview-page .ch-editor-body { min-height:200px; }
        .ch-toast { position:fixed; bottom:20px; left:50%; transform:translateX(-50%); padding:10px 15px; border-radius:8px; background:#254f43; color:#fff; font-size:12px; box-shadow:0 8px 24px #173e3033; animation:ch-in .2s ease-out; }
        @keyframes ch-in { from { opacity:0; transform:translate(-50%,8px) } to { opacity:1; transform:translate(-50%,0) } }
        @media (max-width: 800px) {
          .ch-head { height:auto; min-height:64px; padding:12px 16px; }
          .ch-brand-name { display:none; }
          .ch-status { display:none; }
          .ch-workspace { grid-template-columns:1fr; }
          .ch-side { grid-template-columns:1fr 1fr; }
        }
        @media (max-width: 560px) {
          .ch-head { gap:8px; }
          .ch-head-actions { gap:6px; }
          .ch-head-actions .ch-btn { padding:8px 10px; font-size:12px; }
          .ch-head-actions .ch-btn svg { display:none; }
          .ch-crumbs { padding:17px 17px 4px; }
          .ch-main { padding:12px 14px 0; }
          .ch-title-row { margin-bottom:16px; }
          .ch-title-row h1 { font-size:32px; }
          .ch-card-top { padding:12px; }
          .ch-doc { margin:12px; }
          .ch-doc-label { padding-left:14px; padding-right:14px; }
          .ch-field-title { font-size:29px; padding-left:14px; padding-right:14px; }
          .ch-summary { width:calc(100% - 28px); margin-left:14px; margin-right:14px; }
          .ch-toolbar { padding:6px 8px; }
          .ch-tool { width:28px; }
          .ch-tool-divider { margin:0 3px; }
          .ch-tool-label { display:none; }
          .ch-editor-body { padding:15px 15px 20px; }
          .ch-card-foot { padding:10px 13px; }
          .ch-side { grid-template-columns:1fr; }
          .ch-view-toggle button { padding:6px 7px; }
        }
      `}</style>

      <header className="ch-head">
        <div className="ch-brand">
          <button className="ch-back" aria-label="Back to pages" onClick={() => setPreviewMode(false)}><ArrowLeft size={17} /></button>
          <div className="ch-brand-mark" aria-hidden="true">C</div>
          <div className="ch-brand-name">Colorado Heritage<span />Website editor</div>
        </div>
        <div className="ch-head-actions">
          <div className="ch-status"><i className={`ch-status-dot${saved ? "" : " unsaved"}`} />{saved ? "Saved · live on website" : "Unsaved changes"}</div>
          <button className="ch-btn" onClick={() => setPreviewMode(!previewMode)}><Eye size={15} />{previewMode ? "Edit page" : "Preview"}</button>
          <button className="ch-btn primary" onClick={save}><Save size={15} />Save content</button>
        </div>
      </header>

      <div className="ch-crumbs"><span>Pages</span><span>/</span><b>How to Apply</b></div>
      <section className="ch-main">
        <div className="ch-title-row">
          <div><h1>{previewMode ? "Page preview" : "Edit page"}</h1><p>Make changes here, then save to update the page visitors see.</p></div>
        </div>

        <div className="ch-workspace">
          <section className="ch-editor-card">
            <div className="ch-card-top">
              <div className="ch-card-top-title"><i />{previewMode ? "Visitor view" : "Page content"}</div>
              <div className="ch-view-toggle" aria-label="Editor mode">
                <button className={!sourceMode ? "active" : ""} onClick={() => sourceMode && leaveSource()}>Visual editor</button>
                <button className={sourceMode ? "active" : ""} onClick={() => !sourceMode && enterSource()}>Source</button>
              </div>
            </div>

            <div className={`ch-doc${previewMode ? " ch-preview-page" : ""}`}>
              <div className="ch-doc-label"><span>Admissions · How to apply</span><span>Page title</span></div>
              <input className="ch-field-title" value={title} onChange={(e) => { setTitle(e.target.value); setSaved(false); }} aria-label="Page title" readOnly={previewMode} />
              <textarea className="ch-summary" rows={1} value={summary} onChange={(e) => { setSummary(e.target.value); setSaved(false); }} aria-label="Short page introduction" readOnly={previewMode} />
              {!previewMode && !sourceMode && (
                <div className="ch-toolbar" role="toolbar" aria-label="Text formatting">
                  <span className="ch-tool-label">Format</span>
                  <button className="ch-tool" title="Bold" aria-label="Bold" onMouseDown={(e) => e.preventDefault()} onClick={() => runFormat("bold")}><Bold size={15} /></button>
                  <button className="ch-tool" title="Italic" aria-label="Italic" onMouseDown={(e) => e.preventDefault()} onClick={() => runFormat("italic")}><Italic size={15} /></button>
                  <span className="ch-tool-divider" />
                  <button className="ch-tool" title="Section heading" aria-label="Section heading" onMouseDown={(e) => e.preventDefault()} onClick={() => runFormat("formatBlock", "h2")}><Heading2 size={16} /></button>
                  <button className="ch-tool" title="Bulleted list" aria-label="Bulleted list" onMouseDown={(e) => e.preventDefault()} onClick={() => runFormat("insertUnorderedList")}><List size={16} /></button>
                  <button className="ch-tool" title="Numbered list" aria-label="Numbered list" onMouseDown={(e) => e.preventDefault()} onClick={() => runFormat("insertOrderedList")}><ListOrdered size={16} /></button>
                  <span className="ch-tool-divider" />
                  <button className="ch-tool" title="Add a link" aria-label="Add a link" onMouseDown={(e) => e.preventDefault()} onClick={() => { const url = window.prompt("Paste the web address for this link"); if (url) runFormat("createLink", url); }}><Link2 size={15} /></button>
                  <button className="ch-tool" title="Undo" aria-label="Undo" onMouseDown={(e) => e.preventDefault()} onClick={() => runFormat("undo")}><Undo2 size={15} /></button>
                  <button className="ch-tool" title="Redo" aria-label="Redo" onMouseDown={(e) => e.preventDefault()} onClick={() => runFormat("redo")}><Redo2 size={15} /></button>
                </div>
              )}
              {sourceMode && !previewMode ? (
                <textarea className="ch-source" aria-label="Page source text" value={source} onChange={(e) => { setSource(e.target.value); setSaved(false); }} spellCheck={false} />
              ) : (
                <div
                  className="ch-editor-body"
                  ref={bodyRef}
                  contentEditable={!previewMode}
                  suppressContentEditableWarning
                  onInput={(e) => { setBody(e.currentTarget.innerHTML); setSaved(false); }}
                  dangerouslySetInnerHTML={{ __html: body }}
                  aria-label="Page body text"
                  role={previewMode ? "article" : "textbox"}
                  aria-multiline="true"
                />
              )}
              {sourceMode && !previewMode && <div className="ch-source-tip"><CircleHelp size={15} /><span>Advanced view for editors comfortable with page source. Switch back to Visual editor to see the formatted page.</span></div>}
            </div>
            <div className="ch-card-foot">
              <span>{sourceMode ? "Advanced source view" : "Click any text to edit it"} · Save content to update the live website</span>
              {sourceMode ? <button onClick={leaveSource}>Return to visual editor</button> : <span>Colorado Heritage Education School</span>}
            </div>
          </section>

          <aside className="ch-side">
            <section className="ch-side-card">
              <div className="ch-side-heading">Website updates <ChevronDown size={16} /></div>
              <div className="ch-publish-state">
                <div className="ch-state-icon"><Check size={15} /></div>
                <div><strong>{saved ? "Content is up to date" : "You have unsaved changes"}</strong><small>{saved ? "The saved version is what visitors see." : "Save content to update the page visitors see."}</small></div>
              </div>
              <p className="ch-publish-note">Saving updates this page on the website immediately. There is no separate publish step.</p>
              <div className="ch-divider" />
              <div className="ch-meta-row"><span>Page address</span><strong>/admissions/how-to-apply</strong></div>
              <div className="ch-meta-row"><span>Content status</span><strong>{saved ? "Saved" : "Unsaved"}</strong></div>
            </section>
            <section className="ch-side-card">
              <div className="ch-side-heading">A little guidance <PanelRightClose size={15} /></div>
              <div className="ch-divider" />
              <div className="ch-help"><CircleHelp size={17} /><span>Write and format your page just like a document. Select words to make them bold, add a heading, or create a list.</span></div>
              <div className="ch-divider" />
              <div className="ch-help"><Clock3 size={16} /><span>Visitors see the latest saved version. Unsaved edits are only in this editor.</span></div>
            </section>
            <button className="ch-btn" onClick={() => setPreviewMode(!previewMode)}><ArrowUpRight size={14} />{previewMode ? "Back to editing" : "See visitor preview"}</button>
          </aside>
        </div>
      </section>
      {!saved && <div className="ch-toast" role="status">Changes not saved yet — select Save content to update the live website.</div>}
    </main>
  );
}

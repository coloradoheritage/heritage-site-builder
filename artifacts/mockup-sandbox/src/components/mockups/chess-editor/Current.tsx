import { useState } from "react";

/** Isolated extraction of the current page-editor interaction for visual comparison. */
export function Current() {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(
    "## First steps to get started\n\n1. Choose your program: Independent School, K–12 Academy, or High School Diploma Program.\n2. Schedule a visit and placement assessment.\n3. Submit your application.\n\n[Download the application](https://coloradoheritage.org/documents/application.pdf)",
  );

  return (
    <main className="editor-current">
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; font-family: Lato, Arial, sans-serif; color: #293849; }
        .editor-current { min-height: 100vh; background: #f4f1e8; padding: 20px; }
        .editor-current .preview { max-width: 980px; margin: 0 auto; border: 1px solid #ded8ca; background: #fffdf8; }
        .editor-current .bar { display: flex; justify-content: space-between; gap: 12px; padding: 9px 14px; background: #eae4d3; color: #4a4636; font-size: 13px; }
        .editor-current .page { padding: 36px clamp(20px, 5vw, 58px); }
        .editor-current .eyebrow { display: block; color: #687584; font-size: 12px; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 12px; }
        .editor-current h1 { font-family: Georgia, serif; color: #142b4a; font-size: clamp(28px, 4vw, 42px); font-weight: 400; margin: 0 0 20px; }
        .editor-current .body { min-height: 260px; padding: 4px; outline: 1px dashed transparent; cursor: text; line-height: 1.75; }
        .editor-current .body:hover { outline-color: #b49a5a; background: rgba(221, 202, 143, .1); }
        .editor-current textarea { width: 100%; min-height: 310px; border: 1px solid #b49a5a; padding: 12px; background: white; font: 13px/1.6 ui-monospace, monospace; color: #293849; }
        .editor-current .help { display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap; margin-top: 8px; color: #687584; font-size: 12px; }
        .editor-current button { border: 1px solid #cfc6b0; background: #fffdf8; color: #142b4a; padding: 8px 14px; cursor: pointer; font-weight: 700; }
        .editor-current .content h2 { color: #142b4a; font: 400 25px Georgia, serif; margin: 18px 0 8px; }
        .editor-current .content ol { padding-left: 22px; }
        .editor-current .content li { padding: 3px 0; }
        .editor-current .content a { color: #173b68; }
      `}</style>
      <section className="preview">
        <div className="bar"><span>Live preview. Click any text to edit it.</span><span>Open public page ↗</span></div>
        <article className="page">
          <span className="eyebrow">/admissions/how-to-apply</span>
          <h1>How to Apply</h1>
          {editing ? (
            <div>
              <textarea aria-label="Page text" value={body} onChange={(event) => setBody(event.target.value)} />
              <div className="help">
                <span>Formatting: # Heading, **bold**, - list item, [link text](/path)</span>
                <button type="button" onClick={() => setEditing(false)}>Done</button>
              </div>
            </div>
          ) : (
            <div className="body content" onClick={() => setEditing(true)}>
              <h2>First steps to get started</h2>
              <ol>
                <li>Choose your program: Independent School, K–12 Academy, or High School Diploma Program.</li>
                <li>Schedule a visit and placement assessment.</li>
                <li>Submit your application.</li>
              </ol>
              <a href="#application">Download the application</a>
            </div>
          )}
        </article>
      </section>
    </main>
  );
}

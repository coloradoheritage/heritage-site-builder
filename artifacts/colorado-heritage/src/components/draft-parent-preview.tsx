import { useState } from "react";
import type { SiteContentState } from "@workspace/api-client-react";
import type { SiteContentExt } from "../lib/cms";
import { DocumentsContext } from "./markdown";
import { PublicSitePages } from "./public-site";
import { AnnouncementBar, PublicSiteFooter, PublicSiteHeader } from "./site-chrome";

export default function DraftParentPreview({ draft, initialPath = "/", onClose }: {
  draft: SiteContentState; initialPath?: string; onClose: () => void;
}) {
  const [path, setPath] = useState(initialPath);
  const [phone, setPhone] = useState(false);
  return <div className="cms-parent-preview" role="dialog" aria-modal="true" aria-label="Private parent preview"
    onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
    <div className="cms-parent-preview-tools">
      <strong>Parent preview · private draft</strong>
      <label>Page <select value={path} onChange={(event) => setPath(event.target.value)}>
        <option value="/">Home</option><option value="/faq">Frequently asked questions</option><option value="/news">News</option>
        {draft.pages.filter((page) => !page.archived && !["/faq", "/news"].includes(page.path)).map((page) =>
          <option key={page.path} value={page.path}>{page.label}</option>)}
      </select></label>
      <button className="cms-btn" type="button" onClick={() => setPhone(!phone)}>{phone ? "Desktop preview" : "Phone preview"}</button>
      <button className="cms-btn" type="button" autoFocus onClick={onClose}>Back to editing</button>
    </div>
    <div className={`cms-parent-preview-page cms-puck-preview ${phone ? "is-phone" : ""}`}
      onSubmitCapture={(event) => event.preventDefault()}
      onClickCapture={(event) => {
        const anchor = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
        if (!anchor) return;
        event.preventDefault();
        event.stopPropagation();
        const url = new URL(anchor.href, window.location.href);
        if (url.origin === window.location.origin) setPath(url.pathname);
      }}>
      <DocumentsContext.Provider value={draft.documents}>
        <div className="cb-site">
          <AnnouncementBar contentOverride={draft} />
          <PublicSiteHeader editing contentOverride={draft} />
          <PublicSitePages contentOverride={draft as SiteContentExt} previewPath={path} />
          <PublicSiteFooter editing />
        </div>
      </DocumentsContext.Provider>
    </div>
  </div>;
}

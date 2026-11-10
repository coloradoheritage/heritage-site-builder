import { chromium } from "playwright-core";
import { buildFixture, svg } from "./fixture.mjs";

export const BASE = "http://127.0.0.1:5199";

export async function launch() {
  return chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
}

// Every network request is handled locally. Anything that is not the local Vite harness
// is aborted (so nothing can reach Replit, Clerk, Google Fonts or the live site), and the
// /api surface is a pure in-memory mock. `log` records what the app tried to call.
export async function newSession(browser, { viewport = { width: 1280, height: 900 } } = {}) {
  const state = { editor: buildFixture(), drafts: [], uploads: [], publishes: [], blocked: [], apiCalls: [] };
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await context.addInitScript(() => { window.__opened = []; window.open = (...args) => { window.__opened.push(args); return null; }; });
  page.on("pageerror", (e) => (state.pageErrors ??= []).push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") (state.consoleErrors ??= []).push(m.text()); });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.origin !== BASE) { state.blocked.push(`${method} ${url.href}`); return route.abort(); }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    state.apiCalls.push(`${method} ${url.pathname}`);
    const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname.startsWith("/api/media/files/")) {
      const name = url.pathname.split("/").pop();
      return route.fulfill({ status: 200, contentType: "image/svg+xml", body: svg(name, name.includes("replacement") ? "#8a2be2" : "#1a365d") });
    }
    if (url.pathname === "/api/site-content/editor" && method === "GET") return json(200, state.editor);
    if (url.pathname === "/api/site-content" && method === "GET") return json(200, state.editor.published);
    if (url.pathname === "/api/site-content/draft" && (method === "PUT" || method === "POST")) {
      const body = JSON.parse(route.request().postData() || "{}");
      state.drafts.push(body);
      const revision = state.editor.draft.revision + 1;
      state.editor = { ...state.editor, draft: { ...body.content, revision }, draftBaseRevision: revision };
      return json(200, state.editor);
    }
    if (url.pathname === "/api/site-content/publish" && method === "POST") {
      const body = JSON.parse(route.request().postData() || "{}");
      state.publishes.push(body);
      // mirrors the server: unpublished blog drafts never become part of the public document
      const copy = JSON.parse(JSON.stringify(state.editor.draft));
      copy.news = copy.news.filter((post) => post.draft !== true);
      state.editor = { ...state.editor, published: copy };
      return json(200, state.editor);
    }
    if (url.pathname === "/api/media/health") return json(200, { configured: true, message: "mock storage (test harness)" });
    if (url.pathname === "/api/media/upload" && method === "POST") {
      const n = state.uploads.length + 1;
      state.uploads.push(`upload-${n}`);
      return json(200, { url: `/api/media/files/fixture-replacement-${n}.svg`, alt: "" });
    }
    if (url.pathname === "/api/inquiries") return json(200, []);
    if (url.pathname === "/api/editor-access") return json(200, { allowed: true });
    state.blocked.push(`UNMOCKED ${method} ${url.pathname}`);
    return json(501, { error: "not mocked in test harness" });
  });
  return { context, page, state };
}

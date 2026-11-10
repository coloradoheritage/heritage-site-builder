// Isolated browser tests for the editor/single-canvas branch. Test-only; no source under
// ../src is modified. Requires the harness Vite server (vite.config.ts) on 127.0.0.1:5199.
import fs from "node:fs";
import { launch, newSession, BASE } from "./lib.mjs";
import { buildFixture as buildFixtureForTests } from "./fixture.mjs";

const OUT = process.env.OUT_DIR || "/opt/cursor/artifacts";
const SHOTS = `${OUT}/screenshots`;
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const isFont = (b) => b.includes("fonts.g") || b.includes("rsms.me/inter");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const browser = await launch();

async function run(id, feature, name, fn, opts) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY).test(id)) return;
  const { context, page, state } = await newSession(browser, opts);
  const notes = [];
  const shot = async (label) => { const file = `${SHOTS}/${id}-${label}.png`; await page.screenshot({ path: file }); notes.push(`screenshot: ${file}`); };
  const ctx = { page, state, shot, note: (n) => notes.push(n) };
  let status = "PASS"; let error = "";
  try { await fn(ctx); }
  catch (e) { status = "FAIL"; error = String(e?.message ?? e).split("\n").slice(0, 6).join(" | "); try { await shot("FAILURE"); } catch { /* ignore */ } }
  const pageErrors = state.pageErrors ?? [];
  const row = { id, feature, name, status, error, notes, pageErrors, unmockedOrBlocked: state.blocked.filter((b) => !isFont(b)) };
  results.push(row);
  console.log(`${status}  ${id}  ${name}${error ? "\n      " + error : ""}`);
  await context.close();
}

const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const openCanvas = async (page, label) => {
  await page.goto(`${BASE}/?tool=site`);
  await page.waitForSelector(".cms-visual-editor");
  const value = await page.$$eval('[data-testid="select-visual-content"] option', (os, l) => os.find((o) => o.textContent.includes(l))?.value, label);
  expect(value, `page "${label}" not in picker`);
  await page.selectOption('[data-testid="select-visual-content"]', value);
  await page.click('[data-testid="toggle-page-settings"]');
  await page.waitForSelector('[data-testid="sections-editor"] .ProseMirror');
};
const nextDraft = async (state, before, ms = 6000) => {
  const t0 = Date.now();
  while (state.drafts.length <= before && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 100));
  expect(state.drafts.length > before, "no autosave draft POST was observed after the edit");
  return state.drafts.at(-1).content;
};
const pageMd = (content, path) => path === "/" ? content.home.markdown : content.pages.find((p) => p.path === path).markdown;
// Tiptap focus() is applied on the next animation frame; give it time so a "click away" is a real blur.
const blur = async (page) => { await page.waitForTimeout(200); await page.mouse.click(5, 5); };
const refocusCycle = async (page) => { await page.locator(".cms-section .ProseMirror p", { hasText: "Fixture paragraph two" }).click(); await blur(page); };
const saveDraftClick = async (page) => { await page.getByRole("button", { name: "Save Draft" }).click(); await page.waitForTimeout(1200); };
const IS = "/programs/independent-school";

// ---------------------------------------------------------------- build sanity
await run("R0", "setup", "Harness mounts real SiteManager against mocked API (no external requests)", async ({ page, state, shot }) => {
  await page.goto(`${BASE}/?tool=site`);
  await page.waitForSelector(".cms-visual-editor");
  expect(!state.blocked.some((b) => !isFont(b)), `unexpected blocked/unmocked requests: ${state.blocked.join(", ")}`);
  await shot("site-manager");
});

// ---------------------------------------------------------------- regressions
await run("R1", "regression", "Format toolbar appears ABOVE selected text", async ({ page, shot, note }) => {
  await openCanvas(page, "Independent School");
  const p2 = page.locator(".cms-section .ProseMirror p", { hasText: "Fixture paragraph two" });
  await p2.click({ clickCount: 3 });
  const bar = page.locator('[role="toolbar"][aria-label="Text formatting"]');
  await bar.waitFor({ state: "visible", timeout: 5000 });
  const geom = await page.evaluate(() => {
    const r = window.getSelection().getRangeAt(0).getBoundingClientRect();
    const t = document.querySelector('[role="toolbar"][aria-label="Text formatting"]').getBoundingClientRect();
    return { selTop: r.top, selBottom: r.bottom, barTop: t.top, barBottom: t.bottom, text: window.getSelection().toString() };
  });
  note(JSON.stringify(geom));
  expect(geom.text.includes("Fixture paragraph two"), "selection did not cover paragraph two");
  expect(geom.barBottom <= geom.selTop + 1, `toolbar is not above selection (bar bottom ${geom.barBottom} > selection top ${geom.selTop})`);
  await shot("toolbar-above-selection");
});

await run("R1b", "regression", "Format toolbar actually formats (Bold) and autosaves to draft", async ({ page, state }) => {
  await openCanvas(page, "Independent School");
  const p2 = page.locator(".cms-section .ProseMirror p", { hasText: "Fixture paragraph two" });
  await p2.click({ clickCount: 3 });
  await page.locator('[role="toolbar"][aria-label="Text formatting"] button[title="Bold"]').click();
  await blur(page);
  const c = await nextDraft(state, 0);
  expect(/\*\*Fixture paragraph two[^*]*\*\*/.test(pageMd(c, IS)), `bold not in saved markdown: ${pageMd(c, IS)}`);
});

await run("R2", "regression", "Page headline editable in place and saved to draft", async ({ page, state, shot }) => {
  await openCanvas(page, "Independent School");
  const h1 = page.locator('h1[aria-label="Page headline"]');
  await h1.click(); await page.keyboard.press("Control+A"); await page.keyboard.type("Edited Headline Fixture");
  await page.keyboard.press("Enter");
  const c = await nextDraft(state, 0);
  expect(c.pages.find((p) => p.path === IS).label === "Edited Headline Fixture", "label not saved");
  await shot("headline-edited");
});

await run("R2b", "regression", "Page intro editable in place and saved to draft; Escape reverts", async ({ page, state }) => {
  await openCanvas(page, "Independent School");
  const intro = page.locator('p[aria-label="Page intro"]');
  await intro.click(); await page.keyboard.press("Control+A"); await page.keyboard.type("Discarded text"); await page.keyboard.press("Escape");
  expect((await intro.textContent()).includes("Fixture intro sentence"), "Escape did not revert intro");
  expect(state.drafts.length === 0, "Escape revert should not have saved a draft");
  await intro.click(); await page.keyboard.press("Control+A"); await page.keyboard.type("Edited intro fixture"); await page.keyboard.press("Enter");
  const c = await nextDraft(state, 0);
  expect(c.pages.find((p) => p.path === IS).description === "Edited intro fixture", "description not saved");
});

// ---------------------------------------------------------------- 1. inline photos
const clickPhoto = async (page, srcPart) => {
  await page.locator(`.cms-section .ProseMirror img[src*="${srcPart}"]`).click();
  await page.locator('[data-testid="imagechip-alt"]').waitFor({ state: "visible", timeout: 5000 });
};

await run("F1a", "1-inline-photos", "Clicking an inline photo shows chip with description, Replace photo, Remove photo", async ({ page, shot }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  expect((await page.inputValue('[data-testid="imagechip-alt"]')) === "Fixture geese family", "chip alt does not show the current description");
  await page.locator('[data-testid="imagechip-replace"]').waitFor({ state: "visible" });
  await page.locator('[data-testid="imagechip-remove"]').waitFor({ state: "visible" });
  await shot("photo-chip");
});

const photoMd = (c) => pageMd(c, IS).split("\n\n")[1];
const lastDraft = (state) => state.drafts.at(-1)?.content;
const uploadReplace = async (page) => {
  await page.locator('[data-testid="imagechip-replace"]').click();
  await page.locator('[data-testid="input-photo-file"]').setInputFiles({ name: "new.png", mimeType: "image/png", buffer: PNG });
  await page.locator('[data-testid="input-photo-alt"]').fill("Uploaded replacement description");
  await page.locator('[data-testid="button-upload-photo"]').click();
  await page.waitForSelector('.cms-section .ProseMirror img[src*="fixture-replacement-1"]', { timeout: 5000 });
};
const libraryReplace = async (page) => {
  await page.locator('[data-testid="imagechip-replace"]').click();
  await page.locator('[data-testid="school-photo-library"] summary').click();
  const first = page.locator(".cms-library-photo").first();
  await first.waitFor({ state: "visible" });
  await first.click();
  await page.waitForFunction(() => !document.querySelector('.cms-section .ProseMirror img[src*="fixture-geese"]'), null, { timeout: 5000 });
};
const editAlt = async (page) => { const alt = page.locator('[data-testid="imagechip-alt"]'); await alt.fill("Brand new description"); await alt.blur(); };

// In-editor behaviour: the editor DOM updates immediately.
await run("F1b", "1-inline-photos", "Edit photo description: editor updates (DOM alt attribute)", async ({ page }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await editAlt(page);
  expect((await page.locator('.cms-section .ProseMirror img[src*="fixture-geese"]').getAttribute("alt")) === "Brand new description", "alt attribute not updated in editor");
});
await run("F1c", "1-inline-photos", "Replace photo via upload (mock endpoint): editor swaps photo, one mock upload", async ({ page, state, shot }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await page.locator('[data-testid="imagechip-replace"]').click();
  await page.locator('[data-testid="input-photo-file"]').setInputFiles({ name: "new.png", mimeType: "image/png", buffer: PNG });
  await page.locator('[data-testid="input-photo-alt"]').fill("Uploaded replacement description");
  await shot("replace-uploader");
  await page.locator('[data-testid="button-upload-photo"]').click();
  await page.waitForSelector('.cms-section .ProseMirror img[src*="fixture-replacement-1"]', { timeout: 5000 });
  const img = page.locator('.cms-section .ProseMirror img[src*="fixture-replacement-1"]');
  expect((await img.getAttribute("alt")) === "Uploaded replacement description", "alt not carried to replacement");
  expect(state.uploads.length === 1, "expected exactly one mock upload");
  await shot("after-replace");
});
await run("F1d", "1-inline-photos", "Replace photo from CHESS library (no upload): editor swaps photo", async ({ page, state }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await libraryReplace(page);
  expect(state.uploads.length === 0, "library replace must not upload");
});

// Persistence of those edits. Alt edits / replace only update the editor; the section commits to the
// draft on editor blur. These tests do what a user does next, WITHOUT first re-focusing the text.
await run("F1b2", "1-inline-photos", "PERSISTENCE: edit photo description, then click Save Draft -> new description in saved draft", async ({ page, state, note }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await editAlt(page);
  await saveDraftClick(page);
  const c = lastDraft(state); note(`saved photo markdown: ${c ? photoMd(c) : "(no draft POST)"}`);
  expect(c && photoMd(c).includes("![Brand new description]"), `new description missing from saved draft: ${c ? photoMd(c) : "no draft POST"}`);
});
await run("F1c2", "1-inline-photos", "PERSISTENCE: replace photo via upload, then click Save Draft -> new photo in saved draft", async ({ page, state, note }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await uploadReplace(page);
  await saveDraftClick(page);
  const c = lastDraft(state); note(`saved photo markdown: ${c ? photoMd(c) : "(no draft POST)"}`);
  expect(c && photoMd(c).includes("fixture-replacement-1"), `replacement missing from saved draft: ${c ? photoMd(c) : "no draft POST"}`);
});
await run("F1d2", "1-inline-photos", "PERSISTENCE: replace photo from library, then click Save Draft -> new photo in saved draft", async ({ page, state, note }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await libraryReplace(page);
  await saveDraftClick(page);
  const c = lastDraft(state); note(`saved photo markdown: ${c ? photoMd(c) : "(no draft POST)"}`);
  expect(c && !photoMd(c).includes("fixture-geese"), `library replacement missing from saved draft: ${c ? photoMd(c) : "no draft POST"}`);
});
await run("F1c3", "1-inline-photos", "PERSISTENCE: replace photo, then open Parent preview -> preview shows new photo", async ({ page, note }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await uploadReplace(page);
  await page.getByRole("button", { name: "Preview as a parent" }).first().click();
  await page.waitForSelector('[data-testid="preview-edit-this-page"]');
  const srcs = await page.locator('.cms-parent-preview-page img[src*="fixture-"]').evaluateAll((els) => els.map((e) => e.getAttribute("src")));
  note(`preview image srcs: ${JSON.stringify(srcs)}`);
  expect(srcs.some((x) => x.includes("fixture-replacement-1")), `preview still shows ${JSON.stringify(srcs)}`);
});
// Workarounds: same edits, followed by a focus/blur cycle on the text editor.
await run("F1b3", "1-inline-photos", "WORKAROUND: edit description, click into text and away -> saved by autosave", async ({ page, state }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await editAlt(page); await refocusCycle(page);
  const c = await nextDraft(state, 0);
  expect(photoMd(c).includes("![Brand new description](/api/media/files/fixture-geese.svg)"), `alt not saved: ${photoMd(c)}`);
});
await run("F1c4", "1-inline-photos", "WORKAROUND: replace via upload, click into text and away -> saved by autosave", async ({ page, state }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await uploadReplace(page); await refocusCycle(page);
  const c = await nextDraft(state, 0);
  expect(photoMd(c).includes("![Uploaded replacement description](/api/media/files/fixture-replacement-1.svg)"), `replacement not saved: ${photoMd(c)}`);
});

// ---- Bug A regression coverage (photo edits must reach Save Draft / preview / page switch / publish at once)
const switchPageAndBack = async (page, otherLabel, backLabel) => {
  const pick = async (label) => {
    const v = await page.$$eval('[data-testid="select-visual-content"] option', (os, l) => os.find((o) => o.textContent.includes(l))?.value, label);
    await page.selectOption('[data-testid="select-visual-content"]', v);
    await page.waitForSelector('[data-testid="sections-editor"] .ProseMirror');
  };
  await pick(otherLabel); await pick(backLabel);
};
const previewSrcs = async (page) => {
  await page.getByRole("button", { name: "Preview as a parent" }).first().click();
  await page.waitForSelector('[data-testid="preview-edit-this-page"]');
  return page.locator('.cms-parent-preview-page img[src*="/api/media/files/"]').evaluateAll((els) => els.map((e) => ({ src: e.getAttribute("src"), alt: e.getAttribute("alt") })));
};
const editorPhoto = (page) => page.locator('.cms-section .ProseMirror img[src*="/api/media/files/"]').first();

await run("A1", "bug-A", "Edit alt and click Save Draft directly (alt field still focused, no manual blur) -> saved", async ({ page, state }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await page.fill('[data-testid="imagechip-alt"]', "Typed then straight to Save Draft");
  await saveDraftClick(page);
  expect(photoMd(lastDraft(state)).includes("![Typed then straight to Save Draft](/api/media/files/fixture-geese.svg)"), `saved: ${photoMd(lastDraft(state))}`);
});
await run("A2", "bug-A", "Clear alt (empty) then Save Draft -> photo kept with empty description", async ({ page, state }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await page.fill('[data-testid="imagechip-alt"]', "");
  await page.locator('[data-testid="imagechip-alt"]').blur();
  await saveDraftClick(page);
  expect(photoMd(lastDraft(state)) === "![](/api/media/files/fixture-geese.svg)", `saved: ${photoMd(lastDraft(state))}`);
});
await run("A3", "bug-A", "Edit alt then open Parent preview -> preview shows new description", async ({ page }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await editAlt(page);
  const imgs = await previewSrcs(page);
  expect(imgs.some((i) => i.alt === "Brand new description"), `preview images: ${JSON.stringify(imgs)}`);
});
await run("A4", "bug-A", "Edit alt, switch to another page and back -> new description still there and saved", async ({ page, state }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await editAlt(page);
  await switchPageAndBack(page, "Our Beliefs", "Independent School");
  expect((await editorPhoto(page).getAttribute("alt")) === "Brand new description", "description lost after switching pages");
  await saveDraftClick(page);
  expect(photoMd(lastDraft(state)).includes("![Brand new description]"), `saved: ${photoMd(lastDraft(state))}`);
});
await run("A5", "bug-A", "Upload-replace, then switch page and back -> new photo kept", async ({ page, state }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await uploadReplace(page);
  await switchPageAndBack(page, "Our Beliefs", "Independent School");
  expect(((await editorPhoto(page).getAttribute("src")) ?? "").includes("fixture-replacement-1"), "replacement lost after switching pages");
  await saveDraftClick(page);
  expect(photoMd(lastDraft(state)).includes("fixture-replacement-1"), `saved: ${photoMd(lastDraft(state))}`);
});
await run("A6", "bug-A", "Library-replace, then open Parent preview -> preview shows library photo, not the old one", async ({ page }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await libraryReplace(page);
  const imgs = await previewSrcs(page);
  expect(imgs.length > 0 && !imgs.some((i) => i.src.includes("fixture-geese")), `preview images: ${JSON.stringify(imgs)}`);
});
await run("A7", "bug-A", "Upload-replace, then Publish -> published content has the new photo (mock publish)", async ({ page, state }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await uploadReplace(page);
  await page.getByRole("button", { name: "Publish changes" }).click();
  await page.waitForTimeout(1500);
  expect(state.publishes.length === 1, `publish calls: ${state.publishes.length}`);
  const pub = state.editor.published.pages.find((p) => p.path === IS).markdown;
  expect(pub.includes("fixture-replacement-1") && !pub.includes("fixture-geese"), `published markdown: ${pub}`);
});
await run("A8", "bug-A", "Remove photo then Save Draft directly (no manual blur) -> photo gone in saved draft", async ({ page, state }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await page.locator('[data-testid="imagechip-remove"]').click();
  await saveDraftClick(page);
  expect(!pageMd(lastDraft(state), IS).includes("fixture-geese"), `saved: ${pageMd(lastDraft(state), IS)}`);
});
await run("A9", "bug-A", "Intended behavior kept: typing does not push a draft per keystroke; it commits on blur", async ({ page, state }) => {
  await openCanvas(page, "Independent School");
  const p2 = page.locator(".cms-section .ProseMirror p", { hasText: "Fixture paragraph two" });
  await p2.click(); await page.keyboard.press("End"); await page.keyboard.type(" typed while focused", { delay: 30 });
  await page.waitForTimeout(1800);
  expect(state.drafts.length === 0, `draft posted while still typing (${state.drafts.length})`);
  await blur(page);
  const c = await nextDraft(state, 0);
  expect(pageMd(c, IS).includes("typed while focused"), "typed text not saved after blur");
});
await run("A10", "bug-A", "Untouched section is not marked edited by clicking a photo and leaving (no spurious draft)", async ({ page, state }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await blur(page);
  await page.waitForTimeout(1800);
  expect(state.drafts.length === 0, `spurious draft after click-through (${state.drafts.length})`);
});

await run("F1e", "1-inline-photos", "Remove photo -> photo gone, surrounding text kept, saved to draft", async ({ page, state, shot }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await page.locator('[data-testid="imagechip-remove"]').click();
  expect((await page.locator('.cms-section .ProseMirror img[src*="fixture-geese"]').count()) === 0, "photo still in editor");
  await blur(page);
  const c = await nextDraft(state, 0);
  const md = pageMd(c, IS);
  expect(!md.includes("fixture-geese") && md.includes("Fixture paragraph one") && md.includes("Fixture paragraph two"), `unexpected markdown: ${md}`);
  await shot("after-remove");
});

await run("F1f", "1-inline-photos", "Probe: photo with NO description survives an unrelated text edit (round-trip)", async ({ page, state, note }) => {
  await openCanvas(page, "Our Beliefs");
  const p = page.locator(".cms-section .ProseMirror p").first();
  const box = await p.boundingBox();
  await p.click({ position: { x: box.width - 4, y: box.height / 2 } }); await page.keyboard.press("End"); await page.keyboard.type(" EXTRA");
  await blur(page);
  const c = await nextDraft(state, 0);
  const md = pageMd(c, "/about/beliefs");
  note(`saved markdown: ${JSON.stringify(md)}`);
  expect(md.includes("fixture-nodesc"), `photo without description was dropped on save. Saved markdown: ${JSON.stringify(md)}`);
});

await run("F1g", "1-inline-photos", "Probe: clearing a photo's description keeps the photo", async ({ page, state, note }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  const alt = page.locator('[data-testid="imagechip-alt"]');
  await alt.fill(""); await alt.blur();
  // alt edits do not by themselves change text; force a commit with a trailing edit
  // the open photo chip can cover either paragraph; click the far right edge of paragraph two, clear of it
  const p2 = page.locator(".cms-section .ProseMirror p", { hasText: "Fixture paragraph two" });
  const box = await p2.boundingBox();
  await page.mouse.click(box.x + box.width - 4, box.y + box.height / 2);
  await page.keyboard.press("End"); await page.keyboard.type("!");
  await blur(page);
  const c = await nextDraft(state, 0);
  note(`saved markdown: ${JSON.stringify(pageMd(c, IS))}`);
  expect(pageMd(c, IS).includes("fixture-geese"), `photo dropped when description cleared. Saved: ${JSON.stringify(pageMd(c, IS))}`);
});

// ---------------------------------------------------------------- 2. links
const clickLink = async (page, text) => {
  await page.locator(".cms-section .ProseMirror a", { hasText: text }).click();
  await page.locator('[data-testid="linkchip-change"]').waitFor({ state: "visible", timeout: 5000 });
};

await run("F2a", "2-links", "Existing internal link shows destination + Change link / Open / Remove link", async ({ page, shot }) => {
  await openCanvas(page, "Independent School");
  await clickLink(page, "internal link");
  const chip = page.locator('[role="group"][aria-label="Link options"]');
  expect((await chip.locator(".cms-linkchip-url").textContent()) === "/programs/academy", "destination not shown");
  for (const t of ["Change link", "Open", "Remove link"]) await chip.getByRole("button", { name: t, exact: true }).waitFor({ state: "visible" });
  await shot("link-chip-internal");
});

await run("F2b", "2-links", "External link chip shows URL; chip follows caret to a different link", async ({ page, shot }) => {
  await openCanvas(page, "Independent School");
  await clickLink(page, "internal link");
  await page.locator(".cms-section .ProseMirror a", { hasText: "external link" }).click();
  await page.waitForFunction(() => document.querySelector(".cms-linkchip-url")?.textContent === "https://example.org/info", null, { timeout: 5000 });
  await shot("link-chip-external");
});

await run("F2c", "2-links", "Change link to another page -> saved in draft", async ({ page, state, shot }) => {
  await openCanvas(page, "Independent School");
  await clickLink(page, "internal link");
  await page.locator('[data-testid="linkchip-change"]').click();
  await shot("link-chip-edit");
  await page.selectOption('[data-testid="linkchip-page"]', "/programs/diploma");
  await page.getByRole("button", { name: "Save link" }).click();
  await blur(page);
  const c = await nextDraft(state, 0);
  const md = pageMd(c, IS);
  expect(md.includes("[an internal link](/programs/diploma)"), `link not retargeted: ${md}`);
  expect(md.includes("[an external link](https://example.org/info)"), "other link was disturbed");
});

await run("F2d", "2-links", "Change link to a web address; unsafe address rejected with message", async ({ page, state }) => {
  await openCanvas(page, "Independent School");
  await clickLink(page, "external link");
  await page.locator('[data-testid="linkchip-change"]').click();
  await page.fill('[data-testid="linkchip-url"]', "javascript:alert(1)");
  await page.getByRole("button", { name: "Save link" }).click();
  await page.locator('.cms-linkchip-error[role="alert"]').waitFor({ state: "visible", timeout: 3000 });
  await page.fill('[data-testid="linkchip-url"]', "https://example.com/new");
  await page.getByRole("button", { name: "Save link" }).click();
  await blur(page);
  const c = await nextDraft(state, 0);
  expect(pageMd(c, IS).includes("[an external link](https://example.com/new)"), `not saved: ${pageMd(c, IS)}`);
});

await run("F2e", "2-links", "Open button calls window.open(destination, _blank, noopener,noreferrer) and does not touch the draft", async ({ page, state }) => {
  await openCanvas(page, "Independent School");
  await clickLink(page, "external link");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  const opened = await page.evaluate(() => window.__opened);
  expect(opened.length === 1 && opened[0][0] === "https://example.org/info" && opened[0][1] === "_blank" && String(opened[0][2]).includes("noopener"), `window.open calls: ${JSON.stringify(opened)}`);
  await page.waitForTimeout(1500);
  expect(state.drafts.length === 0, "Open must not modify the draft");
});

await run("F2f", "2-links", "Remove link -> link removed, text kept, saved", async ({ page, state, shot }) => {
  await openCanvas(page, "Independent School");
  await clickLink(page, "internal link");
  await page.locator('[data-testid="linkchip-remove"]').click();
  await blur(page);
  const c = await nextDraft(state, 0);
  const md = pageMd(c, IS);
  expect(!md.includes("/programs/academy") && md.includes("an internal link") && md.includes("[an external link]"), `unexpected markdown: ${md}`);
  await shot("link-removed");
});

await run("F2g", "2-links", "Selecting text inside a link shows the format toolbar (not the link chip) - no overlap", async ({ page, shot }) => {
  await openCanvas(page, "Independent School");
  await page.locator(".cms-section .ProseMirror a", { hasText: "internal link" }).dblclick();
  await page.locator('[role="toolbar"][aria-label="Text formatting"]').waitFor({ state: "visible", timeout: 5000 });
  expect((await page.locator('[role="group"][aria-label="Link options"]').count()) === 0 || !(await page.locator('[role="group"][aria-label="Link options"]').isVisible()), "link chip visible together with toolbar");
  await shot("toolbar-on-link-selection");
});

// ---------------------------------------------------------------- 3. admin landing + More
await run("F3a", "3-admin-landing", "Landing shows exactly six plain-language tasks (blog post first) with descriptions + More hint", async ({ page, shot }) => {
  await page.goto(`${BASE}/`);
  await page.waitForSelector(".cms-home-choices");
  const cards = await page.$$eval(".cms-home-choices button", (bs) => bs.map((b) => [b.querySelector("strong")?.textContent, b.querySelector("span")?.textContent, b.getAttribute("data-testid")]));
  const want = ["Write a blog post", "Edit a page", "Post an announcement", "Add an event", "Update staff", "Upload a document"];
  expect(cards.length === 6, `expected 6 tasks, got ${cards.length}: ${JSON.stringify(cards)}`);
  expect(JSON.stringify(cards.map((c) => c[0])) === JSON.stringify(want), `task titles: ${JSON.stringify(cards)}`);
  expect(cards.every((c) => c[1] && c[1].length > 15), "a task lacks a description");
  expect((await page.locator('[data-testid="choose-more"]').count()) === 1, "More hint link missing");
  await shot("landing");
});

await run("F3b", "3-admin-landing", "Each of the six task cards opens the matching editor tab", async ({ page }) => {
  const map = { news: "Blog posts", visual: "Edit pages", announcements: "Announcements", events: "Events", staff: "Faculty & staff", documents: "Documents" };
  for (const [id, label] of Object.entries(map)) {
    await page.goto(`${BASE}/`);
    await page.waitForSelector(`[data-testid="choose-${id}"]`);
    await page.click(`[data-testid="choose-${id}"]`);
    await page.waitForSelector(".cms-shell");
    const active = await page.locator(".cms-tabs > button.is-active").first().textContent();
    expect(active.startsWith(label), `choose-${id} opened "${active}", expected "${label}"`);
  }
});

await run("F3c", "3-admin-landing", "'Open the editor' More hint opens editor (Edit pages)", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await page.click('[data-testid="choose-more"]');
  await page.waitForSelector(".cms-shell");
  expect((await page.locator(".cms-tabs > button.is-active").first().textContent()).startsWith("Edit pages"), "did not open Edit pages");
});

await run("F3d", "3-admin-landing", "Editor tab bar: six primary tabs + More menu with a description per item", async ({ page, shot }) => {
  await page.goto(`${BASE}/?tool=site`);
  await page.waitForSelector(".cms-tabs");
  const primary = await page.$$eval(".cms-tabs > button", (bs) => bs.map((b) => b.getAttribute("data-testid")));
  expect(JSON.stringify(primary) === JSON.stringify(["tab-visual", "tab-news", "tab-announcements", "tab-events", "tab-staff", "tab-documents"]), `primary tabs: ${primary}`);
  await page.click('[data-testid="tab-more"]');
  const items = await page.$$eval('.cms-tabs-more-menu [role="menuitem"]', (bs) => bs.map((b) => [b.getAttribute("data-testid"), b.querySelector("strong")?.textContent, b.querySelector(":scope > span")?.textContent]));
  expect(items.length === 5 && items.every((i) => i[2] && i[2].length > 10), `More menu items: ${JSON.stringify(items)}`);
  await shot("more-menu-open");
  await page.keyboard.press("Escape");
  expect((await page.locator(".cms-tabs-more-menu").count()) === 0, "Escape did not close More menu");
  await page.click('[data-testid="tab-more"]'); await page.mouse.click(5, 5);
  expect((await page.locator(".cms-tabs-more-menu").count()) === 0, "outside click did not close More menu");
});

await run("F3e", "3-admin-landing", "Every More item opens its tab, label shows on More button, tab renders without errors", async ({ page, state }) => {
  const more = { pages: "Pages", faqs: "FAQs", inquiries: "Inquiries", menu: "Menu links", home: "Home photo & settings" };
  await page.goto(`${BASE}/?tool=site`);
  await page.waitForSelector(".cms-tabs");
  for (const [id, label] of Object.entries(more)) {
    await page.click('[data-testid="tab-more"]');
    await page.click(`.cms-tabs-more-menu [data-testid="tab-${id}"]`);
    await page.waitForFunction((l) => document.querySelector('[data-testid="tab-more"]')?.textContent?.startsWith(l), label, { timeout: 4000 });
    await page.waitForSelector(".cms-body *");
    expect(await page.locator(".cms-tab-desc").isVisible(), `no description line under tab ${id}`);
    await page.screenshot({ path: `${SHOTS}/F3e-${id}.png` });
  }
  expect(!(state.pageErrors ?? []).length, `page errors: ${state.pageErrors}`);
});

await run("F3f", "3-admin-landing", "Deep link ?tab=<more-tab> still works; unknown ?tab falls back to Edit pages", async ({ page }) => {
  await page.goto(`${BASE}/?tool=site&tab=faqs`);
  await page.waitForSelector(".cms-tabs");
  expect((await page.locator('[data-testid="tab-more"]').textContent()).startsWith("FAQs"), "?tab=faqs not honoured");
  await page.goto(`${BASE}/?tool=site&tab=nonsense`);
  await page.waitForSelector(".cms-tabs");
  expect((await page.locator(".cms-tabs > button.is-active").first().textContent()).startsWith("Edit pages"), "fallback broken");
});

// ---------------------------------------------------------------- 4. Edit this page in parent preview
const getPreview = async (page) => { await page.getByRole("button", { name: "Preview as a parent" }).first().click(); await page.waitForSelector('[data-testid="preview-edit-this-page"]'); };
const openPreview = async (page) => { await page.getByRole("button", { name: "Preview as a parent" }).first().click(); await page.waitForSelector('[data-testid="preview-edit-this-page"]'); };
const editorHeadline = async (page) => (await page.locator('h1[aria-label="Page headline"]').textContent());

await run("F4a", "4-edit-this-page", "Button is present in the preview and opens the page being previewed (from the visual editor)", async ({ page, shot }) => {
  await openCanvas(page, "Our Beliefs");
  await page.getByRole("button", { name: "Preview as a parent" }).first().click(); // top bar button
  await page.waitForSelector('[data-testid="preview-edit-this-page"]');
  await shot("preview-with-button");
  await page.click('[data-testid="preview-edit-this-page"]');
  await page.waitForSelector('[data-testid="sections-editor"] .ProseMirror');
  expect((await editorHeadline(page)) === "Our Beliefs", `opened "${await editorHeadline(page)}"`);
  expect((await page.locator(".cb-page-head h1").count()) === 1 && (await page.locator('[role="dialog"][aria-label="Private parent preview"]').count()) === 0, "preview did not close");
});

await run("F4b", "4-edit-this-page", "Click around inside the preview (nav links), then Edit this page opens the CURRENT page", async ({ page, shot, note }) => {
  await openCanvas(page, "Independent School");
  await page.getByRole("button", { name: "Preview as a parent" }).first().click();
  await page.waitForSelector('[data-testid="preview-edit-this-page"]');
  // navigate inside the preview using the real site navigation: Programs > ... / About > Our Beliefs
  const dlg = page.locator('[role="dialog"][aria-label="Private parent preview"]');
  const link = dlg.locator('a[href="/about/beliefs"]').first();
  expect(await link.count() > 0, "no /about/beliefs nav link in preview header");
  await link.evaluate((a) => a.click());
  await dlg.locator("h1", { hasText: "Our Beliefs" }).waitFor({ timeout: 5000 });
  expect(await page.locator('[data-testid="preview-edit-this-page"]').isVisible(), "button disappeared after navigating");
  await shot("preview-navigated");
  await page.click('[data-testid="preview-edit-this-page"]');
  await page.waitForSelector('[data-testid="sections-editor"] .ProseMirror');
  const h = await editorHeadline(page); note(`editor opened: ${h}`);
  expect(h === "Our Beliefs", `expected Our Beliefs, editor opened "${h}"`);
  const picked = await page.locator('[data-testid="select-visual-content"] option:checked').textContent();
  expect(picked.includes("/about/beliefs"), `picker shows "${picked}"`);
});

await run("F4c", "4-edit-this-page", "Button stays visible while scrolling long preview and in phone preview", async ({ page, shot }) => {
  await openCanvas(page, "Independent School");
  await page.getByRole("button", { name: "Preview as a parent" }).first().click();
  await page.waitForSelector('[data-testid="preview-edit-this-page"]');
  await page.evaluate(() => { const el = document.querySelector(".cms-parent-preview"); el.scrollTo(0, el.scrollHeight); });
  await page.waitForTimeout(200);
  const box = await page.locator('[data-testid="preview-edit-this-page"]').boundingBox();
  expect(box && box.y >= 0 && box.y < 200, `button not pinned in viewport after scroll: ${JSON.stringify(box)}`);
  await shot("preview-scrolled");
  await page.getByRole("button", { name: "Phone preview" }).click();
  expect(await page.locator('[data-testid="preview-edit-this-page"]').isVisible(), "button missing in phone preview");
});

await run("F4d", "4-edit-this-page", "Preview of Home (/) opens Home editor; /faq opens FAQs tab", async ({ page, note }) => {
  await page.goto(`${BASE}/?tool=site`);
  await page.waitForSelector(".cms-visual-editor");
  const dlg = page.locator('[role="dialog"][aria-label="Private parent preview"]');
  await openPreview(page);
  await dlg.locator("select").selectOption("/");
  await page.click('[data-testid="preview-edit-this-page"]');
  await page.waitForSelector('[data-testid="sections-editor"] .ProseMirror');
  expect((await editorHeadline(page)) === "Home", `home -> "${await editorHeadline(page)}"`);
  await openPreview(page);
  await dlg.locator("select").selectOption("/faq");
  await page.click('[data-testid="preview-edit-this-page"]');
  await page.waitForSelector(".cms-tabs");
  const faqActive = await page.locator('[data-testid="tab-more"]').textContent();
  note(`/faq -> ${faqActive}`);
  expect(faqActive.startsWith("FAQs"), `/faq -> "${faqActive}"`);
});

const previewNews = async (page, note) => {
  await page.goto(`${BASE}/?tool=site`);
  await page.waitForSelector(".cms-visual-editor");
  const dlg = page.locator('[role="dialog"][aria-label="Private parent preview"]');
  await openPreview(page);
  await dlg.locator("select").selectOption("/news");
  await page.click('[data-testid="preview-edit-this-page"]');
  await page.waitForTimeout(500);
  const more = (await page.locator(".cms-tabs > button.is-active").first().textContent()).trim();
  const picked = await page.locator('[data-testid="select-visual-content"] option:checked').count() ? await page.locator('[data-testid="select-visual-content"] option:checked').textContent() : "(visual editor not shown)";
  note(`/news -> active tab "${more}", visual editor picker "${picked}"`);
  return { more, picked };
};

await run("F4d2", "4-edit-this-page", "Preview of /news WITH an unarchived kind=archive page record (seed) opens News tab", async ({ page, state, note }) => {
  expect(state.editor.draft.pages.some((p) => p.path === "/news"), "fixture should contain a /news page record");
  const { more } = await previewNews(page, note);
  expect(more.startsWith("Blog posts"), `Edit this page on /news did not open the Blog posts tab (active tab: "${more}")`);
});

await run("F4d3", "4-edit-this-page", "Preview of /news with NO /news page record opens News tab", async ({ page, state, note }) => {
  state.editor.draft.pages = state.editor.draft.pages.filter((p) => p.path !== "/news");
  const { more } = await previewNews(page, note);
  expect(more.startsWith("Blog posts"), `active tab: "${more}"`);
});

await run("F4d4", "4-edit-this-page", "Preview of /news WITH an archived:true /news page record opens News tab", async ({ page, state, note }) => {
  state.editor.draft.pages = state.editor.draft.pages.map((p) => p.path === "/news" ? { ...p, archived: true } : p);
  const { more } = await previewNews(page, note);
  expect(more.startsWith("Blog posts"), `active tab: "${more}"`);
});

await run("F4d5", "4-edit-this-page", "Preview of /faq WITH a /faq page record present still opens FAQs tab", async ({ page, state, note }) => {
  state.editor.draft.pages.push({ path: "/faq", label: "Old FAQ page", title: "Old FAQ", description: "", markdown: "old", kind: "content" });
  await page.goto(`${BASE}/?tool=site`);
  await page.waitForSelector(".cms-visual-editor");
  await openPreview(page);
  await page.locator('[role="dialog"][aria-label="Private parent preview"] select').selectOption("/faq");
  await page.click('[data-testid="preview-edit-this-page"]');
  await page.waitForTimeout(500);
  const more = (await page.locator('[data-testid="tab-more"]').textContent()).trim();
  note(`/faq -> More button "${more}"`);
  expect(more.startsWith("FAQs"), `More button: "${more}"`);
});

await run("F4d6", "4-edit-this-page", "Ordinary page records still open that page (unchanged behavior)", async ({ page, shot }) => {
  await openCanvas(page, "Independent School");
  await page.getByRole("button", { name: "Preview as a parent" }).first().click();
  await page.waitForSelector('[data-testid="preview-edit-this-page"]');
  await page.click('[data-testid="preview-edit-this-page"]');
  await page.waitForSelector('[data-testid="sections-editor"] .ProseMirror');
  expect((await editorHeadline(page)) === "Independent School", `opened "${await editorHeadline(page)}"`);
});

await run("F4e", "4-edit-this-page", "Staff-profile and news-article pages reached by clicking inside the preview open that record", async ({ page, state, note }) => {
  const draft = state.editor.draft;
  const staff = draft.staff[0];
  const art = draft.news.find((n) => !n.archived) ?? draft.news[0];
  await page.goto(`${BASE}/?tool=site`);
  await page.waitForSelector(".cms-visual-editor");
  const { staffProfilePath } = await import("../directory-helpers.mjs");
  for (const [label, path, expectText] of [["staff", staffProfilePath(staff), staff.name], ["news", art.path, art.title]]) {
    await openPreview(page);
    const dlg = page.locator('[role="dialog"][aria-label="Private parent preview"]');
    // inject an in-preview anchor to the record's real public path; the preview's own click handler resolves it
    await dlg.locator(".cms-parent-preview-page").evaluate((el, p) => { const a = document.createElement("a"); a.href = p; a.id = "__probe"; a.textContent = "probe"; el.appendChild(a); }, path);
    await dlg.locator("#__probe").evaluate((a) => a.click());
    await page.waitForTimeout(300);
    await page.click('[data-testid="preview-edit-this-page"]');
    if (label === "news") {
      // blog posts are edited on the Blog posts screen
      await page.waitForSelector('[data-testid="blog-edit"]');
      const title = await page.inputValue('[data-testid="blog-title"]');
      note(`${label}: ${path} -> blog editor title "${title}"`);
      expect(title.includes(expectText.slice(0, 12)), `${label}: expected "${expectText}", blog editor shows "${title}"`);
      continue;
    }
    await page.waitForSelector('[data-testid="sections-editor"] .ProseMirror');
    const picked = await page.locator('[data-testid="select-visual-content"] option:checked').textContent();
    const heading = await page.locator(".cb-page-head h1").first().textContent();
    note(`${label}: ${path} -> picker "${picked}", canvas heading "${heading}"`);
    expect(picked.includes(expectText.slice(0, 12)), `${label}: expected "${expectText}", picker shows "${picked}"`);
  }
});

await run("F4f", "4-edit-this-page", "Back to editing / Escape still close preview; unsaved draft edits visible in preview", async ({ page, state }) => {
  await openCanvas(page, "Independent School");
  const h1 = page.locator('h1[aria-label="Page headline"]');
  await h1.click(); await page.keyboard.press("Control+A"); await page.keyboard.type("Preview Sees This"); await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Preview as a parent" }).first().click();
  const dlg = page.locator('[role="dialog"][aria-label="Private parent preview"]');
  await dlg.locator("h1", { hasText: "Preview Sees This" }).waitFor({ timeout: 5000 });
  await page.keyboard.press("Escape");
  await dlg.waitFor({ state: "detached", timeout: 3000 });
});

// ---------------------------------------------------------------- landing heading + photo caption
await run("H1", "landing-heading", "Admin landing heading is exactly 'What do you want to do?' (old wording gone)", async ({ page, shot }) => {
  await page.goto(`${BASE}/`);
  await page.waitForSelector(".cms-home-choices");
  const h1s = await page.$$eval(".cms-home h1, h1", (els) => els.map((e) => e.textContent));
  expect(h1s.length === 1 && h1s[0] === "What do you want to do?", `h1: ${JSON.stringify(h1s)}`);
  expect((await page.getByText("What would you like to update?").count()) === 0, "old heading still present");
  await shot("landing-heading");
});

const captionInput = (page) => page.locator('[data-testid="imagechip-caption"]');
const phase = (md) => md.split("\n\n")[1];
const GEESE = "(/api/media/files/fixture-geese.svg";
const publishAndView = async (page, state, path) => {
  await page.getByRole("button", { name: "Publish changes" }).click();
  await page.waitForTimeout(1500);
  expect(state.publishes.length === 1, `publish calls: ${state.publishes.length}`);
  await page.goto(`${BASE}/?view=public&path=${encodeURIComponent(path)}`);
  await page.waitForSelector(".cb-page");
};

await run("C1", "caption", "Photo chip shows Caption next to the description, plus Replace photo and Remove photo", async ({ page, shot }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  const alt = await page.locator('[data-testid="imagechip-alt"]').boundingBox();
  const cap = await captionInput(page).boundingBox();
  expect(cap, "caption field missing");
  expect(Math.abs(alt.y - cap.y) < 4 && cap.x > alt.x, `caption not beside description: alt ${JSON.stringify(alt)} caption ${JSON.stringify(cap)}`);
  expect((await captionInput(page).inputValue()) === "", "caption should start empty");
  await page.locator('[data-testid="imagechip-replace"]').waitFor({ state: "visible" });
  await page.locator('[data-testid="imagechip-remove"]').waitFor({ state: "visible" });
  await shot("photo-chip-caption");
});

await run("C2", "caption", "Caption typed then field loses focus -> autosaved to draft as image title", async ({ page, state }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await captionInput(page).fill("Geese by the pond");
  await captionInput(page).blur();
  const c = await nextDraft(state, 0);
  expect(phase(pageMd(c, IS)) === `![Fixture geese family]${GEESE} "Geese by the pond")`, `saved: ${phase(pageMd(c, IS))}`);
});

await run("C3", "caption", "Caption typed then Save Draft clicked directly (field still focused) -> saved", async ({ page, state }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await captionInput(page).fill("Straight to save");
  await saveDraftClick(page);
  expect(phase(pageMd(lastDraft(state), IS)).includes('"Straight to save"'), `saved: ${lastDraft(state) ? phase(pageMd(lastDraft(state), IS)) : "no draft"}`);
});

await run("C4", "caption", "Caption persists: reselect photo, switch page and back, and reload editor after Save Draft", async ({ page, state }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await captionInput(page).fill("Remember me");
  await captionInput(page).blur();
  await blur(page);
  await clickPhoto(page, "fixture-geese");
  expect((await captionInput(page).inputValue()) === "Remember me", "caption not shown when photo reselected");
  await blur(page);
  await switchPageAndBack(page, "Our Beliefs", "Independent School");
  await clickPhoto(page, "fixture-geese");
  expect((await captionInput(page).inputValue()) === "Remember me", "caption lost after switching pages");
  await saveDraftClick(page);
  expect(phase(pageMd(lastDraft(state), IS)).includes('"Remember me"'), "not in saved draft");
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  expect((await captionInput(page).inputValue()) === "Remember me", "caption lost after reloading editor from saved draft");
});

await run("C5", "caption", "Caption survives description edits and photo replacement; clearing it removes the title", async ({ page, state }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await captionInput(page).fill("Keep this caption"); await captionInput(page).blur();
  await editAlt(page);
  await uploadReplace(page);
  await saveDraftClick(page);
  expect(phase(pageMd(lastDraft(state), IS)) === '![Uploaded replacement description](/api/media/files/fixture-replacement-1.svg "Keep this caption")', `saved: ${phase(pageMd(lastDraft(state), IS))}`);
  await captionInput(page).fill(""); await captionInput(page).blur();
  await saveDraftClick(page);
  expect(phase(pageMd(lastDraft(state), IS)) === "![Uploaded replacement description](/api/media/files/fixture-replacement-1.svg)", `after clear: ${phase(pageMd(lastDraft(state), IS))}`);
});

await run("C6", "caption", "Parent preview shows the caption under the photo; no caption element when empty", async ({ page, shot }) => {
  await openCanvas(page, "Independent School");
  await getPreview(page);
  expect((await page.locator(".cms-parent-preview-page .chess-caption").count()) === 0 && (await page.locator(".cms-parent-preview-page .chess-figure").count()) === 0, "caption markup present with no caption");
  await page.keyboard.press("Escape");
  await clickPhoto(page, "fixture-geese");
  await captionInput(page).fill("Preview caption");
  await captionInput(page).blur();
  await getPreview(page);
  const cap = page.locator(".cms-parent-preview-page .chess-figure .chess-caption");
  expect((await cap.textContent()) === "Preview caption", "caption not shown in preview");
  const order = await page.evaluate(() => { const f = document.querySelector(".cms-parent-preview-page .chess-figure"); const i = f.querySelector("img").getBoundingClientRect(); const c = f.querySelector(".chess-caption").getBoundingClientRect(); return { imgBottom: i.bottom, capTop: c.top }; });
  expect(order.capTop >= order.imgBottom - 1, `caption not under photo: ${JSON.stringify(order)}`);
  await shot("preview-caption");
});

await run("C7", "caption", "Public page after Publish shows the caption under the photo (richText path)", async ({ page, state, shot }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await captionInput(page).fill("Public caption text");
  await publishAndView(page, state, IS);
  expect((await page.locator(".chess-figure .chess-caption").textContent()) === "Public caption text", "caption not on public page");
  expect((await page.locator(".chess-figure img").getAttribute("alt")) === "Fixture geese family", "alt lost");
  expect((await page.locator(".chess-figure img").getAttribute("title")) === null, "raw title attribute leaked as tooltip");
  await shot("public-caption");
});

await run("C8", "caption", "Public page with NO caption shows no caption element or wrapper (richText path)", async ({ page, state }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await editAlt(page);
  await publishAndView(page, state, IS);
  expect((await page.locator(".chess-prose img[src*='fixture-geese']").count()) === 1, "photo missing on public page");
  expect((await page.locator(".chess-caption").count()) === 0 && (await page.locator(".chess-figure").count()) === 0, "caption markup rendered for an empty caption");
});

await run("C9", "caption", "Caption from stored markdown renders on the public page without any editing (markdown path)", async ({ page }) => {
  await page.goto(`${BASE}/?view=public&path=${encodeURIComponent("/about/foundation")}`);
  await page.waitForSelector(".cb-page");
  // A page's first stand-alone photo line is shown as the page's lead photo; its caption goes in a figcaption.
  expect((await page.locator(".cb-page-image .chess-caption").textContent()) === "Caption from stored markdown", "caption not rendered from markdown title");
  expect((await page.locator(".cb-page-image img").getAttribute("src")) === "/api/media/files/fixture-captioned.svg", `lead photo src polluted by caption: ${await page.locator(".cb-page-image img").getAttribute("src")}`);
  await page.goto(`${BASE}/?view=public&path=${encodeURIComponent(IS)}`);
  await page.waitForSelector(".cb-page");
  expect((await page.locator(".chess-caption").count()) === 0, "uncaptioned photo shows a caption");
});

await run("C10", "caption", "Caption with quotes, ampersand and parentheses round-trips and is escaped on the public page", async ({ page, state }) => {
  const tricky = 'Our "best" day & (more) <b>x</b>';
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await captionInput(page).fill(tricky); await captionInput(page).blur();
  await saveDraftClick(page);
  const shown = await captionInput(page).inputValue();
  expect(shown === `Our 'best' day & (more) <b>x</b>`, `editor field shows: ${shown}`);
  await publishAndView(page, state, IS);
  // double quotes are stored as apostrophes (they would end the markdown title); everything else is kept
  const expected = `Our 'best' day & (more) <b>x</b>`;
  expect((await page.locator(".chess-figure .chess-caption").textContent()) === expected, `inline caption: ${await page.locator(".chess-figure .chess-caption").textContent()}`);
  expect((await page.locator(".chess-caption").count()) === 1 && (await page.locator(".cb-page img[src*=\"fixture-geese\"]").count()) === 1, "caption or photo not rendered exactly once");
  expect((await page.locator(".chess-caption b").count()) === 0, "caption HTML was not escaped");
});

await run("C12", "caption", "Real clicks: edit description, then click Caption field -> chip stays open; both saved", async ({ page, state }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await page.locator('[data-testid="imagechip-alt"]').fill("Real click description");
  await captionInput(page).click();
  expect((await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "imagechip-caption", "caption field did not receive focus (chip closed after description lost focus)");
  await page.keyboard.type("Real click caption");
  await page.locator('[data-testid="imagechip-alt"]').click();
  expect(await page.locator('[data-testid="imagechip-replace"]').isVisible(), "chip closed after caption lost focus");
  await saveDraftClick(page);
  expect(phase(pageMd(lastDraft(state), IS)) === `![Real click description]${GEESE} "Real click caption")`, `saved: ${phase(pageMd(lastDraft(state), IS))}`);
});

await run("C13", "caption", "Chip stays open after upload-replace so the caption can still be edited", async ({ page, state }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await uploadReplace(page);
  await captionInput(page).fill("After replace"); await captionInput(page).blur();
  await saveDraftClick(page);
  expect(phase(pageMd(lastDraft(state), IS)).includes('fixture-replacement-1.svg "After replace")'), `saved: ${phase(pageMd(lastDraft(state), IS))}`);
});

await run("C11", "caption", "Caption works for a photo inside a stored-markdown page opened in the editor (existing title loads into chip)", async ({ page, state }) => {
  await openCanvas(page, "Our Foundation");
  await clickPhoto(page, "fixture-captioned");
  expect((await captionInput(page).inputValue()) === "Caption from stored markdown", "stored caption not loaded into chip");
  await captionInput(page).fill("Edited stored caption"); await captionInput(page).blur();
  const c = await nextDraft(state, 0);
  expect(pageMd(c, "/about/foundation").startsWith('![Fixture captioned photo](/api/media/files/fixture-captioned.svg "Edited stored caption")'), `saved: ${pageMd(c, "/about/foundation")}`);
});

// ---------------------------------------------------------------- duplicate photo on the public page
// A page edited in the visual editor stores BOTH `blocks[].props.richText` (rendered by the public page) and a
// markdown mirror `page.markdown`. The public page also lifts the first stand-alone photo line of the mirror out
// as a lead photo, so the same photo used to render twice. Each photo must render exactly once.
const PHOTO = "/api/media/files/fixture-geese.svg";
const OTHER = "/api/media/files/fixture-other.svg";
const legacyBlocks = (richHtml, markdown, edited) => ({ root: { props: {} }, zones: {}, content: [{ type: "LegacyMarkdown", props: { id: "legacy-1", markdown, originalMarkdown: markdown, richText: richHtml, richTextEdited: edited } }] });
const seedSavedPage = (state, path, { mirror, rich, edited = false }) => {
  for (const side of ["draft", "published"]) {
    state.editor[side].pages = state.editor[side].pages.map((p) => p.path === path ? { ...p, markdown: mirror, blocks: rich === null ? undefined : legacyBlocks(rich, mirror, edited) } : p);
  }
};
const countPhotos = (page, src = "fixture-geese") => page.locator(`.cb-page img[src*="${src}"]`).count();
const viewPublic = async (page, path) => { await page.goto(`${BASE}/?view=public&path=${encodeURIComponent(path)}`); await page.waitForSelector(".cb-page"); };

await run("D1", "duplicate-photo", "Page edited in the visual editor and published shows its photo exactly once", async ({ page, state, shot }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await editAlt(page);
  await publishAndView(page, state, IS);
  const n = await countPhotos(page);
  await shot("public-after-edit");
  expect(n === 1, `photo rendered ${n} times on the public page`);
});

await run("D2", "duplicate-photo", "Captioned photo on an edited page: one photo and one caption on the public page", async ({ page, state }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await captionInput(page).fill("Only once please");
  await publishAndView(page, state, IS);
  const photos = await countPhotos(page), caps = await page.locator(".chess-caption").count();
  expect(photos === 1 && caps === 1, `photos: ${photos}, captions: ${caps}`);
});

await run("D3", "duplicate-photo", "Parent preview of an edited page shows the photo exactly once", async ({ page }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await editAlt(page);
  await getPreview(page);
  const n = await page.locator('.cms-parent-preview-page .cb-page img[src*="fixture-geese"]').count();
  expect(n === 1, `photo rendered ${n} times in the parent preview`);
});

await run("D4", "duplicate-photo", "Page never edited in the visual editor (markdown only) shows its photo exactly once", async ({ page }) => {
  await viewPublic(page, IS);
  const n = await countPhotos(page);
  expect(n === 1, `photo rendered ${n} times`);
});

await run("D5", "duplicate-photo", "ALREADY-SAVED content (mirror + richText both hold the photo, richTextEdited=false) renders it once", async ({ page, state }) => {
  const mirror = `![Saved](${PHOTO})\n\nSaved body text.`;
  seedSavedPage(state, IS, { mirror, rich: `<p><img src="${PHOTO}" alt="Saved"></p><p>Saved body text.</p>`, edited: false });
  await viewPublic(page, IS);
  expect((await countPhotos(page)) === 1, `photo rendered ${await countPhotos(page)} times`);
  expect((await page.getByText("Saved body text.").count()) === 1, "body text duplicated or missing");
});

await run("D6", "duplicate-photo", "ALREADY-SAVED content edited in the editor (richTextEdited=true) renders the photo once", async ({ page, state }) => {
  const mirror = `![Saved](${PHOTO} "A caption")\n\nEdited body text.`;
  seedSavedPage(state, IS, { mirror, rich: `<p><img src="${PHOTO}" alt="Saved" title="A caption"></p><p>Edited body text.</p>`, edited: true });
  await viewPublic(page, IS);
  const photos = await countPhotos(page), caps = await page.locator(".chess-caption").count();
  expect(photos === 1 && caps === 1, `photos ${photos}, captions ${caps}`);
});

await run("D7", "duplicate-photo", "No photo is hidden: photo present only in the markdown mirror (not in richText) still shows once", async ({ page, state }) => {
  const mirror = `![Only in mirror](${PHOTO})\n\nBody.`;
  seedSavedPage(state, IS, { mirror, rich: "<p>Body.</p>", edited: false });
  await viewPublic(page, IS);
  expect((await countPhotos(page)) === 1, `photo rendered ${await countPhotos(page)} times`);
});

await run("D8", "duplicate-photo", "Two different photos (lead in mirror, another inline in richText) both show, once each", async ({ page, state }) => {
  const mirror = `![Lead](${PHOTO})\n\nBody with inline photo ![Inline](${OTHER}) here.`;
  seedSavedPage(state, IS, { mirror, rich: `<p>Body with inline photo <img src="${OTHER}" alt="Inline"> here.</p>`, edited: true });
  await viewPublic(page, IS);
  const a = await countPhotos(page), b = await countPhotos(page, "fixture-other");
  expect(a === 1 && b === 1, `lead photo ${a}x, inline photo ${b}x`);
});

await run("D9", "duplicate-photo", "Public page for a photo-less saved page and the Our Beliefs page are unaffected", async ({ page }) => {
  await viewPublic(page, "/about/beliefs");
  expect((await countPhotos(page, "fixture-nodesc")) === 1, "beliefs photo count changed");
});

// Server render / SEO: the same public components render in Node. Needs the SSR bundle from `vite build`.
const ssrBundle = new URL("../dist/server/entry-server.js", import.meta.url);
const ssrHtml = async (content, path) => {
  const { renderSite } = await import(ssrBundle.href + `?t=${Date.now()}`);
  const { renderPage } = await import("../seo-render.mjs");
  const out = await renderPage('<html><head><title>x</title></head><body><div id="root"></div></body></html>', path, content, "", renderSite);
  expect(out.status === 200, `SSR status ${out.status} for ${path}`);
  return out.html.split('<div id="root">')[1].split('<script id="chess-content"')[0];
};
const imgCount = (html, src) => (html.match(new RegExp(`<img[^>]+src="[^"]*${src}`, "g")) ?? []).length;

await run("S1", "duplicate-photo", "SSR/SEO render: edited page (richText + mirror) has its photo exactly once", async ({ state }) => {
  const mirror = `![Saved](${PHOTO})\n\nSaved body text.`;
  seedSavedPage(state, IS, { mirror, rich: `<p><img src="${PHOTO}" alt="Saved"></p><p>Saved body text.</p>`, edited: true });
  const html = await ssrHtml(state.editor.published, IS);
  expect(imgCount(html, "fixture-geese") === 1, `SSR rendered the photo ${imgCount(html, "fixture-geese")} times`);
});
await run("S2", "duplicate-photo", "SSR/SEO render: markdown-only page has its photo exactly once, with caption once", async ({ state }) => {
  seedSavedPage(state, IS, { mirror: `![Lead](${PHOTO} "SSR caption")\n\nBody.`, rich: null });
  const html = await ssrHtml(state.editor.published, IS);
  expect(imgCount(html, "fixture-geese") === 1 && (html.match(/SSR caption/g) ?? []).length === 1, `photos ${imgCount(html, "fixture-geese")}, captions ${(html.match(/SSR caption/g) ?? []).length}`);
});
await run("S3", "duplicate-photo", "SSR/SEO render: photo only in the mirror is still rendered once (nothing hidden)", async ({ state }) => {
  seedSavedPage(state, IS, { mirror: `![Only in mirror](${PHOTO})\n\nBody.`, rich: "<p>Body.</p>", edited: false });
  const html = await ssrHtml(state.editor.published, IS);
  expect(imgCount(html, "fixture-geese") === 1, `SSR rendered the photo ${imgCount(html, "fixture-geese")} times`);
});
await run("S4", "duplicate-photo", "SSR/SEO render of the draft saved by the real editor flow has the photo once", async ({ page, state }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await editAlt(page);
  await publishAndView(page, state, IS);
  const html = await ssrHtml(state.editor.published, IS);
  expect(imgCount(html, "fixture-geese") === 1, `SSR rendered the photo ${imgCount(html, "fixture-geese")} times`);
});

// ---------------------------------------------------------------- blog posts
const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const openBlog = async (page) => { await page.goto(`${BASE}/?tool=site&tab=news`); await page.waitForSelector('[data-testid="blog-list"]'); };
const newPost = async (page) => { await openBlog(page); await page.click('[data-testid="blog-new"]'); await page.waitForSelector('[data-testid="blog-edit"]'); };
const postsOf = (state) => state.editor.draft.news;
const blk = (p) => JSON.stringify(p.blocks ?? null);
const rootHtml = (html) => html.split('<div id="root">')[1].split('<script id="chess-content"')[0];
const findPost = (state, pred) => postsOf(state).find(pred);
const waitFor = async (fn, msg, ms = 9000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out: ${msg}`); await new Promise((r) => setTimeout(r, 120)); } };
const bodyEditor = (page) => page.locator('[aria-label="Post text"]').first();
const typeBody = async (page, text) => { await bodyEditor(page).click(); await page.keyboard.type(text, { delay: 5 }); };
const addBlock = async (page, id, nth = null) => {
  const menus = page.locator('[data-testid^="insert-menu-"]');
  const target = nth === null ? menus.last() : menus.nth(nth);
  await target.click();
  await page.locator(`[data-testid="insert-${id}"]`).click();
};
// A newly added text block takes the keyboard focus once its editor is ready; wait for that before typing.
const typeInNewBlock = async (page, text, ...more) => {
  await page.waitForFunction(() => document.activeElement?.classList.contains("ProseMirror") && !(document.activeElement.textContent ?? "").trim(), null, { timeout: 8000 });
  await page.keyboard.type(text);
  for (const [key, next] of more) { await page.keyboard.press(key); await page.keyboard.type(next); }
};
const writePost = async (page, state, { title = "Spring Open House Recap", summary = "A short look back at the day.", author = "Office Staff", body = "Thank you to every family who joined us." } = {}) => {
  await page.fill('[data-testid="blog-title"]', title);
  await page.locator('[data-testid="blog-title"]').blur();
  if (summary) await page.fill('[data-testid="blog-summary"]', summary);
  if (author) await page.fill('[data-testid="blog-author"]', author);
  if (body) await typeBody(page, body);
  await waitFor(() => findPost(state, (p) => p.title === title && (!body || p.markdown.includes(body))), "post saved to the draft");
  return findPost(state, (p) => p.title === title);
};
const publishPost = async (page, state) => {
  await page.click('[data-testid="blog-publish"]');
  await page.click('[data-testid="confirm-publish-confirm"]');
  await waitFor(() => state.publishes.length > 0 && page.locator('[data-testid="blog-status"]').textContent().then((t) => t.trim() === "Published").catch(() => false), "publish completed");
};
const viewPost = async (page, path) => { await viewPublic(page, path); };
const uploadCover = async (page, alt = "A smiling family at the open house") => {
  const cover = page.locator('section[aria-label="Cover photo"]');
  await cover.locator('[data-testid="input-photo-file"]').setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: PNG });
  await cover.locator('[data-testid="input-photo-alt"]').fill(alt);
  await cover.locator('[data-testid="button-upload-photo"]').click();
  await page.waitForSelector('[data-testid="blog-cover-alt"]');
};

await run("B1", "blog", "Landing 'Write a blog post' opens a brand-new post (title empty, date today, Draft); reload does not make another", async ({ page, state, shot }) => {
  await page.goto(`${BASE}/`);
  await page.click('[data-testid="choose-news"]');
  await page.waitForSelector('[data-testid="blog-edit"]');
  expect((await page.inputValue('[data-testid="blog-title"]')) === "", "title should start empty");
  expect((await page.inputValue('[data-testid="blog-date"]')) === todayLocal(), "date should default to today");
  expect(((await page.locator('[data-testid="blog-status"]').textContent()) ?? "").trim() === "Draft", "should start as Draft");
  expect(!new URL(page.url()).searchParams.has("new"), "?new=1 should be removed from the address");
  await waitFor(() => postsOf(state).filter((p) => p.draft).length === 1, "exactly one new draft saved");
  await shot("new-post");
  await page.reload();
  await openBlog(page);
  await page.waitForTimeout(1500);
  expect(postsOf(state).filter((p) => p.draft).length <= 1, "reload created another post");
});

await run("B2", "blog", "Write a post (title, summary, author, body): autosaves to the private draft as a draft post with a generated address", async ({ page, state, shot }) => {
  await newPost(page);
  const post = await writePost(page, state);
  expect(post.draft === true && post.date === todayLocal() && post.summary === "A short look back at the day." && post.author === "Office Staff", `post fields: ${JSON.stringify({ d: post.draft, date: post.date, s: post.summary, a: post.author })}`);
  expect(post.path === `/news/${todayLocal().split("-")[0]}/${Number(todayLocal().split("-")[1])}/${Number(todayLocal().split("-")[2])}/spring-open-house-recap`, `address: ${post.path}`);
  expect(JSON.stringify(post.blocks).includes("Thank you to every family"), "body not stored in blocks");
  expect(((await page.locator('[data-testid="blog-saved"]').textContent()) ?? "").length > 0, "no saved indicator");
  await shot("writing");
});

await run("B3", "blog", "A draft post is private: not in the published content, the public list, or reachable on the public site", async ({ page, state }) => {
  await newPost(page);
  const post = await writePost(page, state);
  await page.click('[data-testid="blog-save"]');
  await page.waitForTimeout(800);
  expect(!state.editor.published.news.some((p) => p.path === post.path), "draft leaked into the published content");
  await viewPublic(page, "/news");
  expect((await page.getByText("Spring Open House Recap").count()) === 0, "draft shown in the public list");
  await page.goto(`${BASE}/?view=public&path=${encodeURIComponent(post.path)}`);
  await page.waitForTimeout(800);
  expect((await page.locator(".cb-post").count()) === 0, "draft reachable on the public post page");
});

await run("B4", "blog", "Preview as a parent shows the draft post (with draft tag, summary, byline); Edit this page returns to it", async ({ page, state, shot }) => {
  await newPost(page);
  const post = await writePost(page, state);
  await page.click('[data-testid="blog-preview"]');
  const dlg = page.locator('[role="dialog"][aria-label="Private parent preview"]');
  await dlg.waitFor();
  await dlg.locator("h1", { hasText: "Spring Open House Recap" }).waitFor();
  expect((await dlg.locator('[data-testid="post-summary"]').textContent()) === "A short look back at the day.", "summary missing in preview");
  expect(((await dlg.locator('[data-testid="post-byline"]').textContent()) ?? "").includes("By Office Staff"), "byline missing");
  expect((await dlg.locator('[data-testid="post-draft-tag"]').count()) === 1, "draft tag missing");
  await dlg.getByText("Thank you to every family").first().waitFor();
  await shot("preview-draft");
  await page.click('[data-testid="preview-edit-this-page"]');
  await page.waitForSelector('[data-testid="blog-edit"]');
  expect((await page.inputValue('[data-testid="blog-title"]')) === "Spring Open House Recap", "did not return to the same post");
  // the draft post is not listed on the previewed news list
  await page.click('[data-testid="blog-preview"]');
  await dlg.locator("select").selectOption("/news");
  expect((await dlg.getByText("Spring Open House Recap").count()) === 0, "draft post listed in the previewed /news list");
});

await run("B5", "blog", "Publish is blocked with plain-language reasons: no title, empty post, cover photo without description", async ({ page, state }) => {
  await newPost(page);
  await page.click('[data-testid="blog-publish"]');
  const issues = page.locator('[data-testid="blog-issues"]');
  await issues.waitFor();
  const text = (await issues.textContent()) ?? "";
  expect(text.includes("Give the post a title") && text.includes("Write something"), `issues: ${text}`);
  expect(state.publishes.length === 0 && (await page.locator('[data-testid="confirm-publish"]').count()) === 0, "should not open the confirmation");
  await page.fill('[data-testid="blog-title"]', "Needs a description");
  await typeBody(page, "Some words.");
  await uploadCover(page, "temporary");
  await page.fill('[data-testid="blog-cover-alt"]', "");
  await page.click('[data-testid="blog-publish"]');
  expect((((await page.locator('[data-testid="blog-issues"]').textContent()) ?? "").includes("Describe the cover photo")), "cover alt issue missing");
});

await run("B6", "blog", "Publish asks for confirmation; Cancel changes nothing; confirming publishes the post (and warns about other saved changes)", async ({ page, state, shot }) => {
  state.editor.draft.pages = state.editor.draft.pages.map((p) => p.path === IS ? { ...p, description: "Changed but not published" } : p);
  await newPost(page);
  await writePost(page, state);
  await page.click('[data-testid="blog-publish"]');
  const dlg = page.locator('[data-testid="confirm-publish"]');
  await dlg.waitFor();
  expect(((await dlg.textContent()) ?? "").includes("Spring Open House Recap"), "dialog should name the post");
  expect((await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "confirm-publish-cancel", "Cancel should have focus first");
  expect(((await page.locator('[data-testid="confirm-other-changes"]').textContent()) ?? "").includes("pages"), "should warn that other saved changes (pages) are also waiting");
  await shot("confirm-publish");
  await page.keyboard.press("Escape");
  await dlg.waitFor({ state: "detached" });
  expect(state.publishes.length === 0, "Escape/cancel must not publish");
  await page.click('[data-testid="blog-publish"]');
  await page.click('[data-testid="confirm-publish-cancel"]');
  expect(state.publishes.length === 0, "Cancel must not publish");
  await page.click('[data-testid="blog-publish"]');
  await page.click('[data-testid="confirm-publish-confirm"]');
  await waitFor(() => state.publishes.length === 1, "publish request");
  const live = state.editor.published.news.find((p) => p.title === "Spring Open House Recap");
  expect(live && live.draft === false, `published copy: ${JSON.stringify(live && { d: live.draft })}`);
  await waitFor(async () => ((await page.locator('[data-testid="blog-status"]').textContent()) ?? "").trim() === "Published", "status shows Published");
});

await run("B7", "blog", "Published post: top of the public /news list (newest first) with summary, and its own page with title, byline, summary, body", async ({ page, state, shot }) => {
  await newPost(page);
  const post = await writePost(page, state);
  await publishPost(page, state);
  const live = state.editor.published.news.find((p) => p.title === "Spring Open House Recap");
  await viewPublic(page, "/news");
  const first = page.locator('[data-testid="link-news-entry-0"]');
  expect((await first.textContent()) === "Spring Open House Recap", `first card: ${await first.textContent()}`);
  expect((await page.getByText("A short look back at the day.").count()) === 1, "summary missing from the list card");
  await shot("public-list");
  await viewPost(page, live.path);
  expect((await page.locator("h1").first().textContent()) === "Spring Open House Recap", "title");
  expect(((await page.locator('[data-testid="post-byline"]').textContent()) ?? "").includes("By Office Staff"), "byline");
  expect((await page.locator('[data-testid="post-summary"]').textContent()) === "A short look back at the day.", "summary");
  expect((await page.getByText("Thank you to every family who joined us.").count()) === 1, "body text should appear once");
  expect((await page.locator('[data-testid="post-draft-tag"]').count()) === 0, "no draft tag on a published post");
  await shot("public-post");
});

await run("B8", "blog", "Cover photo: upload (mock) with description and caption; shown once with caption on the public post and as a card thumbnail", async ({ page, state, shot }) => {
  await newPost(page);
  await writePost(page, state);
  await uploadCover(page, "Families at the open house");
  await page.fill('[data-testid="blog-cover-caption"]', "Our newest families");
  await waitFor(() => findPost(state, (p) => p.coverImage && p.coverAlt === "Families at the open house" && p.coverCaption === "Our newest families"), "cover saved");
  await shot("cover-set");
  await publishPost(page, state);
  const live = state.editor.published.news.find((p) => p.title === "Spring Open House Recap");
  await viewPost(page, live.path);
  expect((await page.locator('[data-testid="post-cover"] img').count()) === 1 && (await page.locator(".cb-page img[src*='fixture-replacement']").count()) === 1, "cover photo should render exactly once");
  expect((await page.locator('[data-testid="post-cover"] figcaption').textContent()) === "Our newest families", "caption");
  expect((await page.locator('[data-testid="post-cover"] img').getAttribute("alt")) === "Families at the open house", "alt");
  await viewPublic(page, "/news");
  expect((await page.locator(".cb-card-cover img").count()) === 1, "card thumbnail missing");
});

await run("B9", "blog", "Edit a published post: status shows edits are not live; 'Publish changes' sends them; public updates", async ({ page, state }) => {
  await newPost(page);
  await writePost(page, state);
  await publishPost(page, state);
  await page.fill('[data-testid="blog-summary"]', "A new summary after publishing.");
  await waitFor(async () => ((await page.locator('[data-testid="blog-status"]').textContent()) ?? "").includes("edits not live"), "status shows pending edits");
  expect(state.editor.published.news.find((p) => p.title === "Spring Open House Recap").summary === "A short look back at the day.", "live copy changed before publishing");
  expect(((await page.locator('[data-testid="blog-publish"]').textContent()) ?? "").includes("Publish changes"), "button should say Publish changes");
  await page.click('[data-testid="blog-publish"]');
  await page.click('[data-testid="confirm-publish-confirm"]');
  await waitFor(() => state.editor.published.news.find((p) => p.title === "Spring Open House Recap")?.summary === "A new summary after publishing.", "live summary updated");
  const live = state.editor.published.news.find((p) => p.title === "Spring Open House Recap");
  await viewPost(page, live.path);
  expect((await page.locator('[data-testid="post-summary"]').textContent()) === "A new summary after publishing.", "public summary");
});

await run("B10", "blog", "Edit from the list: Edit opens the post with its saved text; list shows Draft / Published status", async ({ page, state }) => {
  await newPost(page);
  await writePost(page, state);
  await publishPost(page, state);
  await page.click('[data-testid="blog-back"]');
  await page.waitForSelector('[data-testid="blog-list"]');
  const row = page.locator('[data-testid="blog-row"]', { hasText: "Spring Open House Recap" });
  expect((await row.getAttribute("data-status")) === "live", "row should show Published");
  await row.locator('[data-testid="blog-row-edit"]').click();
  await page.waitForSelector('[data-testid="blog-edit"]');
  expect((await page.inputValue('[data-testid="blog-title"]')) === "Spring Open House Recap", "title");
  await bodyEditor(page).waitFor();
  expect((((await bodyEditor(page).textContent()) ?? "").includes("Thank you to every family")), "body text did not load");
});

await run("B11", "blog", "Unpublish (confirmed): removed from the public site and published content, kept as a draft with its text", async ({ page, state }) => {
  await newPost(page);
  await writePost(page, state);
  await publishPost(page, state);
  const path = state.editor.published.news.find((p) => p.title === "Spring Open House Recap").path;
  await page.click('[data-testid="blog-unpublish"]');
  await page.click('[data-testid="confirm-unpublish-cancel"]');
  expect(state.editor.published.news.some((p) => p.path === path), "cancel must keep the post live");
  await page.click('[data-testid="blog-unpublish"]');
  await page.click('[data-testid="confirm-unpublish-confirm"]');
  await waitFor(() => !state.editor.published.news.some((p) => p.path === path), "removed from published");
  const kept = findPost(state, (p) => p.path === path);
  expect(kept && kept.draft === true && kept.markdown.includes("Thank you to every family"), "should remain as a draft with its text");
  await viewPublic(page, "/news");
  expect((await page.getByText("Spring Open House Recap").count()) === 0, "still listed publicly");
  expect(state.publishes.length === 2, `publish calls: ${state.publishes.length}`);
});

await run("B12", "blog", "Delete a draft (confirmed): gone from the list without publishing; Cancel keeps it", async ({ page, state }) => {
  await newPost(page);
  await writePost(page, state);
  await page.click('[data-testid="blog-back"]');
  const row = page.locator('[data-testid="blog-row"]', { hasText: "Spring Open House Recap" });
  await row.locator('[data-testid="blog-row-delete"]').click();
  await page.click('[data-testid="confirm-delete-cancel"]');
  expect((await row.count()) === 1, "cancel should keep the post");
  await row.locator('[data-testid="blog-row-delete"]').click();
  expect(((await page.locator('[data-testid="confirm-delete"]').textContent()) ?? "").includes("will be deleted"), "dialog text");
  await page.click('[data-testid="confirm-delete-confirm"]');
  await waitFor(() => !findPost(state, (p) => p.title === "Spring Open House Recap"), "deleted from the draft");
  expect((await page.locator('[data-testid="blog-row"]', { hasText: "Spring Open House Recap" }).count()) === 0, "still listed");
  expect(state.publishes.length === 0, "deleting a draft must not publish");
});

await run("B13", "blog", "Delete a live post (confirmed) removes it from the website right away", async ({ page, state }) => {
  await newPost(page);
  await writePost(page, state);
  await publishPost(page, state);
  const path = state.editor.published.news.find((p) => p.title === "Spring Open House Recap").path;
  await page.click('[data-testid="blog-delete"]');
  expect(((await page.locator('[data-testid="confirm-delete"]').textContent()) ?? "").includes("disappear from the website"), "dialog should say it leaves the website");
  await page.click('[data-testid="confirm-delete-confirm"]');
  await waitFor(() => !state.editor.published.news.some((p) => p.path === path) && !findPost(state, (p) => p.path === path), "deleted everywhere");
  await page.waitForSelector('[data-testid="blog-list"]');
});

await run("B14", "blog", "An untouched new post is discarded when you go back; list filters show Drafts and Published", async ({ page, state }) => {
  await newPost(page);
  await page.click('[data-testid="blog-back"]');
  await page.waitForSelector('[data-testid="blog-list"]');
  expect(postsOf(state).filter((p) => p.draft).length === 0, "blank post should be discarded");
  await newPost(page); await writePost(page, state, { title: "Draft one" });
  await page.click('[data-testid="blog-back"]');
  await page.click('[data-testid="blog-filter-draft"]');
  expect((await page.locator('[data-testid="blog-row"]').count()) === 1, "drafts filter");
  await page.click('[data-testid="blog-filter-published"]');
  expect((await page.locator('[data-testid="blog-row"]', { hasText: "Draft one" }).count()) === 0, "published filter must hide drafts");
  expect((await page.locator('[data-testid="blog-row"]').count()) > 0, "imported published posts should list");
  await page.click('[data-testid="blog-filter-all"]');
  await page.locator('[data-testid="blog-show-more"]').click();
});

// ---- blocks
await run("B15", "blog-blocks", "The '+' menu lists every block by friendly name, works by keyboard, and Escape closes it", async ({ page, shot }) => {
  await newPost(page);
  const trigger = page.locator('[data-testid="insert-menu-1"]');
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.locator('[role="menu"][aria-label="Choose what to add"]');
  await menu.waitFor();
  const names = await menu.locator("strong").allTextContents();
  const want = ["Text", "Heading", "Bulleted list", "Numbered list", "Quote", "Photo", "Photo with text", "Photo gallery", "Pull quote", "Callout box", "Button", "Video (YouTube)", "Table", "Divider"];
  expect(JSON.stringify(names) === JSON.stringify(want), `menu names: ${JSON.stringify(names)}`);
  expect((await menu.locator("small").count()) === want.length, "each item needs a description");
  await menu.scrollIntoViewIfNeeded();
  await shot("plus-menu");
  expect((await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "insert-text", "first item should have focus");
  await page.keyboard.press("ArrowDown");
  expect((await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "insert-heading", "ArrowDown should move");
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "detached" });
  expect((await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "insert-menu-1", "focus should return to the + button");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForSelector('[data-testid="sections-editor"] [data-block-type="LegacyMarkdown"] h2');
});

const publishAndOpen = async (page, state, title) => {
  await publishPost(page, state);
  const live = state.editor.published.news.find((p) => p.title === title);
  await viewPost(page, live.path);
  return live;
};

await run("B16", "blog-blocks", "Text blocks: heading, bulleted list, numbered list, quote, bold/italic/underline render nicely on the public post", async ({ page, state, shot }) => {
  await newPost(page);
  await page.fill('[data-testid="blog-title"]', "Text blocks"); await page.locator('[data-testid="blog-title"]').blur();
  await typeBody(page, "Plain paragraph with ");
  await page.keyboard.press("Control+b"); await page.keyboard.type("bold"); await page.keyboard.press("Control+b");
  await page.keyboard.type(" and "); await page.keyboard.press("Control+i"); await page.keyboard.type("italic"); await page.keyboard.press("Control+i");
  await page.keyboard.type(" and "); await page.keyboard.press("Control+u"); await page.keyboard.type("underlined"); await page.keyboard.press("Control+u");
  await addBlock(page, "heading"); await typeInNewBlock(page, "A big heading");
  await addBlock(page, "bullets"); await typeInNewBlock(page, "First bullet", ["Enter", "Second bullet"]);
  await addBlock(page, "numbers"); await typeInNewBlock(page, "Step one", ["Enter", "Step two"]);
  await addBlock(page, "quote"); await typeInNewBlock(page, "Wise words here");
  await waitFor(() => findPost(state, (p) => blk(p).includes("Wise words here")), "all text blocks saved");
  await shot("text-blocks-editor");
  await publishAndOpen(page, state, "Text blocks");
  const body = page.locator(".cb-post-body");
  const checks = { bold: await body.locator("strong", { hasText: "bold" }).count(), italic: await body.locator("em", { hasText: "italic" }).count(), under: await body.locator("u", { hasText: "underlined" }).count(),
    h2: await body.locator("h2", { hasText: "A big heading" }).count(), ul: await body.locator("ul li").count(), ol: await body.locator("ol li").count(), quote: await body.locator("blockquote", { hasText: "Wise words here" }).count() };
  expect(checks.bold === 1 && checks.italic === 1 && checks.under === 1 && checks.h2 === 1 && checks.ul === 2 && checks.ol === 2 && checks.quote === 1, `public render: ${JSON.stringify(checks)}`);
  await shot("text-blocks-public");
});

await run("B16b", "blog-blocks", "Links in the post body: select words, add a link to a school page via the toolbar; it renders as a link on the public post", async ({ page, state }) => {
  await newPost(page);
  await page.fill('[data-testid="blog-title"]', "Link post"); await page.locator('[data-testid="blog-title"]').blur();
  await typeBody(page, "Visit our programs page today.");
  await bodyEditor(page).click({ clickCount: 3 });
  await page.locator('[role="toolbar"][aria-label="Text formatting"] button[title="Add or edit link"]').click();
  await page.selectOption('[data-testid="section-link-page"]', "/programs/academy");
  await page.getByRole("button", { name: "Add link" }).click();
  await waitFor(() => findPost(state, (p) => p.markdown.includes("](/programs/academy)")), "link saved");
  await publishAndOpen(page, state, "Link post");
  expect((await page.locator('.cb-post-body a[href="/programs/academy"]').count()) === 1, "link on public post");
});

await run("B17", "blog-blocks", "Photo block: upload, description + caption + position; renders once with caption and alignment class", async ({ page, state, shot }) => {
  await newPost(page);
  await page.fill('[data-testid="blog-title"]', "Photo post"); await page.locator('[data-testid="blog-title"]').blur();
  await typeBody(page, "Words before the photo.");
  await addBlock(page, "photo");
  const block = page.locator('[data-testid="post-block-photo"]');
  await block.locator('[data-testid="input-photo-file"]').setInputFiles({ name: "p.png", mimeType: "image/png", buffer: PNG });
  await block.locator('[data-testid="input-photo-alt"]').fill("Children reading outside");
  await block.locator('[data-testid="button-upload-photo"]').click();
  await block.locator('[data-testid="post-photo-caption"]').fill("Reading time");
  await block.locator('[data-testid="post-photo-align"]').selectOption("right");
  await waitFor(() => findPost(state, (p) => blk(p).includes('"align":"right"') && blk(p).includes("Reading time")), "photo block saved");
  await shot("photo-block-editor");
  await publishAndOpen(page, state, "Photo post");
  const fig = page.locator(".cb-post-body figure.puck-photo");
  expect((await fig.count()) === 1 && (await fig.getAttribute("class")).includes("is-right"), "figure with alignment class");
  expect((await fig.locator("figcaption").textContent()) === "Reading time" && (await fig.locator("img").getAttribute("alt")) === "Children reading outside", "caption/alt");
  expect((await page.locator(".cb-post img[src*='fixture-replacement']").count()) === 1, "photo should show once");
});

await run("B18", "blog-blocks", "Photo gallery: add two photos with descriptions and captions; grid renders each photo once", async ({ page, state, shot }) => {
  await newPost(page);
  await page.fill('[data-testid="blog-title"]', "Gallery post"); await page.locator('[data-testid="blog-title"]').blur();
  await typeBody(page, "Gallery below.");
  await addBlock(page, "gallery");
  const block = page.locator('[data-testid="post-block-gallery"]');
  for (const [n, alt] of [[0, "First picture"], [1, "Second picture"]]) {
    await block.locator('[data-testid="input-photo-file"]').setInputFiles({ name: `g${n}.png`, mimeType: "image/png", buffer: PNG });
    await block.locator('[data-testid="input-photo-alt"]').fill(alt);
    await block.locator('[data-testid="button-upload-photo"]').click();
    await block.locator(`[data-testid="gallery-alt-${n}"]`).waitFor();
  }
  await block.locator('[data-testid="gallery-caption-1"]').fill("Second caption");
  await waitFor(() => findPost(state, (p) => blk(p).includes("Second caption")), "gallery saved");
  await shot("gallery-editor");
  await publishAndOpen(page, state, "Gallery post");
  expect((await page.locator(".cb-post-body ul.puck-gallery li").count()) === 2, "two gallery items");
  expect((await page.locator(".cb-post-body ul.puck-gallery figcaption").allTextContents()).join("|") === "Second caption", "captions only where set");
  expect((await page.locator(".cb-post img[src*='fixture-replacement']").count()) === 2, "each gallery photo once");
  await shot("gallery-public");
});

await run("B19", "blog-blocks", "Photo with text, callout, button, pull quote, table, divider all render on the public post", async ({ page, state, shot }) => {
  await newPost(page);
  await page.fill('[data-testid="blog-title"]', "Mixed blocks"); await page.locator('[data-testid="blog-title"]').blur();
  await typeBody(page, "Intro words.");
  await addBlock(page, "callout");
  await page.fill('[data-testid="callout-heading"]', "Don't miss this"); await page.fill('[data-testid="callout-text"]', "Open house is Friday.\n\nBring a friend.");
  await page.selectOption('[data-testid="callout-tone"]', "highlight");
  await addBlock(page, "button");
  await page.fill('[data-testid="button-heading"]', "Ready to visit?"); await page.fill('[data-testid="button-label"]', "Schedule a visit");
  await page.selectOption('[data-testid="button-page"]', "__web"); await page.fill('[data-testid="button-url"]', "https://example.org/visit");
  await addBlock(page, "pullquote");
  await page.fill('[data-testid="pullquote-text"]', "Best decision we made."); await page.fill('[data-testid="pullquote-attribution"]', "A CHESS parent");
  await addBlock(page, "table");
  const table = page.locator(".cms-table-block");
  await table.locator('input[aria-label="Column 1 heading"]').fill("Day"); await table.locator('input[aria-label="Column 2 heading"]').fill("Time");
  await table.locator('input[aria-label^="Row 1,"]').first().fill("Monday"); await table.locator('input[aria-label^="Row 1,"]').nth(1).fill("9:00");
  await addBlock(page, "divider");
  await addBlock(page, "photoText");
  const pt = page.locator(".cms-photo-block");
  await pt.locator('[data-testid="input-photo-file"]').setInputFiles({ name: "pt.png", mimeType: "image/png", buffer: PNG });
  await pt.locator('[data-testid="input-photo-alt"]').fill("A classroom");
  await pt.locator('[data-testid="button-upload-photo"]').click();
  await waitFor(() => findPost(state, (p) => { const j = blk(p); return j.includes("A classroom") && j.includes("Monday") && j.includes("A CHESS parent") && j.includes("example.org/visit") && j.includes("Bring a friend"); }), "all blocks saved");
  await shot("mixed-editor");
  await publishAndOpen(page, state, "Mixed blocks");
  const body = page.locator(".cb-post-body");
  const got = {
    callout: await body.locator("aside.puck-callout.is-highlight strong", { hasText: "Don't miss this" }).count(), calloutParas: await body.locator("aside.puck-callout p").count(),
    button: await body.locator('.puck-family-step-actions a[href="https://example.org/visit"]', { hasText: "Schedule a visit" }).count(),
    quote: await body.locator("blockquote.puck-testimonial cite", { hasText: "A CHESS parent" }).count(),
    table: await body.locator("table th:text-is(\"Day\")").count(), cell: await body.locator("table td", { hasText: "9:00" }).count(),
    hr: await body.locator("hr.puck-divider").count(), photoText: await body.locator("section.puck-photo-text img[alt='A classroom']").count(),
  };
  expect(got.callout === 1 && got.calloutParas === 2 && got.button === 1 && got.quote === 1 && got.table === 1 && got.cell === 1 && got.hr === 1 && got.photoText === 1, `public render: ${JSON.stringify(got)}`);
  expect((await page.locator(".cb-post img[src*='fixture-replacement']").count()) === 1, "photo-with-text photo once");
  await shot("mixed-public");
});

await run("B20", "blog-blocks", "YouTube video: watch / short / embed links convert to the safe embed; bad links show a message; renders as one iframe", async ({ page, state, shot }) => {
  await newPost(page);
  await page.fill('[data-testid="blog-title"]', "Video post"); await page.locator('[data-testid="blog-title"]').blur();
  await typeBody(page, "Watch this.");
  await addBlock(page, "video");
  const url = page.locator('[data-testid="video-url"]');
  await url.fill("not a video");
  await page.locator('[data-testid="video-error"]').waitFor();
  for (const input of ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10", "https://youtu.be/dQw4w9WgXcQ", "https://www.youtube.com/shorts/dQw4w9WgXcQ", "https://www.youtube.com/embed/dQw4w9WgXcQ"]) {
    await url.fill(input);
    await waitFor(() => findPost(state, (p) => blk(p).includes('"url":"https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"')), `converted ${input}`);
    expect((await page.locator('[data-testid="video-error"]').count()) === 0, `error shown for ${input}`);
  }
  await page.fill('[data-testid="video-caption"]', "Our tour video");
  await shot("video-editor");
  await waitFor(() => findPost(state, (p) => blk(p).includes("Our tour video")), "caption saved");
  await publishAndOpen(page, state, "Video post");
  const frames = page.locator(".cb-post-body iframe");
  expect((await frames.count()) === 1 && (await frames.getAttribute("src")) === "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "one safe iframe");
  expect((await page.getByText("Our tour video").count()) === 1, "caption");
});

await run("B21", "blog-blocks", "Blocks can be moved and removed (with confirmation), and a post with only blocks still publishes", async ({ page, state }) => {
  await newPost(page);
  await page.fill('[data-testid="blog-title"]', "Blocks only"); await page.locator('[data-testid="blog-title"]').blur();
  await addBlock(page, "divider", 1);
  await addBlock(page, "callout");
  await page.fill('[data-testid="callout-heading"]', "Callout heading");
  await waitFor(() => findPost(state, (p) => blk(p).includes("Callout heading")), "saved");
  const order = async () => (await page.locator('[data-testid="sections-editor"] > .cms-section').evaluateAll((els) => els.map((e) => e.getAttribute("data-block-type"))));
  const before = await order();
  const calloutIndex = before.indexOf("Callout");
  await page.locator(`[data-testid="section-${calloutIndex}"] button[aria-label="Move section up"]`).click();
  expect((await order()).indexOf("Callout") === calloutIndex - 1, `move up: ${JSON.stringify(await order())}`);
  await page.locator(`[data-testid="delete-${calloutIndex - 1}"]`).click();
  await page.locator('[data-testid^="confirm-delete-"]').click();
  expect(!(await order()).includes("Callout"), "callout should be removed");
  await addBlock(page, "callout"); await page.fill('[data-testid="callout-heading"]', "Final callout");
  await waitFor(() => findPost(state, (p) => blk(p).includes("Final callout")), "saved again");
  await publishPost(page, state);
});

await run("B22", "blog-blocks", "Photo blocks need descriptions before publishing", async ({ page, state }) => {
  await newPost(page);
  await page.fill('[data-testid="blog-title"]', "Alt required"); await page.locator('[data-testid="blog-title"]').blur();
  await typeBody(page, "Words.");
  await addBlock(page, "photo");
  const block = page.locator('[data-testid="post-block-photo"]');
  await block.locator('[data-testid="input-photo-file"]').setInputFiles({ name: "p.png", mimeType: "image/png", buffer: PNG });
  await block.locator('[data-testid="input-photo-alt"]').fill("temp");
  await block.locator('[data-testid="button-upload-photo"]').click();
  await block.locator('[data-testid="post-photo-alt"]').fill("");
  await page.click('[data-testid="blog-publish"]');
  expect((((await page.locator('[data-testid="blog-issues"]').textContent()) ?? "").includes("Describe every photo")), "alt issue");
  expect(state.publishes.length === 0, "must not publish");
});

await run("B23", "blog", "Existing imported blog posts open in the editor with their text, and render once on the public site", async ({ page, state }) => {
  const legacy = state.editor.draft.news.find((p) => !p.archived && p.markdown.trim());
  await openBlog(page);
  await page.locator('[data-testid="blog-row"]', { hasText: legacy.title }).first().locator('[data-testid="blog-row-edit"]').click();
  await page.waitForSelector('[data-testid="blog-edit"]');
  expect((await page.inputValue('[data-testid="blog-title"]')) === legacy.title, "title");
  expect(((await page.locator('[data-testid="sections-editor"]').textContent()) ?? "").trim().length > 0 || (await page.locator('[data-testid="sections-editor"] img').count()) > 0, "legacy body should load into the editor");
  await viewPublic(page, legacy.path);
  expect((await page.locator(".cb-post h1").count()) === 1, "legacy post page renders");
});

await run("B24", "blog", "Mobile (phone width): list and editor fit the screen, with Publish reachable", async ({ page, state, shot }) => {
  await newPost(page);
  await writePost(page, state);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow <= 1, `editor overflows horizontally by ${overflow}px`);
  expect(await page.locator('[data-testid="blog-publish"]').isVisible(), "publish button hidden");
  await shot("mobile-editor");
  await page.click('[data-testid="blog-back"]');
  const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow2 <= 1, `list overflows horizontally by ${overflow2}px`);
  await shot("mobile-list");
}, { viewport: { width: 390, height: 800 } });

await run("B25", "blog", "Confirmation dialog is keyboard friendly: focus starts on Cancel, Tab stays inside, Escape closes", async ({ page, state }) => {
  await newPost(page);
  await writePost(page, state);
  await page.click('[data-testid="blog-delete"]');
  const dlg = page.locator('[data-testid="confirm-delete"]');
  await dlg.waitFor();
  expect((await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "confirm-delete-cancel", "focus on Cancel");
  await page.keyboard.press("Tab");
  expect((await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "confirm-delete-confirm", "Tab to the confirm button");
  await page.keyboard.press("Tab");
  expect((await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "confirm-delete-cancel", "Tab wraps inside the dialog");
  await page.keyboard.press("Escape");
  await dlg.waitFor({ state: "detached" });
});

// ---- SSR / SEO and server
const blogSsr = async (state, path) => {
  const { renderSite } = await import(ssrBundle.href + `?t=${Date.now()}`);
  const { renderPage, renderSitemap } = await import("../seo-render.mjs");
  const out = await renderPage('<html><head><title>x</title></head><body><div id="root"></div></body></html>', path, state.editor.published, "", renderSite);
  return { out, renderSitemap, content: state.editor.published };
};

await run("S5", "blog-ssr", "SSR/SEO: published post page has title, summary as description, canonical, indexable, every block once; sitemap lists it; list page lists it", async ({ page, state }) => {
  await newPost(page);
  await page.fill('[data-testid="blog-title"]', "SSR post"); await page.locator('[data-testid="blog-title"]').blur();
  await page.fill('[data-testid="blog-summary"]', "SSR summary for search engines.");
  await typeBody(page, "SSR body text.");
  await addBlock(page, "photo");
  const block = page.locator('[data-testid="post-block-photo"]');
  await block.locator('[data-testid="input-photo-file"]').setInputFiles({ name: "p.png", mimeType: "image/png", buffer: PNG });
  await block.locator('[data-testid="input-photo-alt"]').fill("SSR photo");
  await block.locator('[data-testid="button-upload-photo"]').click();
  await block.locator('[data-testid="post-photo-caption"]').fill("SSR caption");
  await addBlock(page, "callout"); await page.fill('[data-testid="callout-heading"]', "SSR callout");
  await addBlock(page, "video"); await page.fill('[data-testid="video-url"]', "https://youtu.be/dQw4w9WgXcQ");
  await addBlock(page, "divider");
  await waitFor(() => findPost(state, (p) => { const j = blk(p); return j.includes("SSR caption") && j.includes("SSR callout") && j.includes("youtube-nocookie") && j.includes("Divider"); }), "saved");
  await uploadCover(page, "SSR cover");
  await publishPost(page, state);
  const live = state.editor.published.news.find((p) => p.title === "SSR post");
  const { out, renderSitemap, content } = await blogSsr(state, live.path);
  expect(out.status === 200, `status ${out.status}`);
  const html = out.html;
  expect(html.includes("<title>SSR post | CHESS Blog</title>") && html.includes('content="SSR summary for search engines."') && html.includes(`rel="canonical" href="https://heritage-site-builder.replit.app${live.path}"`) && html.includes('content="index,follow"'), "title/description/canonical/robots");
  const root = html.split('<div id="root">')[1].split('<script id="chess-content"')[0];
  const count = (re) => (root.match(re) ?? []).length;
  expect(count(/SSR body text\./g) === 1 && count(/SSR caption/g) === 1 && count(/SSR callout/g) === 1 && count(/puck-divider/g) === 1 && count(/youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/g) === 1, `block counts in SSR html`);
  expect(count(/<img[^>]+fixture-replacement-1/g) === 1 && count(/<img[^>]+fixture-replacement-2/g) === 1, "cover and block photo each once in SSR");
  expect(renderSitemap(content).includes(`<loc>https://heritage-site-builder.replit.app${live.path}</loc>`), "sitemap should list the post");
  const list = await blogSsr(state, "/news");
  expect(list.out.html.includes("SSR post") && list.out.html.includes("SSR summary for search engines."), "news list page SSR lists the post with its summary");
});

await run("S6", "blog-ssr", "SSR/SEO: a draft post never renders (404) and is not in the sitemap, even if it were present in the content", async ({ page, state }) => {
  await newPost(page);
  await writePost(page, state, { title: "Secret draft" });
  const draftPost = findPost(state, (p) => p.title === "Secret draft");
  // worst case: a draft somehow present in the content handed to the renderer
  const leaked = { ...state.editor.published, news: [...state.editor.published.news, draftPost] };
  const { renderSite } = await import(ssrBundle.href + `?t=${Date.now()}`);
  const { renderPage, renderSitemap } = await import("../seo-render.mjs");
  const out = await renderPage('<html><head><title>x</title></head><body><div id="root"></div></body></html>', draftPost.path, leaked, "", renderSite);
  expect(out.status === 404, `draft status ${out.status}`);
  expect(!renderSitemap(leaked).includes(draftPost.path), "draft in sitemap");
  const list = await renderPage('<html><head><title>x</title></head><body><div id="root"></div></body></html>', "/news", leaked, "", renderSite);
  expect(!rootHtml(list.html).includes("Secret draft"), "draft in the SSR news list");
});

await run("S7", "blog-server", "Server helper withoutDraftPosts drops drafts, keeps everything else, and is a no-op without drafts (run under node)", async () => {
  const { execFileSync } = await import("node:child_process");
  const script = `
    import { withoutDraftPosts } from ${JSON.stringify(new URL("../../api-server/src/lib/draft-posts.ts", import.meta.url).href)};
    const a = { x: 1, news: [{ path: "/a", draft: true }, { path: "/b" }, { path: "/c", draft: false }] };
    const r = withoutDraftPosts(a);
    if (JSON.stringify(r.news.map((p) => p.path)) !== '["/b","/c"]') throw new Error("filter: " + JSON.stringify(r));
    if (r.x !== 1 || a.news.length !== 3) throw new Error("must not mutate or lose fields");
    const none = { news: [{ path: "/b" }] };
    if (withoutDraftPosts(none) !== none) throw new Error("no-op should return the same object");
    if (withoutDraftPosts({ pages: [] }).pages.length !== 0) throw new Error("no news key");
    console.log("ok");`;
  const output = execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], { encoding: "utf8" });
  expect(output.trim().endsWith("ok"), `helper output: ${output}`);
});

// ---------------------------------------------------------------- tables in page text
const TUITION = "/admissions/tuition";
const waitUntil = async (fn, msg, ms = 9000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out: ${msg}`); await new Promise((r) => setTimeout(r, 120)); } };
const pageRecord = (state, path) => state.editor.draft.pages.find((p) => p.path === path);
const originalMd = (path) => buildFixtureForTests().draft.pages.find((p) => p.path === path).markdown;
const cell = (page, r, c, scope = null) => (scope ?? page).locator(`input[data-cell="${r}-${c}"]`);
const tableNth = (page, n) => page.locator('[data-testid="doc-table"]').nth(n);
const sequence = (root) => root.evaluate((el) => [...el.querySelectorAll("h2, table")].map((n) => (n.tagName === "TABLE" ? "TABLE" : n.textContent.trim())));
const openPage = async (page, label) => { await openCanvas(page, label); await page.waitForSelector('[data-testid="doc-table"], [data-testid="sections-editor"]'); };

await run("T1", "tables", "Tuition page: both charts appear in the editor, in the same place and order as on the public page, with their cell text", async ({ page, shot }) => {
  await viewPublic(page, TUITION);
  const publicOrder = await sequence(page.locator(".cb-page .cb-prose-wrap").first());
  await openPage(page, "Tuition & Fees");
  expect((await page.locator('[data-testid="doc-table"]').count()) === 2, "expected two charts in the editor");
  const editorOrder = await sequence(page.locator('[data-testid="sections-editor"]'));
  expect(JSON.stringify(editorOrder) === JSON.stringify(publicOrder), `order differs. editor ${JSON.stringify(editorOrder)} vs public ${JSON.stringify(publicOrder)}`);
  expect((await cell(page, 0, 0, tableNth(page, 0)).inputValue()) === "One-day sample class" && (await cell(page, 1, 1, tableNth(page, 0)).inputValue()) === "$2 per sample", "first chart cells");
  expect((await tableNth(page, 1).locator('input[data-cell="h-1"]').inputValue()) === "Amount", "second chart header");
  await shot("tuition-editor");
});

await run("T2", "tables", "Editing one cell saves the chart: only that cell changes, nothing else in the page is lost or duplicated", async ({ page, state, shot }) => {
  await openPage(page, "Tuition & Fees");
  await cell(page, 0, 1, tableNth(page, 0)).fill("$9 per sample");
  await waitUntil(() => pageRecord(state, TUITION).markdown.includes("$9 per sample"), "edit saved");
  const saved = pageRecord(state, TUITION).markdown;
  const norm = (t) => t.replace(/\n{2,}/g, "\n").replace(/^- /gm, "* ").trim();
  expect(norm(saved).includes(norm("| Sample class | Sample price |\n| --- | --- |\n| One-day sample class | $9 per sample |\n| Two-day sample class | $2 per sample |")), `saved table: ${saved}`);
  expect(norm(saved).includes(norm("| Fee | Amount |\n| --- | --- |\n| Sample registration | $3 |\n| Sample materials | $4 |")), "other chart changed");
  expect((saved.match(/\| --- \| --- \|/g) ?? []).length === 2, "chart duplicated or dropped");
  expect(["Sample at a glance", "Sample Academy tuition", "Sample extra fees", "Classes meet for sample semesters.", "Closing sample paragraph.", "Pay in sample installments."].every((t) => saved.includes(t) && saved.split(t).length === 2), "text lost or duplicated");
  await shot("tuition-edited");
});

await run("T3", "tables", "Add a row, remove a row, add a column and remove a column; the saved chart matches what the editor shows", async ({ page, state }) => {
  await openPage(page, "Tuition & Fees");
  const t = tableNth(page, 0);
  await t.getByTestId("table-add-row").click();
  await cell(page, 2, 0, t).fill("Three-day sample class");
  await cell(page, 2, 1, t).fill("$3 per sample");
  await t.getByTestId("table-remove-row-0").click();
  await t.getByTestId("table-add-col").click();
  await t.locator('input[data-cell="h-2"]').fill("Sample note");
  await cell(page, 0, 2, t).fill("busy");
  await waitUntil(() => pageRecord(state, TUITION).markdown.includes("Sample note"), "saved");
  let md = pageRecord(state, TUITION).markdown;
  expect(md.includes("| Sample class | Sample price | Sample note |\n| --- | --- | --- |\n| Two-day sample class | $2 per sample | busy |\n| Three-day sample class | $3 per sample |  |"), `after add/remove: ${md}`);
  expect(!md.includes("One-day sample class"), "removed row still present");
  await t.getByTestId("table-remove-col-1").click();
  await waitUntil(() => !pageRecord(state, TUITION).markdown.includes("Sample price"), "column removed");
  md = pageRecord(state, TUITION).markdown;
  expect(md.includes("| Sample class | Sample note |\n| --- | --- |\n| Two-day sample class | busy |\n| Three-day sample class |  |"), `after removing a column: ${md}`);
});

await run("T4", "tables", "Editing the heading and notes around a chart leaves the chart intact", async ({ page, state }) => {
  await openPage(page, "Tuition & Fees");
  const note = page.locator(".cms-section .ProseMirror p", { hasText: "Classes meet for sample semesters." });
  await note.click(); await page.keyboard.press("End"); await page.keyboard.type(" Updated note.");
  await page.mouse.click(5, 5);
  const head = page.locator(".cms-section .ProseMirror h2", { hasText: "Sample extra fees" });
  await head.click(); await page.keyboard.press("End"); await page.keyboard.type(" (updated)");
  await page.mouse.click(5, 5);
  await waitUntil(() => pageRecord(state, TUITION).markdown.includes("Updated note.") && pageRecord(state, TUITION).markdown.includes("(updated)"), "saved");
  const md = pageRecord(state, TUITION).markdown;
  expect((md.match(/\| --- \| --- \|/g) ?? []).length === 2, `charts: ${md}`);
  expect(md.includes("| Sample registration | $3 |") && md.includes("| Two-day sample class | $2 per sample |"), "chart rows changed");
  expect(md.includes("## Sample extra fees (updated)"), "heading edit");
});

await run("T5", "tables", "After publishing, the public page and the server render show each chart once, with the edited cell", async ({ page, state }) => {
  await openPage(page, "Tuition & Fees");
  await cell(page, 1, 1, tableNth(page, 0)).fill("$7 per sample");
  await waitUntil(() => pageRecord(state, TUITION).markdown.includes("$7 per sample"), "saved");
  await page.getByRole("button", { name: "Publish changes" }).click();
  await waitUntil(() => state.publishes.length === 1, "published");
  await viewPublic(page, TUITION);
  expect((await page.locator(".cb-page table").count()) === 2, `public tables: ${await page.locator(".cb-page table").count()}`);
  expect((await page.locator(".cb-page table td", { hasText: "$7 per sample" }).count()) === 1, "edited cell on the public page");
  expect((await page.locator('.cb-page .cb-table-wrap[role="region"]').count()) === 2, "tables should keep the scrollable wrapper");
  expect((await page.locator(".cb-page table th[scope='col']").first().textContent()) === "Sample class", "header cells");
  const html = await ssrHtml(state.editor.published, TUITION);
  expect((html.match(/<table\b/g) ?? []).length === 2 && html.includes("$7 per sample"), "SSR/SEO render tables");
});

await run("T6", "tables", "Pages nobody edits render exactly as before; opening a page in the editor and saving changes nothing", async ({ page, state }) => {
  await viewPublic(page, TUITION);
  const before = await page.locator(".cb-page").innerHTML();
  const beforeRecord = JSON.stringify(pageRecord(state, TUITION));
  await openPage(page, "Tuition & Fees");
  await tableNth(page, 0).locator("input").first().click();
  await page.mouse.click(5, 5);
  await page.click('[data-testid="button-save-site-content"]');
  await page.waitForTimeout(1200);
  expect(JSON.stringify(pageRecord(state, TUITION)) === beforeRecord, "opening and saving changed the page record");
  // editing a different page leaves the tuition page alone
  await openCanvas(page, "Independent School");
  const p = page.locator(".cms-section .ProseMirror p").first();
  await p.click(); await page.keyboard.press("End"); await page.keyboard.type(" extra");
  await page.mouse.click(5, 5);
  await page.waitForTimeout(1500);
  expect(JSON.stringify(pageRecord(state, TUITION)) === beforeRecord, "editing another page changed the tuition page");
  await viewPublic(page, TUITION);
  expect((await page.locator(".cb-page").innerHTML()) === before, "public page HTML changed");
});

await run("T7", "tables", "Cells with links, bold and italics keep them: shown as written, rendered on the public page, saved back unchanged", async ({ page, state }) => {
  await openPage(page, "Compare");
  const t = tableNth(page, 0);
  expect((await cell(page, 0, 0, t).inputValue()) === "[Sample school](/programs/independent-school)" && (await cell(page, 0, 1, t).inputValue()) === "**Home** families", "cells show their markdown");
  await cell(page, 1, 2, t).fill("[$5 per sample](/admissions/tuition)");
  await waitUntil(() => pageRecord(state, "/programs/compare").markdown.includes("$5 per sample"), "saved");
  const md = pageRecord(state, "/programs/compare").markdown;
  expect(md.includes("| [Sample school](/programs/independent-school) | **Home** families | [$1 per sample](/admissions/tuition) |"), `row 1 changed: ${md}`);
  expect(md.includes("| [Sample academy](/programs/academy) | *Classroom* families | [$5 per sample](/admissions/tuition) |"), `row 2: ${md}`);
  await page.getByRole("button", { name: "Publish changes" }).click();
  await waitUntil(() => state.publishes.length === 1, "published");
  await viewPublic(page, "/programs/compare");
  expect((await page.locator('.cb-page table a[href="/programs/independent-school"]').count()) === 1 && (await page.locator(".cb-page table strong", { hasText: "Home" }).count()) === 1 && (await page.locator(".cb-page table em", { hasText: "Classroom" }).count()) === 1, "links/bold/italics on the public page");
});

await run("T8", "tables", "A pipe typed in a cell is replaced so it cannot split the cell; keyboard: Tab moves across cells, Enter in the last row adds a row", async ({ page, state }) => {
  await openPage(page, "Tuition & Fees");
  const t = tableNth(page, 1);
  await cell(page, 0, 0, t).fill("A|B");
  expect((await cell(page, 0, 0, t).inputValue()) === "A/B", "pipe should be replaced");
  await cell(page, 0, 0, t).focus();
  await page.keyboard.press("Tab");
  expect((await page.evaluate(() => document.activeElement?.getAttribute("data-cell"))) === "0-1", "Tab should move to the next cell");
  await cell(page, 1, 1, t).focus();
  await page.keyboard.press("Enter");
  await waitUntil(async () => (await t.locator("tbody tr").count()) === 3, "Enter in the last row adds a row");
  await waitUntil(async () => (await page.evaluate(() => document.activeElement?.getAttribute("data-cell"))) === "2-1", "focus should move into the new row");
});

await run("T9", "tables", "Remove table asks first; removing it deletes only that chart", async ({ page, state }) => {
  await openPage(page, "Tuition & Fees");
  await tableNth(page, 1).getByTestId("table-remove").click();
  await tableNth(page, 1).getByRole("button", { name: "Keep" }).click();
  expect((await page.locator('[data-testid="doc-table"]').count()) === 2, "Keep should not remove");
  await tableNth(page, 1).getByTestId("table-remove").click();
  await tableNth(page, 1).getByTestId("table-remove-confirm").click();
  await waitUntil(() => !pageRecord(state, TUITION).markdown.includes("Sample registration"), "removed chart saved");
  const md = pageRecord(state, TUITION).markdown;
  expect(md.includes("| Two-day sample class | $2 per sample |") && md.includes("Closing sample paragraph."), "other content must remain");
});

await run("T10", "tables", "A saved page whose chart was flattened by the old editor gets its chart back (only when the flattened text matches exactly)", async ({ page, state }) => {
  const md = originalMd(TUITION);
  const sectionMd = md.split("## Sample extra fees")[0].split("## Sample Academy tuition")[1];
  const section = "## Sample Academy tuition" + sectionMd;
  const mk = (id, original, richText) => ({ type: "LegacyMarkdown", props: { id, markdown: original, originalMarkdown: original, richText, richTextEdited: true } });
  const blocks = { root: { props: {} }, zones: {}, content: [
    mk("section-0", section.trim(), "<h2>Sample Academy tuition</h2><p>Classes meet for sample semesters. Staff added this sentence.</p><p>Sample classSample priceOne-day sample class$1 per sampleTwo-day sample class$2 per sample</p>"),
  ] };
  state.editor.draft.pages = state.editor.draft.pages.map((p) => p.path === TUITION ? { ...p, blocks } : p);
  await openPage(page, "Tuition & Fees");
  expect((await page.locator('[data-testid="doc-table"]').count()) === 1, "chart should be restored");
  expect((await page.getByText("Sample classSample price").count()) === 0, "flattened text should be gone");
  expect((await page.getByText("Staff added this sentence.").count()) === 1, "the staff edit must be kept");
  expect((await cell(page, 1, 1, tableNth(page, 0)).inputValue()) === "$2 per sample", "restored cells");
  await cell(page, 0, 1, tableNth(page, 0)).fill("$8 per sample");
  await waitUntil(() => pageRecord(state, TUITION).markdown.includes("$8 per sample"), "saved");
  expect(pageRecord(state, TUITION).markdown.includes("Staff added this sentence."), "edit kept after save");
  // a section that does NOT match is left exactly as saved
  const odd = { root: { props: {} }, zones: {}, content: [mk("section-0", section.trim(), "<h2>Sample Academy tuition</h2><p>Sample classSample price (staff retyped this)</p>")] };
  state.editor.draft.pages = state.editor.draft.pages.map((p) => p.path === TUITION ? { ...p, blocks: odd } : p);
  await openPage(page, "Tuition & Fees");
  expect((await page.locator('[data-testid="doc-table"]').count()) === 0 && (await page.getByText("staff retyped this").count()) === 1, "non-matching text must be left alone");
});

await run("T11", "tables", "Office hours table on the Contact page survives an edit in the form the page reads (| Season / day | Hours |)", async ({ page, state }) => {
  await openPage(page, "Contact Us");
  await cell(page, 0, 1, tableNth(page, 0)).fill("2:00 to 3:00");
  await waitUntil(() => pageRecord(state, "/contact").markdown.includes("2:00 to 3:00"), "saved");
  const md = pageRecord(state, "/contact").markdown;
  expect(md.includes("## Office hours\n\n| Season / day | Hours |\n| --- | --- |\n| Sample season: Monday | 2:00 to 3:00 |\n| Sample season: Tuesday | Closed |") || md.includes("## Office hours\n| Season / day | Hours |\n| --- | --- |\n| Sample season: Monday | 2:00 to 3:00 |\n| Sample season: Tuesday | Closed |"), `office hours: ${md}`);
});

await run("T12", "tables", "Audit: for every page, staff bio, story and event, every table in the markdown shows up in the editor", async ({ page, state, note }) => {
  const d = state.editor.draft;
  const { marked } = await import("../node_modules/marked/lib/marked.esm.js");
  const records = [
    ...d.pages.filter((p) => !p.archived).map((p) => ({ key: `page:${d.pages.indexOf(p)}`, label: p.path, md: p.markdown })),
    ...d.staff.map((x, i) => ({ key: `staff:${i}`, label: `staff ${x.slug}`, md: x.bio })),
    ...d.news.filter((a) => !a.archived).map((a) => ({ key: `news:${d.news.indexOf(a)}`, label: a.path, md: a.markdown })),
    ...d.events.filter((a) => !a.archived).map((a) => ({ key: `events:${d.events.indexOf(a)}`, label: a.path, md: a.markdown })),
  ];
  await page.goto(`${BASE}/?tool=site`);
  await page.waitForSelector(".cms-visual-editor");
  await page.selectOption('[data-testid="select-visual-content"]', records[0].key);
  await page.click('[data-testid="toggle-page-settings"]');
  let withTables = 0; const missing = [];
  for (const r of records) {
    const expected = (marked(r.md || "", { async: false, gfm: true }).match(/<table\b/g) ?? []).length;
    if (!expected) continue;
    withTables += 1;
    await page.selectOption('[data-testid="select-visual-content"]', r.key);
    await page.waitForSelector('[data-testid="sections-editor"]');
    await page.waitForTimeout(80);
    const got = await page.locator('[data-testid="doc-table"]').count();
    if (got !== expected) missing.push(`${r.label}: markdown ${expected} / editor ${got}`);
  }
  note(`records with tables: ${withTables} of ${records.length}`);
  expect(withTables >= 3 && missing.length === 0, `tables missing from the editor: ${missing.join("; ")}`);
});

// ---------------------------------------------------------------- notes for built-in parts of a page
const partTest = async (page, state, label, mutate, expectIds, tab) => {
  if (mutate) mutate(state);
  await openCanvas(page, label);
  for (const id of expectIds) expect((await page.locator(`[data-testid="auto-part-${id}"]`).count()) === 1, `missing note for ${id}`);
  if (tab) {
    await page.locator(`[data-testid="auto-part-open-${tab}"]`).first().click();
    await page.waitForSelector(".cms-tabs");
    return true;
  }
};
await run("T13", "special-blocks", "Pages with built-in parts show a plain note where the part appears, with a button to where it is edited", async ({ page, state, shot }) => {
  await openCanvas(page, "Contact Us");
  await page.locator('[data-testid="auto-part-contact-auto"]').scrollIntoViewIfNeeded();
  expect((await page.locator('[data-testid="auto-part-contact-auto"]').count()) === 1, "missing note for the contact page");
  await shot("contact-note");
  await page.locator('[data-testid="auto-part-open-inquiries"]').click();
  await page.waitForSelector(".cms-tabs");
  expect((await page.locator(".cms-tabs-more-btn.is-active").first().textContent()).startsWith("Inquiries"), "button should open Inquiries");
});
await run("T14", "special-blocks", "Notes appear for the calendar, FAQ, staff directory, blog list, visit, overview, tuition and home pages (and not on ordinary pages)", async ({ page, state }) => {
  const addPage = (path, label, extra = {}) => state.editor.draft.pages.push({ path, label, title: label, description: "", markdown: "Some words.", kind: "content", ...extra });
  addPage("/faq", "Fixture FAQ"); addPage("/about/our-people", "Fixture People"); addPage("/parents/calendar", "Fixture Calendar", { documentPath: "x" }); addPage("/admissions/visit", "Fixture Visit");
  const cases = [["Fixture FAQ", ["faq-auto"]], ["Fixture People", ["people-auto"]], ["Fixture Calendar", ["calendar-events", "calendar-pdf"]], ["Fixture Visit", ["visit-auto"]], ["Tuition & Fees", ["tuition-faqs"]]];
  for (const [label, ids] of cases) {
    await openCanvas(page, label);
    for (const id of ids) expect((await page.locator(`[data-testid="auto-part-${id}"]`).count()) === 1, `${label}: missing note ${id}`);
  }
  await page.selectOption('[data-testid="select-visual-content"]', await page.$$eval('[data-testid="select-visual-content"] option', (os) => os.find((o) => o.textContent.includes("/programs —") || o.textContent.startsWith("Programs"))?.value));
  await page.waitForSelector('[data-testid="auto-part-overview-links"]');
  await page.selectOption('[data-testid="select-visual-content"]', await page.$$eval('[data-testid="select-visual-content"] option', (os) => os.find((o) => o.textContent.startsWith("Home page"))?.value));
  await page.waitForSelector('[data-testid="auto-part-home-hero"]');
  expect((await page.locator('[data-testid="auto-part-home-auto"]').count()) === 1, "home notes");
  await openCanvas(page, "Independent School");
  expect((await page.locator('[data-testid^="auto-part-"]').count()) === 0, "ordinary page should have no notes");
});

// ---------------------------------------------------------------- portal links (header, mobile menu, footer)
const PARENT_PORTAL = { label: "Payment/Account Portal", url: "https://app.praxischool.com/parent_login.php?s=1300" };
const STAFF_PORTAL = { label: "Faculty/Staff Portal", url: "https://app.praxischool.com/" };
const portalLink = (scope, portal) => scope.locator(`a[href="${portal.url}"]`, { hasText: portal.label });
const expectNewTab = async (link, what) => {
  expect((await link.getAttribute("target")) === "_blank", `${what}: should open in a new tab`);
  expect((((await link.getAttribute("rel")) ?? "").split(/\s+/).includes("noopener")), `${what}: rel should include noopener`);
};
const openChrome = async (page, path = "/") => { await page.goto(`${BASE}/?view=public&chrome=1&path=${encodeURIComponent(path)}`); await page.waitForSelector(".cb-footer"); };

await run("P1", "portals", "Desktop: 'Payment/Account Portal' is in the header utility bar and footer; 'Faculty/Staff Portal' is in the footer ONLY; exact addresses, new tab", async ({ page }) => {
  await openChrome(page);
  const head = page.locator('.cb-utility [data-testid="link-portal-parent-utility"]');
  expect((await head.count()) === 1 && (await head.isVisible()) && (await head.getAttribute("href")) === PARENT_PORTAL.url && ((await head.textContent()) ?? "").includes(PARENT_PORTAL.label), "parent portal in the header utility bar");
  await expectNewTab(head, "Payment/Account Portal (header)");
  for (const [name, portal] of [["parent", PARENT_PORTAL], ["staff", STAFF_PORTAL]]) {
    const foot = page.locator(`.cb-footer [data-testid="footer-portal-${name}"]`);
    expect((await foot.count()) === 1 && (await foot.isVisible()) && (await foot.getAttribute("href")) === portal.url && (await foot.textContent()) === portal.label, `${portal.label}: footer link`);
    await expectNewTab(foot, `${portal.label} (footer)`);
  }
  // the staff portal must not appear anywhere in the header, utility bar or menu
  expect((await page.locator(`header.cb-header a[href="${STAFF_PORTAL.url}"]`).count()) === 0, "Faculty/Staff Portal must not be in the header");
  expect((await page.locator("header.cb-header").getByText("Faculty/Staff Portal").count()) === 0, "Faculty/Staff Portal label must not be in the header");
  expect((await page.locator(".cb-contact-strip").getByText("Faculty/Staff Portal").count()) === 0, "not in the contact strip");
  expect((await page.locator(`a[href="${STAFF_PORTAL.url}"]`).count()) === 1, "exactly one Faculty/Staff Portal link on the page, in the footer");
  expect((await page.locator(".cb-utility, .cb-nav-actions, .cb-nav-mobile-extras, .cb-footer, .cb-contact-strip").getByText("Praxi Parent Portal").count()) === 0, "the old 'Praxi Parent Portal' label should be gone from the utility bar, menu buttons and footer (the Parents menu still lists the Praxi page by its own name)");
  await page.locator(".cb-header").screenshot({ path: `${SHOTS}/P1-header-desktop.png` });
  await page.locator("footer.cb-footer").scrollIntoViewIfNeeded();
  await page.locator("footer.cb-footer").screenshot({ path: `${SHOTS}/P1-footer-desktop.png` });
  await page.locator(".cb-contact-strip").screenshot({ path: `${SHOTS}/P1-contact-strip-desktop.png` });
});

await run("P2", "portals", "Mobile: 'Payment/Account Portal' is in the open menu and footer; 'Faculty/Staff Portal' is in the footer only", async ({ page }) => {
  await openChrome(page);
  expect(!(await page.locator(".cb-utility").isVisible()), "utility bar is hidden on phones");
  await page.click('[data-testid="button-mobile-navigation"]');
  const menuParent = page.locator('[data-testid="button-mobile-portal-parent"]');
  await menuParent.waitFor({ state: "visible" });
  expect((await menuParent.getAttribute("href")) === PARENT_PORTAL.url && ((await menuParent.textContent()) ?? "").includes(PARENT_PORTAL.label), "parent portal in the mobile menu");
  await expectNewTab(menuParent, "Payment/Account Portal (mobile menu)");
  expect((await page.locator('#cb-main-navigation').getByText("Faculty/Staff Portal").count()) === 0 && (await page.locator(`#cb-main-navigation a[href="${STAFF_PORTAL.url}"]`).count()) === 0, "Faculty/Staff Portal must not be in the mobile menu");
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/P2-menu-mobile.png` });
  await page.click('[data-testid="button-mobile-navigation"]');
  for (const [name, portal] of [["parent", PARENT_PORTAL], ["staff", STAFF_PORTAL]]) {
    const foot = page.locator(`.cb-footer [data-testid="footer-portal-${name}"]`);
    await foot.scrollIntoViewIfNeeded();
    expect((await foot.isVisible()) && (await foot.getAttribute("href")) === portal.url, `${portal.label}: footer link on mobile`);
    await expectNewTab(foot, `${portal.label} (footer, mobile)`);
  }
  await page.locator("footer.cb-footer").screenshot({ path: `${SHOTS}/P2-footer-mobile.png` });
  await page.locator(".cb-contact-strip").screenshot({ path: `${SHOTS}/P2-contact-strip-mobile.png` });
}, { viewport: { width: 390, height: 800 } });

await run("P3", "portals", "Server render: Faculty/Staff Portal appears once, in the footer; Payment/Account Portal in header, menu and footer; all new-tab with noopener", async ({ state }) => {
  const html = await ssrHtml(state.editor.published, "/");
  const anchorsFor = (portal) => [...html.matchAll(new RegExp(`<a[^>]*href="${portal.url.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&")}"[^>]*>`, "g"))].map((m) => m[0]);
  const staff = anchorsFor(STAFF_PORTAL), parent = anchorsFor(PARENT_PORTAL);
  expect(staff.length === 1 && staff[0].includes('data-testid="footer-portal-staff"'), `staff portal links in SSR: ${JSON.stringify(staff)}`);
  expect(parent.length >= 3, `parent portal links in SSR: ${parent.length}`);
  expect([...staff, ...parent].every((a) => a.includes('target="_blank"') && /rel="[^"]*noopener/.test(a)), "every portal link should open in a new tab with noopener");
  const headerHtml = html.split("<footer")[0];
  expect(!headerHtml.includes("Faculty/Staff Portal"), "no staff portal before the footer in the SSR html");
});

// ---------------------------------------------------------------- network hygiene
await run("N1", "isolation", "No request left the local harness; no unmocked API calls; no uncaught page errors across a full pass", async ({ page, state }) => {
  await openCanvas(page, "Independent School");
  await clickPhoto(page, "fixture-geese");
  await blur(page);
  const bad = state.blocked.filter((b) => !isFont(b));
  expect(bad.length === 0, `blocked/unmocked: ${bad.join(", ")}`);
  expect(!(state.pageErrors ?? []).length, `page errors: ${state.pageErrors}`);
});

await browser.close();
fs.writeFileSync(`${OUT}/test-results.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => r.status !== "PASS");
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);

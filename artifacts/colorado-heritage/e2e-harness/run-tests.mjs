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
await run("F3a", "3-admin-landing", "Landing shows exactly five plain-language tasks with descriptions + More hint", async ({ page, shot }) => {
  await page.goto(`${BASE}/`);
  await page.waitForSelector(".cms-home-choices");
  const cards = await page.$$eval(".cms-home-choices button", (bs) => bs.map((b) => [b.querySelector("strong")?.textContent, b.querySelector("span")?.textContent, b.getAttribute("data-testid")]));
  const want = ["Edit a page", "Post an announcement", "Add an event", "Update staff", "Upload a document"];
  expect(cards.length === 5, `expected 5 tasks, got ${cards.length}: ${JSON.stringify(cards)}`);
  expect(JSON.stringify(cards.map((c) => c[0])) === JSON.stringify(want), `task titles: ${JSON.stringify(cards)}`);
  expect(cards.every((c) => c[1] && c[1].length > 15), "a task lacks a description");
  expect((await page.locator('[data-testid="choose-more"]').count()) === 1, "More hint link missing");
  await shot("landing");
});

await run("F3b", "3-admin-landing", "Each of the five task cards opens the matching editor tab", async ({ page }) => {
  const map = { visual: "Edit pages", announcements: "Announcements", events: "Events", staff: "Faculty & staff", documents: "Documents" };
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

await run("F3d", "3-admin-landing", "Editor tab bar: five primary tabs + More menu with a description per item", async ({ page, shot }) => {
  await page.goto(`${BASE}/?tool=site`);
  await page.waitForSelector(".cms-tabs");
  const primary = await page.$$eval(".cms-tabs > button", (bs) => bs.map((b) => b.getAttribute("data-testid")));
  expect(JSON.stringify(primary) === JSON.stringify(["tab-visual", "tab-announcements", "tab-events", "tab-staff", "tab-documents"]), `primary tabs: ${primary}`);
  await page.click('[data-testid="tab-more"]');
  const items = await page.$$eval('.cms-tabs-more-menu [role="menuitem"]', (bs) => bs.map((b) => [b.getAttribute("data-testid"), b.querySelector("strong")?.textContent, b.querySelector(":scope > span")?.textContent]));
  expect(items.length === 6 && items.every((i) => i[2] && i[2].length > 10), `More menu items: ${JSON.stringify(items)}`);
  await shot("more-menu-open");
  await page.keyboard.press("Escape");
  expect((await page.locator(".cms-tabs-more-menu").count()) === 0, "Escape did not close More menu");
  await page.click('[data-testid="tab-more"]'); await page.mouse.click(5, 5);
  expect((await page.locator(".cms-tabs-more-menu").count()) === 0, "outside click did not close More menu");
});

await run("F3e", "3-admin-landing", "Every More item opens its tab, label shows on More button, tab renders without errors", async ({ page, state }) => {
  const more = { pages: "Pages", news: "News & blog", faqs: "FAQs", inquiries: "Inquiries", menu: "Menu links", home: "Home photo & settings" };
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
  const more = (await page.locator('[data-testid="tab-more"]').textContent()).trim();
  const picked = await page.locator('[data-testid="select-visual-content"] option:checked').count() ? await page.locator('[data-testid="select-visual-content"] option:checked').textContent() : "(visual editor not shown)";
  note(`/news -> More button "${more}", visual editor picker "${picked}"`);
  return { more, picked };
};

await run("F4d2", "4-edit-this-page", "Preview of /news WITH an unarchived kind=archive page record (seed) opens News tab", async ({ page, state, note }) => {
  expect(state.editor.draft.pages.some((p) => p.path === "/news"), "fixture should contain a /news page record");
  const { more } = await previewNews(page, note);
  expect(more.startsWith("News"), `Edit this page on /news did not open the News tab (More button: "${more}")`);
});

await run("F4d3", "4-edit-this-page", "Preview of /news with NO /news page record opens News tab", async ({ page, state, note }) => {
  state.editor.draft.pages = state.editor.draft.pages.filter((p) => p.path !== "/news");
  const { more } = await previewNews(page, note);
  expect(more.startsWith("News"), `More button: "${more}"`);
});

await run("F4d4", "4-edit-this-page", "Preview of /news WITH an archived:true /news page record opens News tab", async ({ page, state, note }) => {
  state.editor.draft.pages = state.editor.draft.pages.map((p) => p.path === "/news" ? { ...p, archived: true } : p);
  const { more } = await previewNews(page, note);
  expect(more.startsWith("News"), `More button: "${more}"`);
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
  await partTest(page, state, "Contact Us", null, ["contact-auto"], "inquiries");
  expect((await page.locator(".cms-tabs > button.is-active, .cms-tabs-more-btn.is-active").first().textContent()).startsWith("Inquiries"), "button should open Inquiries");
  await shot("contact-note");
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

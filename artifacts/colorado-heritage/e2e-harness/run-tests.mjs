// Isolated browser tests for the editor/single-canvas branch. Test-only; no source under
// ../src is modified. Requires the harness Vite server (vite.config.ts) on 127.0.0.1:5199.
import fs from "node:fs";
import { launch, newSession, BASE } from "./lib.mjs";

const OUT = process.env.OUT_DIR || "/opt/cursor/artifacts";
const SHOTS = `${OUT}/screenshots`;
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const isFont = (b) => b.includes("fonts.g") || b.includes("rsms.me/inter");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const browser = await launch();

async function run(id, feature, name, fn, opts) {
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
  expect((await page.locator(".cb-page-image .chess-caption").textContent()) === expected, `lead-photo caption: ${await page.locator(".cb-page-image .chess-caption").textContent()}`);
  expect((await page.locator(".cb-page-image img").getAttribute("src")) === "/api/media/files/fixture-geese.svg", "lead photo src polluted by caption");
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

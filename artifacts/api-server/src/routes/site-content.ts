import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { SaveSiteContentBody, GetSiteContentResponse } from "@workspace/api-zod";
import { db, siteContentTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { hasEditorAccess } from "./homepage";
import initialContent from "../data/initial-site-content.json";
import { mediaStorage, storePhoto } from "../lib/site-media";

const router: IRouter = Router();

export async function getSiteContent() {
  const [existing] = await db.select().from(siteContentTable).where(eq(siteContentTable.id, 1));
  if (existing) return { ...existing.content, revision: existing.revision };
  // Only initialize an empty database; never overwrite staff edits on restart.
  await db.insert(siteContentTable).values({ id: 1, revision: 1, content: initialContent })
    .onConflictDoNothing();
  const [record] = await db.select().from(siteContentTable).where(eq(siteContentTable.id, 1));
  return { ...record.content, revision: record.revision };
}

router.get("/site-content", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(GetSiteContentResponse.parse(await getSiteContent()));
});

router.put("/site-content", async (req, res) => {
  if (!getAuth(req).userId) { res.sendStatus(401); return; }
  if (!await hasEditorAccess(req)) { res.sendStatus(403); return; }
  const parsed = SaveSiteContentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const content = parsed.data;
  const paths = content.pages.map((page) => page.path);
  if (new Set(paths).size !== paths.length || paths.some((path) => path === "/" || !/^\/[a-z0-9/_-]*$/.test(path) || /^\/(?:admin|api|images|assets|documents)(?:\/|$)/.test(path))) {
    res.status(400).json({ error: "Pages require unique lowercase URL paths." }); return;
  }
  if (new Set(content.staff.map(person => person.slug)).size !== content.staff.length ||
      content.staff.some(person => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(person.slug))) {
    res.status(400).json({ error: "Staff members require unique lowercase URL names." }); return;
  }
  if (content.staff.some((person) => person.photo && !person.alt.trim())) {
    res.status(400).json({ error: "Every staff photo requires alt text." }); return;
  }
  if (content.navigation.length !== 6 || new Set(content.navigation.map((item) => item.label)).size !== 6) {
    res.status(400).json({ error: "The menu must contain six unique sections." }); return;
  }
  const [record] = await db.update(siteContentTable).set({
    content, revision: sql`${siteContentTable.revision} + 1`, updatedAt: new Date(),
  }).where(and(eq(siteContentTable.id, 1), eq(siteContentTable.revision, content.revision))).returning();
  if (!record) { res.status(409).json({ error: "Another editor saved changes. Reload before saving." }); return; }
  res.json(GetSiteContentResponse.parse({ ...record.content, revision: record.revision }));
});

router.post("/media/upload", async (req, res) => {
  if (!getAuth(req).userId) { res.sendStatus(401); return; }
  if (!await hasEditorAccess(req)) { res.sendStatus(403); return; }
  const { data, alt } = req.body ?? {};
  if (typeof alt !== "string" || !alt.trim() || alt.length > 300 || typeof data !== "string") {
    res.status(400).json({ error: "A photo and descriptive alt text are required." }); return;
  }
  const match = data.match(/^data:image\/(?:webp|png|jpeg);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) { res.status(400).json({ error: "Use a JPG, PNG, or WebP photo." }); return; }
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length > 2_000_000) { res.status(413).json({ error: "Please choose a photo under 2 MB after resizing." }); return; }
  try { res.json({ url: await storePhoto(bytes), alt: alt.trim() }); }
  catch (error) { req.log.error({ err: error }, "Photo upload failed"); res.status(422).json({ error: "The photo could not be processed or stored. Try another image." }); }
});

router.get("/media/files/:key", async (req, res) => {
  if (!/^[a-f0-9]{64}\.webp$/.test(req.params.key)) { res.sendStatus(404); return; }
  const result = await mediaStorage.downloadAsBytes(`website/${req.params.key}`);
  if (!result.ok) { res.sendStatus(result.error.statusCode === 404 ? 404 : 503); return; }
  res.set({ "Content-Type": "image/webp", "Cache-Control": "public,max-age=31536000,immutable" });
  res.send(result.value[0]);
});

export default router;

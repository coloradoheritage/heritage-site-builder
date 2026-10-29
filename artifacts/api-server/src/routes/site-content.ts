import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { SaveSiteContentBody, GetSiteContentResponse } from "@workspace/api-zod";
import { db, siteContentTable, contentBackupsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { hasEditorAccess } from "./homepage";
import initialContent from "../data/initial-site-content.json";
import { mediaStorage, storePhoto } from "../lib/site-media";
import { restoreImportedPortraits } from "../lib/portrait-content";
import { migrateSitePlan, SITE_PLAN_VERSION } from "../lib/site-plan";
import { activeAnnouncements, denverInstant } from "../lib/announcements";
import multer from "multer";
import { Router as ExpressRouter } from "express";

const router: IRouter = Router();

export async function getSiteContent() {
  // Only initialize an empty database; never overwrite staff edits on restart.
  const [existing] = await db.select().from(siteContentTable).where(eq(siteContentTable.id,1));
  if(!existing) await db.insert(siteContentTable).values({ id: 1, revision: 1, content: initialContent }).onConflictDoNothing();
  const record = existing && Number(existing.content.planVersion)>=SITE_PLAN_VERSION ? existing : await db.transaction(async tx => {
    const [current] = await tx.select().from(siteContentTable).where(eq(siteContentTable.id,1)).for("update");
    if (Number(current.content.planVersion) >= SITE_PLAN_VERSION) return current;
    await tx.insert(contentBackupsTable).values({revision:current.revision,content:current.content});
    const migrated = migrateSitePlan(restoreImportedPortraits(current.content));
    const [saved] = await tx.update(siteContentTable).set({content:migrated, revision:current.revision+1,updatedAt:new Date()}).where(eq(siteContentTable.id,1)).returning();
    return saved;
  });
  const content = restoreImportedPortraits(record.content);
  return { ...content, activeAnnouncements:activeAnnouncements((content.announcements || []) as any[]), revision: record.revision };
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
  if (content.homeImage && !content.homeImageAlt?.trim()) { res.status(400).json({error:"The home photo requires alt text."}); return; }
  if ((content.faqs || []).some(f=>!f.question.trim() || !f.answer.trim())) { res.status(400).json({error:"Each FAQ needs a question and answer."}); return; }
  for (const a of content.announcements || []) {
    const dates = [a.startsAt,a.expiresAt].filter(Boolean) as string[];
    if (!a.title.trim() || dates.some(d=>!Number.isFinite(denverInstant(d))) ||
        (a.startsAt && a.expiresAt && a.expiresAt <= a.startsAt) || (a.url && !/^(\/(?!\/)|https?:\/\/|mailto:|tel:)/.test(a.url))) {
      res.status(400).json({error:"Announcements need a title, valid Denver dates (expiration after start), and a safe link."}); return;
    }
  }
  if (content.navigation.length !== 6 || new Set(content.navigation.map((item) => item.label)).size !== 6) {
    res.status(400).json({ error: "The menu must contain six unique sections." }); return;
  }
  const [record] = await db.update(siteContentTable).set({
    content, revision: sql`${siteContentTable.revision} + 1`, updatedAt: new Date(),
  }).where(and(eq(siteContentTable.id, 1), eq(siteContentTable.revision, content.revision))).returning();
  if (!record) { res.status(409).json({ error: "Another editor saved changes. Reload before saving." }); return; }
  res.json(GetSiteContentResponse.parse({ ...record.content, activeAnnouncements:activeAnnouncements((record.content.announcements || []) as any[]), revision: record.revision }));
});

const uploadRouter = ExpressRouter();
uploadRouter.use(["/health","/upload"],async(req,res,next)=>{
  if (!getAuth(req).userId) {res.status(401).json({error:"Sign in to upload photos."});return;}
  if (!await hasEditorAccess(req)) {res.status(403).json({error:"This account is not approved to edit CHESS."});return;}
  next();
});
uploadRouter.get("/health", (_req,res)=>{
  const missing = ["DEFAULT_OBJECT_STORAGE_BUCKET_ID","CLERK_SECRET_KEY","CLERK_PUBLISHABLE_KEY","CHESS_EDITOR_EMAILS"].filter(key=>!process.env[key]);
  res.json({configured:missing.length===0,message:missing.length ? `Storage not configured or editor configuration incomplete: ${missing.join(", ")}` : "Photo storage and editor configuration are available."});
});
const upload = multer({storage:multer.memoryStorage(),limits:{fileSize:15*1024*1024,files:1,fields:3}});
uploadRouter.post("/upload", (req,res,next)=>{
  upload.single("file")(req,res,(error)=>{
    if(error){res.status(error.code==="LIMIT_FILE_SIZE"?413:400).json({error:error.code==="LIMIT_FILE_SIZE"?"Photo is too large. Choose a file up to 15 MB.":error.message});return;}
    next();
  });
}, async (req, res) => {
  if (!process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID) {res.status(500).json({error:"Storage not configured. Ask an administrator to configure the App Storage bucket."});return;}
  const alt = req.body?.alt;
  if (!req.file) {res.status(400).json({error:"Choose a JPG, PNG, WebP, HEIC, or HEIF photo."});return;}
  if (typeof alt !== "string" || !alt.trim() || alt.length > 300) {res.status(400).json({error:"Add descriptive alt text before saving this photo (maximum 300 characters)."});return;}
  if (!/\.(jpe?g|png|webp|heic|heif)$/i.test(req.file.originalname)) {res.status(415).json({error:"Use a JPG, PNG, WebP, HEIC, or HEIF photo."});return;}
  try { res.json({ url: await storePhoto(req.file.buffer), alt: alt.trim() }); }
  catch (error) {
    req.log.error({ err: error }, "Photo upload failed");
    const storageError=error instanceof Error && /storage/i.test(error.message);
    res.status(storageError?500:422).json({error:storageError?"Photo storage is unavailable. Ask the administrator to check App Storage configuration.":"This image could not be decoded. Try a different JPG, PNG, WebP, HEIC, or HEIF file."});
  }
});
router.use("/media",uploadRouter);

router.get("/media/files/:key", async (req, res) => {
  if (!/^[a-f0-9]{64}\.webp$/.test(req.params.key)) { res.sendStatus(404); return; }
  const result = await mediaStorage.downloadAsBytes(`website/${req.params.key}`);
  if (!result.ok) { res.sendStatus(result.error.statusCode === 404 ? 404 : 503); return; }
  res.set({ "Content-Type": "image/webp", "Cache-Control": "public,max-age=31536000,immutable" });
  res.send(result.value[0]);
});

export default router;

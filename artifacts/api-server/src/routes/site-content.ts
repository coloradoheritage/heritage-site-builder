import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import {
  SaveSiteContentBody,
  SaveSiteContentDraftBody,
  PublishSiteContentBody,
  RestoreSiteContentVersionBody,
  GetSiteContentResponse,
  GetSiteContentEditorResponse,
  type SiteContentState as SiteContent,
} from "@workspace/api-zod";
import { db, siteContentTable, siteContentDraftsTable, contentBackupsTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { hasEditorAccess } from "./homepage";
import initialContent from "../data/initial-site-content.json";
import { mediaStorage, storeDocument, storePhoto } from "../lib/site-media";
import { restoreImportedPortraits } from "../lib/portrait-content";
import { migrateSitePlan, SITE_PLAN_VERSION } from "../lib/site-plan";
import { activeAnnouncements, denverInstant } from "../lib/announcements";
import multer from "multer";
import { Router as ExpressRouter } from "express";

const router: IRouter = Router();

const puckBlockTypes = new Set([
  "LegacyMarkdown", "PhotoWithText", "FamilyStepButton", "FaqItem", "StaffCard",
  "Testimonial", "TuitionTable", "VideoOrMap", "Announcement",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function withoutRuntimeFields(content: Record<string, unknown>): Record<string, unknown> {
  const { revision: _revision, activeAnnouncements: _active, ...saved } = content;
  return saved;
}

function stateWithRevision(content: Record<string, unknown>, revision: number) {
  const restored = restoreImportedPortraits(content);
  return GetSiteContentResponse.parse({
    ...restored,
    activeAnnouncements: activeAnnouncements((restored.announcements || []) as any[]),
    revision,
  });
}

async function ensureDraft(published: Awaited<ReturnType<typeof getSiteContent>>) {
  await db.insert(siteContentDraftsTable).values({
    id: 1,
    revision: 1,
    basePublishedRevision: published.revision,
    content: withoutRuntimeFields(published),
  }).onConflictDoNothing();
  const [draft] = await db.select().from(siteContentDraftsTable).where(eq(siteContentDraftsTable.id, 1));
  if (draft && Number(draft.content.planVersion) < SITE_PLAN_VERSION) {
    const migrated = migrateSitePlan(restoreImportedPortraits(draft.content));
    const [updated] = await db.update(siteContentDraftsTable).set({
      content: migrated,
      revision: draft.revision + 1,
      basePublishedRevision: published.revision,
      updatedAt: new Date(),
    }).where(and(
      eq(siteContentDraftsTable.id, 1),
      eq(siteContentDraftsTable.revision, draft.revision),
    )).returning();
    return updated;
  }
  return draft;
}

async function getEditorState() {
  const published = await getSiteContent();
  const draft = await ensureDraft(published);
  const [publishedVersion] = await db.select({ id: contentBackupsTable.id })
    .from(contentBackupsTable)
    .where(eq(contentBackupsTable.revision, published.revision))
    .limit(1);
  if (!publishedVersion) {
    await db.insert(contentBackupsTable).values({
      revision: published.revision,
      content: withoutRuntimeFields(published),
    });
  }
  const history = await db.select({
    id: contentBackupsTable.id,
    revision: contentBackupsTable.revision,
    createdAt: contentBackupsTable.createdAt,
  }).from(contentBackupsTable)
    .orderBy(desc(contentBackupsTable.createdAt), desc(contentBackupsTable.id))
    .limit(20);
  return GetSiteContentEditorResponse.parse({
    published,
    draft: stateWithRevision(draft.content, draft.revision),
    draftBaseRevision: draft.basePublishedRevision,
    versions: history.map((version) => ({
      id: version.id,
      revision: version.revision,
      createdAt: version.createdAt.toISOString(),
    })),
  });
}

function validateBlocks(blocks: unknown): string | null {
  if (blocks == null) return null;
  if (!isRecord(blocks) || !Array.isArray(blocks.content) || !isRecord(blocks.root)) {
    return "Page sections could not be read. Reopen the page and try again.";
  }
  if (blocks.content.length > 200 || blocks.content.some((block) =>
    !isRecord(block) || typeof block.type !== "string" || !puckBlockTypes.has(block.type) ||
    !isRecord(block.props),
  )) {
    return "A page contains an unsupported section. Remove it or reload the editor.";
  }
  return null;
}

function hasMissingPhotoAlt(blocks: unknown): boolean {
  if (!isRecord(blocks) || !Array.isArray(blocks.content)) return false;
  return blocks.content.some((block) => {
    if (!isRecord(block) || !isRecord(block.props)) return false;
    if (block.type !== "PhotoWithText" && block.type !== "StaffCard") return false;
    const image = block.type === "StaffCard" ? block.props.photo : block.props.imageUrl ?? block.props.image;
    const url = isRecord(image) ? image.url : image;
    const alt = isRecord(image) ? image.alt : block.props.alt;
    return typeof url === "string" && url.trim().length > 0 &&
      (typeof alt !== "string" || !alt.trim());
  });
}

function validateBlockValues(blocks: unknown): string | null {
  if (!isRecord(blocks) || !Array.isArray(blocks.content)) return null;
  for (const block of blocks.content) {
    if (!isRecord(block) || typeof block.type !== "string" || !isRecord(block.props)) continue;
    if (block.type === "FamilyStepButton" && block.props.href && !/^(\/(?!\/)|https?:\/\/|mailto:|tel:)/.test(String(block.props.href))) {
      return "A page button needs a safe website link.";
    }
    if (block.type === "FamilyStepButton" && block.props.secondaryHref && !/^(\/(?!\/)|https?:\/\/|mailto:|tel:)/.test(String(block.props.secondaryHref))) {
      return "A second page button needs a safe website link.";
    }
    if (block.type === "VideoOrMap" && block.props.url) {
      try {
        const embed = new URL(String(block.props.url));
        const youtube = ["youtube.com", "www.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(embed.hostname) &&
          /^\/embed\/[A-Za-z0-9_-]+$/.test(embed.pathname);
        const maps = ["google.com", "www.google.com", "maps.google.com"].includes(embed.hostname) &&
          /^\/maps(?:\/embed)?\/?$/.test(embed.pathname);
        if (embed.protocol !== "https:" || (!youtube && !maps)) return "Use a YouTube embed link or a Google Maps embed link.";
      } catch {
        return "Add a valid YouTube or Google Maps embed link.";
      }
    }
    if (block.type === "Announcement") {
      const start = typeof block.props.startsAt === "string" ? block.props.startsAt : "";
      const end = typeof block.props.expiresAt === "string" ? block.props.expiresAt : "";
      if ((start && !Number.isFinite(denverInstant(start))) || (end && !Number.isFinite(denverInstant(end))) ||
          (start && end && end <= start)) {
        return "An announcement needs valid Colorado start and end dates, with the end after the start.";
      }
    }
  }
  return null;
}

function validateContent(content: SiteContent, publishing: boolean): string | null {
  const paths = content.pages.map((page) => page.path);
  if (new Set(paths).size !== paths.length || paths.some((path) =>
    path === "/" || !/^\/[a-z0-9/_-]*$/.test(path) ||
    /^\/(?:admin|api|images|assets|documents)(?:\/|$)/.test(path),
  )) return "Pages require unique lowercase URL paths.";
  if (publishing && content.pages.some((page) => !page.label.trim() || !page.title.trim())) {
    return "Each page needs a name and a Google title before publishing.";
  }

  if (new Set(content.staff.map((person) => person.slug)).size !== content.staff.length ||
      content.staff.some((person) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(person.slug))) {
    return "Staff members require unique lowercase URL names.";
  }
  if (publishing && content.staff.some((person) => !person.name.trim())) {
    return "Each staff profile needs a name before publishing.";
  }
  if (publishing && content.staff.some((person) => person.photo && !person.alt.trim())) {
    return "Every staff photo requires alt text.";
  }
  if (publishing && content.homeImage && !content.homeImageAlt?.trim()) {
    return "The home photo requires alt text.";
  }
  if (publishing && (content.faqs || []).some((faq) => !faq.question.trim() || !faq.answer.trim())) {
    return "Each FAQ needs a question and answer.";
  }
  if (publishing && [...content.news, ...content.events].some((article) => !article.title.trim())) {
    return "Each news story and event needs a title before publishing.";
  }
  for (const announcement of content.announcements || []) {
    const dates = [announcement.startsAt, announcement.expiresAt].filter(Boolean) as string[];
    if ((publishing && !announcement.title.trim()) || dates.some((date) => !Number.isFinite(denverInstant(date))) ||
        (announcement.startsAt && announcement.expiresAt && announcement.expiresAt <= announcement.startsAt) ||
        (announcement.url && !/^(\/(?!\/)|https?:\/\/|mailto:|tel:)/.test(announcement.url))) {
      return "Announcements need a title, valid Denver dates (expiration after start), and a safe link.";
    }
  }
  if (content.navigation.length !== 6 ||
      new Set(content.navigation.map((item) => item.label)).size !== 6) {
    return "The menu must contain six unique sections.";
  }
  for (const page of content.pages) {
    const error = validateBlocks(page.blocks);
    if (error) return error;
    const valueError = validateBlockValues(page.blocks);
    if (valueError) return valueError;
    if (publishing && hasMissingPhotoAlt(page.blocks)) return "Every photo block needs a description (alt text).";
  }
  for (const person of content.staff) {
    const error = validateBlocks(person.blocks);
    if (error) return error;
    const valueError = validateBlockValues(person.blocks);
    if (valueError) return valueError;
    if (publishing && hasMissingPhotoAlt(person.blocks)) return "Every photo block needs a description (alt text).";
  }
  for (const article of [...content.events, ...content.news]) {
    const error = validateBlocks(article.blocks);
    if (error) return error;
    const valueError = validateBlockValues(article.blocks);
    if (valueError) return valueError;
    if (publishing && hasMissingPhotoAlt(article.blocks)) return "Every photo block needs a description (alt text).";
  }
  const homeBlocks = (content.home as unknown as Record<string, unknown> | undefined)?.blocks;
  const homeError = validateBlocks(homeBlocks);
  if (homeError) return homeError;
  const homeValueError = validateBlockValues(homeBlocks);
  if (homeValueError) return homeValueError;
  if (publishing && hasMissingPhotoAlt(homeBlocks)) return "Every photo block needs a description (alt text).";
  return null;
}

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

router.get("/site-content/editor", async (req, res) => {
  if (!getAuth(req).userId) { res.sendStatus(401); return; }
  if (!await hasEditorAccess(req)) { res.sendStatus(403); return; }
  res.set("Cache-Control", "no-store");
  res.json(await getEditorState());
});

async function saveDraft(content: SiteContent, expectedDraftRevision: number, createVersion: boolean) {
  const validationError = validateContent(content, false);
  if (validationError) return { kind: "invalid" as const, error: validationError };
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(siteContentDraftsTable)
      .where(eq(siteContentDraftsTable.id, 1)).for("update");
    if (!current || current.revision !== expectedDraftRevision) {
      return { kind: "conflict" as const };
    }
    const savedContent = withoutRuntimeFields(content as unknown as Record<string, unknown>);
    const nextRevision = current.revision + 1;
    await tx.update(siteContentDraftsTable)
      .set({
        content: savedContent,
        revision: nextRevision,
        updatedAt: new Date(),
      })
      .where(and(eq(siteContentDraftsTable.id, 1), eq(siteContentDraftsTable.revision, current.revision)));
    if (createVersion) {
      await tx.insert(contentBackupsTable).values({
        revision: -nextRevision,
        content: savedContent,
      });
    }
    return { kind: "saved" as const };
  });
}

router.put("/site-content/draft", async (req, res) => {
  if (!getAuth(req).userId) { res.sendStatus(401); return; }
  if (!await hasEditorAccess(req)) { res.sendStatus(403); return; }
  const parsed = SaveSiteContentDraftBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const result = await saveDraft(parsed.data.content, parsed.data.expectedDraftRevision, Boolean(parsed.data.createVersion));
  if (result.kind === "invalid") { res.status(400).json({ error: result.error }); return; }
  if (result.kind === "conflict") { res.status(409).json({ error: "Another editor saved a draft. Reload before saving." }); return; }
  res.set("Cache-Control", "no-store");
  res.json(await getEditorState());
});

router.put("/site-content", async (req, res) => {
  if (!getAuth(req).userId) { res.sendStatus(401); return; }
  if (!await hasEditorAccess(req)) { res.sendStatus(403); return; }
  const parsed = SaveSiteContentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const content = parsed.data;
  const published = await getSiteContent();
  const draft = await ensureDraft(published);
  if (content.revision !== draft.basePublishedRevision) {
    res.status(409).json({ error: "Published content changed since it was loaded. Reload before saving." }); return;
  }
  const result = await saveDraft(content, draft.revision, true);
  if (result.kind === "invalid") { res.status(400).json({ error: result.error }); return; }
  if (result.kind === "conflict") { res.status(409).json({ error: "Another editor saved a draft. Reload before saving." }); return; }
  const state = await getEditorState();
  res.json(state.draft);
});

router.post("/site-content/publish", async (req, res) => {
  if (!getAuth(req).userId) { res.sendStatus(401); return; }
  if (!await hasEditorAccess(req)) { res.sendStatus(403); return; }
  const parsed = PublishSiteContentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await getSiteContent();
  const result = await db.transaction(async (tx) => {
    const [draft] = await tx.select().from(siteContentDraftsTable)
      .where(eq(siteContentDraftsTable.id, 1)).for("update");
    if (!draft || draft.revision !== parsed.data.expectedDraftRevision) return { kind: "conflict" as const };
    const content = SaveSiteContentBody.safeParse({ ...draft.content, revision: draft.basePublishedRevision });
    if (!content.success) return { kind: "invalid" as const, error: content.error.message };
    const validationError = validateContent(content.data, true);
    if (validationError) return { kind: "invalid" as const, error: validationError };
    const [published] = await tx.select().from(siteContentTable)
      .where(eq(siteContentTable.id, 1)).for("update");
    if (!published || draft.basePublishedRevision !== published.revision) return { kind: "conflict" as const };
    const nextRevision = published.revision + 1;
    const savedContent = withoutRuntimeFields(content.data);
    await tx.update(siteContentTable)
      .set({ content: savedContent, revision: nextRevision, updatedAt: new Date() })
      .where(and(eq(siteContentTable.id, 1), eq(siteContentTable.revision, published.revision)));
    await tx.insert(contentBackupsTable).values({ revision: nextRevision, content: savedContent });
    await tx.update(siteContentDraftsTable)
      .set({
        content: savedContent,
        revision: draft.revision + 1,
        basePublishedRevision: nextRevision,
        updatedAt: new Date(),
      })
      .where(eq(siteContentDraftsTable.id, 1));
    return { kind: "published" as const };
  });
  if (result.kind === "invalid") { res.status(400).json({ error: result.error }); return; }
  if (result.kind === "conflict") { res.status(409).json({ error: "The published site or draft changed. Reload the editor before publishing." }); return; }
  res.set("Cache-Control", "no-store");
  res.json(await getEditorState());
});

router.post("/site-content/restore", async (req, res) => {
  if (!getAuth(req).userId) { res.sendStatus(401); return; }
  if (!await hasEditorAccess(req)) { res.sendStatus(403); return; }
  const parsed = RestoreSiteContentVersionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [version] = await db.select().from(contentBackupsTable)
    .where(eq(contentBackupsTable.id, parsed.data.versionId));
  if (!version) { res.status(404).json({ error: "That saved version could not be found." }); return; }
  const current = await getSiteContent();
  await ensureDraft(current);
  const result = await db.transaction(async (tx) => {
    const [draft] = await tx.select().from(siteContentDraftsTable)
      .where(eq(siteContentDraftsTable.id, 1)).for("update");
    if (!draft || draft.revision !== parsed.data.expectedDraftRevision) return { kind: "conflict" as const };
    await tx.update(siteContentDraftsTable)
      .set({
        content: withoutRuntimeFields(version.content),
        revision: draft.revision + 1,
        updatedAt: new Date(),
      })
      .where(eq(siteContentDraftsTable.id, 1));
    return { kind: "restored" as const };
  });
  if (result.kind === "conflict") { res.status(409).json({ error: "Another editor saved a draft. Reload before restoring." }); return; }
  res.set("Cache-Control", "no-store");
  res.json(await getEditorState());
});

const uploadRouter = ExpressRouter();
uploadRouter.use(["/health","/upload","/upload-document"],async(req,res,next)=>{
  if (!getAuth(req).userId) {res.status(401).json({error:"Sign in to upload files."});return;}
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
uploadRouter.post("/upload-document", (req,res,next)=>{
  upload.single("file")(req,res,(error)=>{
    if(error){res.status(error.code==="LIMIT_FILE_SIZE"?413:400).json({error:error.code==="LIMIT_FILE_SIZE"?"PDF is too large. Choose a file up to 15 MB.":error.message});return;}
    next();
  });
}, async (req, res) => {
  if (!process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID) {res.status(500).json({error:"Storage not configured. Ask an administrator to configure the App Storage bucket."});return;}
  if (!req.file) {res.status(400).json({error:"Choose a PDF file up to 15 MB."});return;}
  if (!/\.pdf$/i.test(req.file.originalname)) {
    res.status(415).json({error:"Choose a PDF file."});return;
  }
  try { res.json({ url: await storeDocument(req.file.buffer) }); }
  catch (error) {
    req.log.error({ err: error }, "PDF upload failed");
    const storageError=error instanceof Error && /storage/i.test(error.message);
    res.status(storageError?500:415).json({error:storageError?"PDF storage is unavailable. Ask the administrator to check App Storage configuration.":"The uploaded file is not a valid PDF."});
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

router.get("/media/documents/:key", async (req, res) => {
  if (!/^[a-f0-9]{64}\.pdf$/.test(req.params.key)) { res.sendStatus(404); return; }
  const result = await mediaStorage.downloadAsBytes(`website/documents/${req.params.key}`);
  if (!result.ok) { res.sendStatus(result.error.statusCode === 404 ? 404 : 503); return; }
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": 'inline; filename="chess-document.pdf"',
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "public,max-age=31536000,immutable",
  });
  res.send(result.value[0]);
});

export default router;

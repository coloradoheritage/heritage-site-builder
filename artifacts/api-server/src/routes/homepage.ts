import { getAuth } from "@clerk/express";
import {
  GetEditorAccessResponse,
  GetHomepageContentResponse,
  SaveHomepageContentBody,
  SaveHomepageContentResponse,
} from "@workspace/api-zod";
import { db, homepageContentTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";

const router: IRouter = Router();

function editorEmails(): Set<string> {
  return new Set(
    (process.env.CHESS_EDITOR_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function hasEditorAccess(req: Request): boolean {
  const auth = getAuth(req);
  if (!auth.userId) return false;

  const claims = auth.sessionClaims as { email?: unknown } | null;
  const email = typeof claims?.email === "string" ? claims.email.trim().toLowerCase() : "";
  return Boolean(email) && editorEmails().has(email);
}

router.get("/homepage-content", async (_req, res): Promise<void> => {
  const [record] = await db
    .select({ content: homepageContentTable.content })
    .from(homepageContentTable)
    .where(eq(homepageContentTable.id, 1))
    .limit(1);

  res.json(GetHomepageContentResponse.parse({ content: record?.content ?? null }));
});

router.get("/editor-access", (req, res): void => {
  if (!getAuth(req).userId) {
    res.sendStatus(401);
    return;
  }

  res.json(GetEditorAccessResponse.parse({ allowed: hasEditorAccess(req) }));
});

router.put("/homepage-content", async (req, res): Promise<void> => {
  if (!getAuth(req).userId) {
    res.sendStatus(401);
    return;
  }

  if (!hasEditorAccess(req)) {
    res.sendStatus(403);
    return;
  }

  const parsed = SaveHomepageContentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [record] = await db
    .insert(homepageContentTable)
    .values({ id: 1, content: parsed.data })
    .onConflictDoUpdate({
      target: homepageContentTable.id,
      set: { content: parsed.data, updatedAt: new Date() },
    })
    .returning({ content: homepageContentTable.content });

  res.json(SaveHomepageContentResponse.parse({ content: record.content }));
});

export default router;

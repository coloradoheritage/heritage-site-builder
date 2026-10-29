import { integer, jsonb, pgTable, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type HomepageContentState = {
  order: string[];
  hidden: string[];
  copy: Record<string, Record<string, string>>;
};

export const homepageContentTable = pgTable("homepage_content", {
  id: integer("id").primaryKey().notNull().default(1),
  content: jsonb("content").$type<HomepageContentState>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertHomepageContentSchema = createInsertSchema(homepageContentTable).omit({
  id: true,
  updatedAt: true,
});

export type InsertHomepageContent = z.infer<typeof insertHomepageContentSchema>;
export type HomepageContent = typeof homepageContentTable.$inferSelect;

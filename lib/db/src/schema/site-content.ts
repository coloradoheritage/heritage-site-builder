import { integer, jsonb, pgTable, timestamp } from "drizzle-orm/pg-core";

// One versioned document makes a multi-section editorial save atomic.
export const siteContentTable = pgTable("site_content", {
  id: integer("id").primaryKey().notNull().default(1),
  revision: integer("revision").notNull().default(1),
  content: jsonb("content").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Staff edits are isolated from the public document until an explicit publish.
export const siteContentDraftsTable = pgTable("site_content_drafts", {
  id: integer("id").primaryKey().notNull().default(1),
  revision: integer("revision").notNull().default(1),
  basePublishedRevision: integer("base_published_revision").notNull().default(1),
  content: jsonb("content").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

import { pgTable, serial, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
export const contentBackupsTable = pgTable("site_content_backups", {
  id: serial("id").primaryKey(),
  revision: integer("revision").notNull(),
  content: jsonb("content").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

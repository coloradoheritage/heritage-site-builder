import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
export const inquiriesTable = pgTable("site_inquiries", {
  id: uuid("id").primaryKey().defaultRandom(),
  parentName: text("parent_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull().default(""),
  grades: text("grades").notNull(),
  program: text("program").notNull(),
  question: text("question").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Recover full portrait images without replacing any staff-uploaded photo.
// Writes a review report only; database changes are applied separately with a revision check.
import fs from "node:fs/promises";
import sharp from "sharp";
import { storePhoto } from "../src/lib/site-media.ts";

const web = new URL("../../colorado-heritage/", import.meta.url);
const source = JSON.parse(await fs.readFile(new URL("src/data/sourcePages.json", web), "utf8")).pages;
const seed = JSON.parse(await fs.readFile(new URL("../src/data/initial-site-content.json", import.meta.url), "utf8"));
const liveResponse = await fetch(`https://${process.env.REPLIT_DEV_DOMAIN}/api/site-content`);
if (!liveResponse.ok) throw new Error("Cannot load the current site content");
const live = await liveResponse.json();
const slugify = text => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "");
const originalPhotos = new Map();
for (const match of source["/our-faculty"].markdown.matchAll(/^###\s+([^\n]+)\n([\s\S]*?)(?=^###\s|(?![\s\S]))/gm)) {
  const name = match[1].replace(/[*_]/g, "").trim().split(/[,;]/)[0];
  if (!/^(Miss|Mrs?\.|Pastor)/i.test(name)) continue;
  const photo = match[2].match(/!\[[^\]]*\]\(([^)]+)\)/)?.[1];
  if (photo) originalPhotos.set(slugify(name), photo);
}
for (const match of source["/administrative-stafff"].markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)\s*([\s\S]*?)(?=!\[|(?![\s\S]))/g)) {
  for (const name of ["Mrs. Mary Brown", "Mrs. Amy Kearns", "Signe Clausen"]) {
    const slug = slugify(name);
    if (match[2].includes(name) && !originalPhotos.has(slug)) originalPhotos.set(slug, match[1]);
  }
}

const updates = [];
const tiles = [];
for (const person of live.staff) {
  const imported = seed.staff.find(entry => entry.slug === person.slug);
  if (!imported || imported.photo !== person.photo) {
    console.log(`Preserving custom photo: ${person.name}`);
    continue;
  }
  const sourceUrl = originalPhotos.get(person.slug);
  if (!sourceUrl) throw new Error(`Missing original portrait: ${person.name}`);
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Original portrait unavailable: ${person.name} (${response.status})`);
  const photo = await storePhoto(Buffer.from(await response.arrayBuffer()));
  const stored = await fetch(`https://${process.env.REPLIT_DEV_DOMAIN}${photo}`);
  if (!stored.ok) throw new Error(`Stored portrait unavailable: ${person.name}`);
  const bytes = Buffer.from(await stored.arrayBuffer());
  const metadata = await sharp(bytes).metadata();
  const photoPositionX = person.photoPositionX ?? 50;
  const photoPositionY = person.photoPositionY ?? (["mr-cliff-smart", "mrs-alice-wishart"].includes(person.slug) ? 20 : 0);
  updates.push({ slug: person.slug, oldPhoto: person.photo, photo, photoPositionX, photoPositionY, width: metadata.width, height: metadata.height, bytes: bytes.length });
  const index = tiles.length / 2;
  const left = (index % 4) * 240, top = Math.floor(index / 4) * 270;
  const side = Math.min(metadata.width, metadata.height);
  const crop = { left: Math.round((metadata.width - side) * photoPositionX / 100), top: Math.round((metadata.height - side) * photoPositionY / 100), width: side, height: side };
  tiles.push({ input: await sharp(bytes).extract(crop).resize(220, 220).toBuffer(), left, top });
  const label = person.name.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  tiles.push({ input: Buffer.from(`<svg width="235" height="38"><text x="0" y="22" font-size="15" fill="#142b4a">${label}</text></svg>`), left, top: top + 222 });
  console.log(`${person.name}: ${metadata.width}×${metadata.height}, ${Math.round(bytes.length / 1024)} KB`);
}
await fs.writeFile("/tmp/chess-restored-portraits.json", JSON.stringify({ revision: live.revision, updates }, null, 2));
await sharp({ create: { width: 960, height: Math.ceil(updates.length / 4) * 270, channels: 3, background: "#fff" } })
  .composite(tiles).jpeg({ quality: 90 }).toFile("/tmp/chess-portrait-review.jpg");
console.log(`Restored ${updates.length} portraits. Review: /tmp/chess-portrait-review.jpg; report: /tmp/chess-restored-portraits.json`);

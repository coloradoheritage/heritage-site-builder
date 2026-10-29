import { Client } from "@replit/object-storage";
import sharp from "sharp";
import { createHash } from "node:crypto";

export const mediaStorage = new Client({ bucketId: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID });

export async function storePhoto(bytes: Buffer): Promise<string> {
  // Decode and re-encode on the server too: a client-supplied MIME type is not trusted.
  let quality = 80;
  let output = await sharp(bytes, { limitInputPixels: 40_000_000 })
    .rotate().resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
    .webp({ quality }).toBuffer();
  while (output.length > 110_000 && quality > 35) {
    quality -= 10;
    output = await sharp(output).webp({ quality }).toBuffer();
  }
  const key = `${createHash("sha256").update(output).digest("hex")}.webp`;
  const result = await mediaStorage.uploadFromBytes(`website/${key}`, output, { compress: false });
  if (!result.ok) throw new Error("Photo storage is unavailable");
  return `/api/media/files/${key}`;
}

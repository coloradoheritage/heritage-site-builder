import { Client } from "@replit/object-storage";
import sharp from "sharp";
import { createHash } from "node:crypto";

export const mediaStorage = new Client({ bucketId: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID });

export async function storePhoto(bytes: Buffer): Promise<string> {
  // Decode and re-encode on the server too: a client-supplied MIME type is not trusted.
  const brand = bytes.subarray(4,36).toString("ascii");
  if (/ftyp(?:heic|heix|hevc|hevx|mif1|msf1)/.test(brand)) {
    const { default: convert } = await import("heic-convert");
    bytes = Buffer.from(await convert({buffer:bytes,format:"JPEG",quality:0.9}));
  }
  let quality = 80;
  let output = await sharp(bytes, { limitInputPixels: 40_000_000 })
    .rotate().resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
    .webp({ quality }).toBuffer();
  while (output.length > 110_000 && quality > 35) {
    quality -= 10;
    output = await sharp(output).webp({ quality }).toBuffer();
  }
  // Detailed backgrounds can remain large even at low quality; reduce dimensions
  // without cropping rather than returning an oversized or face-trimmed image.
  while (output.length > 110_000) {
    const metadata = await sharp(output).metadata();
    const size = Math.floor(Math.max(metadata.width ?? 0, metadata.height ?? 0) * 0.85);
    if (size < 600) break;
    output = await sharp(output).resize(size, size, { fit: "inside" }).webp({ quality: 50 }).toBuffer();
  }
  const key = `${createHash("sha256").update(output).digest("hex")}.webp`;
  const result = await mediaStorage.uploadFromBytes(`website/${key}`, output, { compress: false });
  if (!result.ok) throw new Error("Photo storage is unavailable");
  return `/api/media/files/${key}`;
}

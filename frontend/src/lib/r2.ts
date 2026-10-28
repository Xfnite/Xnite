import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { createHash } from "crypto";
import { toUserFacingError } from "@/lib/userFacingError";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || process.env.B2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || process.env.B2_SECRET_ACCESS_KEY || "";
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || process.env.B2_BUCKET_NAME || "xfnite";

// Compute endpoint: if R2_ENDPOINT is given use it; otherwise build Cloudflare R2 endpoint or fallback
const R2_ENDPOINT =
  process.env.R2_ENDPOINT ||
  (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : process.env.B2_ENDPOINT || "");

// Public CDN or custom domain URL for serving the images
const R2_PUBLIC_URL = (
  process.env.R2_PUBLIC_URL ||
  process.env.B2_PUBLIC_URL ||
  process.env.NEXT_PUBLIC_R2_PUBLIC_URL ||
  ""
).replace(/\/+$/, "");

const s3Client = new S3Client({
  region: process.env.R2_REGION || "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Compresses an image buffer using sharp:
 * - Converts to WebP
 * - Resizes to max width/height of 1920px (preserving aspect ratio, no upscale)
 * - Applies 80% quality with effort 4
 * - Strips EXIF/metadata
 */
export async function compressImage(buffer: Buffer): Promise<Buffer> {
  return await sharp(buffer)
    .rotate() // Automatically rotate based on EXIF orientation if present before stripping
    .resize({
      width: 1920,
      height: 1920,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({
      quality: 80,
      effort: 4,
    })
    .toBuffer();
}

/**
 * Uploads an image to Cloudflare R2 with compression and long-lived cache headers for CDN optimization.
 */
export async function uploadChatImageToR2(
  fileBuffer: Buffer,
  originalFilename: string = "image"
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ENDPOINT) {
      console.error("[R2 Upload] Missing R2 credentials in environment variables.");
      return { success: false, error: "R2 storage configuration is missing" };
    }

    // 1. Compress image to optimized WebP
    const compressedBuffer = await compressImage(fileBuffer);

    // 2. Generate deterministic content hash from compressed buffer (Automatic Deduplication)
    const hash = createHash("sha256").update(compressedBuffer).digest("hex");
    const key = `chat/${hash}.webp`;

    // 3. Upload to R2 with immutable 1-year cache header (CDN & browser caching)
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: compressedBuffer,
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
    });

    await s3Client.send(command);

    // 4. Construct public URL
    const publicUrl = R2_PUBLIC_URL
      ? `${R2_PUBLIC_URL}/${key}`
      : `${R2_ENDPOINT}/${R2_BUCKET_NAME}/${key}`;

    return { success: true, url: publicUrl };
  } catch (error: any) {
    console.error("[R2 Upload] Failed to upload image to R2:", error);
    return { success: false, error: toUserFacingError(error, "Couldn't upload the image. Please try again.") };
  }
}

/**
 * Uploads a payment QR code image to Cloudflare R2 with WebP compression.
 */
export async function uploadQrToR2(
  fileBuffer: Buffer,
  originalFilename: string = "qr"
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ENDPOINT) {
      console.error("[R2 Upload] Missing R2 credentials in environment variables.");
      return { success: false, error: "R2 storage configuration is missing" };
    }

    // 1. Compress image to optimized WebP
    const compressedBuffer = await compressImage(fileBuffer);

    // 2. Generate deterministic content hash from compressed buffer
    const hash = createHash("sha256").update(compressedBuffer).digest("hex");
    const key = `payments/${hash}.webp`;

    // 3. Upload to R2
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: compressedBuffer,
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
    });

    await s3Client.send(command);

    // 4. Construct public URL
    const publicUrl = R2_PUBLIC_URL
      ? `${R2_PUBLIC_URL}/${key}`
      : `${R2_ENDPOINT}/${R2_BUCKET_NAME}/${key}`;

    return { success: true, url: publicUrl };
  } catch (error: any) {
    console.error("[R2 Upload] Failed to upload QR image to R2:", error);
    return { success: false, error: toUserFacingError(error, "Couldn't upload the QR image. Please try again.") };
  }
}

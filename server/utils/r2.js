import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";

let r2Client = null;

export function getR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.B2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.B2_SECRET_ACCESS_KEY;
  const endpoint =
    process.env.R2_ENDPOINT ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");

  if (!accessKeyId || !secretAccessKey || !endpoint) {
    return null;
  }

  if (!r2Client) {
    r2Client = new S3Client({
      region: process.env.R2_REGION || "auto",
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }
  return r2Client;
}

export function extractR2Key(imageUrl) {
  if (!imageUrl || typeof imageUrl !== "string") return null;
  try {
    const parsed = new URL(imageUrl);
    let pathname = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
    const bucketName = process.env.R2_BUCKET_NAME || process.env.B2_BUCKET_NAME || "xfnite";
    if (pathname.startsWith(`${bucketName}/`)) {
      pathname = pathname.slice(bucketName.length + 1);
    }
    return pathname || null;
  } catch {
    return imageUrl.replace(/^\/+/, "") || null;
  }
}

export async function deleteR2Objects(keys) {
  if (!keys || !Array.isArray(keys) || keys.length === 0) return 0;
  const client = getR2Client();
  if (!client) return 0;

  const bucketName = process.env.R2_BUCKET_NAME || process.env.B2_BUCKET_NAME || "xfnite";
  const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
  if (uniqueKeys.length === 0) return 0;

  const batchSize = 1000;
  let deletedCount = 0;

  for (let i = 0; i < uniqueKeys.length; i += batchSize) {
    const batch = uniqueKeys.slice(i, i + batchSize);
    try {
      const command = new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: {
          Objects: batch.map((key) => ({ Key: key })),
          Quiet: true,
        },
      });
      await client.send(command);
      deletedCount += batch.length;
    } catch (err) {
      console.error("[R2 Cleanup] Failed to delete batch from R2:", err);
    }
  }

  return deletedCount;
}

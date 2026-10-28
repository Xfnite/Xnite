/**
 * Run once:  node scripts/migrate-images-to-uploadthing.mjs
 *
 * Requires: UPLOADTHING_TOKEN in .env — this is the v7 token from the
 *           UploadThing dashboard's "API Keys" page, "V7" tab. It's a base64
 *           blob like eyJhcGlLZXkiOi..., NOT a raw sk_live_... secret key.
 *
 * Requires: `npm install uploadthing` (v7+) as a dependency.
 *
 * What it does:
 *   1. Finds every Google image URL used in pre-course/page.tsx and optionImages.ts
 *   2. Uploads each one to UploadThing directly from its URL (UTApi downloads
 *      and re-uploads it server-side — no manual fetch/buffer/PUT/confirm needed)
 *   3. Replaces every old URL in both source files with the new UploadThing URL
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { UTApi } from "uploadthing/server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── Load .env manually (no dotenv dependency needed) ─────────────────────────
const envPath = path.join(ROOT, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([^#=\s]+)\s*=\s*"?(.+?)"?\s*$/);
    if (m) process.env[m[1]] ??= m[2];
  }
}

if (!process.env.UPLOADTHING_TOKEN) {
  console.error("❌  UPLOADTHING_TOKEN is not set. Add it to .env or export it in your shell.");
  process.exit(1);
}

// Sanity check: catch the common mistake of pasting an old v6 secret key here
try {
  const decoded = JSON.parse(Buffer.from(process.env.UPLOADTHING_TOKEN, "base64").toString("utf8"));
  if (!decoded.apiKey || !decoded.appId) throw new Error("missing apiKey/appId");
} catch {
  console.error(
    "❌  UPLOADTHING_TOKEN doesn't look like a valid v7 token.\n" +
    "    Go to the UploadThing dashboard → API Keys → the 'V7' tab and copy that\n" +
    "    value — not the old sk_live_... secret key from the v6 tab."
  );
  process.exit(1);
}

// Reads UPLOADTHING_TOKEN from env automatically; decodes apiKey/appId/region for you
const utapi = new UTApi();

// ── Files to patch ────────────────────────────────────────────────────────────
const TARGET_FILES = [
  path.join(ROOT, "src/app/pre-course/page.tsx"),
  path.join(ROOT, "src/lib/optionImages.ts"),
];

// ── Collect every unique Google image URL from the source files ───────────────
const GOOGLE_URL_RE = /https?:\/\/lh7-rt\.googleusercontent\.com\/[^\s"'`]+/g;

const urlSet = new Set();
for (const file of TARGET_FILES) {
  const src = fs.readFileSync(file, "utf8");
  // Also handle the split-string concat pattern: "https://" + "lh7-rt..."
  const normalised = src.replace(
    /"https:\/\/"\s*\+\s*"lh7-rt\.googleusercontent\.com"/g,
    '"https://lh7-rt.googleusercontent.com"'
  );
  for (const url of normalised.matchAll(GOOGLE_URL_RE)) {
    urlSet.add(url[0].replace(/['"`,;)]+$/, "")); // strip trailing punctuation
  }
}

const urls = [...urlSet];
console.log(`Found ${urls.length} unique Google image URLs to migrate.\n`);

// ── Upload directly from each URL ──────────────────────────────────────────────
const replacementMap = {}; // oldUrl → newUrl

for (let i = 0; i < urls.length; i++) {
  const googleUrl = urls[i];
  console.log(`[${i + 1}/${urls.length}] Uploading: ${googleUrl.slice(0, 80)}...`);

  try {
    const result = await utapi.uploadFilesFromUrl({
      url: googleUrl,
      name: `pre-course-${i + 1}`,
    });

    if (result.error) throw new Error(result.error.message);

    replacementMap[googleUrl] = result.data.url;
    console.log(`  ✅  Uploaded → ${result.data.url}`);
  } catch (err) {
    console.warn(`  ⚠️  Upload failed: ${err.message} — skipping`);
  }
}

if (Object.keys(replacementMap).length === 0) {
  console.error("\n❌  No images were uploaded successfully. Check your UPLOADTHING_TOKEN.");
  process.exit(1);
}

// ── Patch source files ────────────────────────────────────────────────────────
console.log("\nPatching source files...");

for (const file of TARGET_FILES) {
  let src = fs.readFileSync(file, "utf8");

  // Normalise the split-string concat pattern first so replacement works
  src = src.replace(
    /"https:\/\/"\s*\+\s*"(lh7-rt\.googleusercontent\.com[^"]+)"/g,
    (_, rest) => `"https://${rest}"`
  );

  for (const [oldUrl, newUrl] of Object.entries(replacementMap)) {
    src = src.split(oldUrl).join(newUrl);
  }

  fs.writeFileSync(file, src, "utf8");
  console.log(`  ✅  Patched: ${path.relative(ROOT, file)}`);
}

console.log("\n🎉  Done! All Google image URLs have been replaced with UploadThing URLs.");
console.log("    Run the app and verify images load correctly before committing.");

import { createUploadthing, type FileRouter } from "uploadthing/next";

const f = createUploadthing();

// FileRouter for your app, can contain multiple FileRoutes
export const ourFileRouter = {
  // Define as many FileRoutes as you like, each with a unique routeSlug
  directMessageAttachment: f({ image: { maxFileSize: "4MB", maxFileCount: 2 } })
    // Set permissions and file types for this FileRoute
    .onUploadComplete(async ({ metadata, file }) => {
      // This code RUNS ON YOUR SERVER after upload
      // Whatever is returned here is sent to the clientside `onClientUploadComplete` callback
      return { url: file.ufsUrl };
    }),

  // qrImageUploader — DEPRECATED: QR code uploads now go to Cloudflare R2 via /api/user/payment/qr-upload
  // qrImageUploader: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
  //   .onUploadComplete(async ({ file }) => {
  //     console.log("QR Image uploaded:", file.ufsUrl);
  //     return { url: file.ufsUrl };
  //   }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;

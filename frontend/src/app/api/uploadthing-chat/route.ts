import { createRouteHandler } from "uploadthing/next";
import { createUploadthing, type FileRouter } from "uploadthing/next";

const f = createUploadthing();

export const chatFileRouter = {
  channelLogoUploader: f({ image: { maxFileSize: "2MB", maxFileCount: 1 } })
    .onUploadComplete(async ({ file }) => {
      return { url: file.ufsUrl };
    }),
} satisfies FileRouter;

export type ChatFileRouter = typeof chatFileRouter;

export const { GET, POST } = createRouteHandler({
  router: chatFileRouter,
  config: {
    token: process.env.UPLOADTHING_TOKEN_CHAT,
  },
});

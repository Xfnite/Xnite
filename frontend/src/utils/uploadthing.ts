import { generateReactHelpers } from "@uploadthing/react";
import type { OurFileRouter } from "@/app/api/uploadthing/core";
import type { ChatFileRouter } from "@/app/api/uploadthing-chat/route";

export const { useUploadThing, uploadFiles } = generateReactHelpers<OurFileRouter>();

export const { useUploadThing: useUploadThingChat, uploadFiles: uploadFilesChat } = generateReactHelpers<ChatFileRouter>({
  url: "/api/uploadthing-chat",
});


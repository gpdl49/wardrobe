import type { Photo } from "@/lib/generated/prisma/client";

/**
 * Called once a photo's renditions are written and it is `ready`. The single
 * place follow-up work (image analysis) plugs in. The `photo.renditions` job
 * logs and swallows errors from here, so keep it to enqueueing.
 */
export async function onPhotoReady(_photo: Photo): Promise<void> {}

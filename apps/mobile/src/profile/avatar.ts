import type { ImagePickerAsset } from "expo-image-picker";
import { supabase } from "@/auth/supabase";

const AVATAR_BUCKET = "avatars";
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const SUPPORTED_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type AvatarUploadErrorCode =
  | "AVATAR_TOO_LARGE"
  | "AVATAR_UNSUPPORTED"
  | "AVATAR_READ_FAILED"
  | "AVATAR_UPLOAD_FAILED"
  | "AVATAR_PROFILE_UPDATE_FAILED";

export class AvatarUploadError extends Error {
  constructor(readonly code: AvatarUploadErrorCode) {
    super(code);
  }
}

export async function uploadProfileAvatar({
  asset,
  previousAvatarUrl,
  userId,
}: {
  asset: ImagePickerAsset;
  previousAvatarUrl: string | null;
  userId: string;
}): Promise<string> {
  if (asset.fileSize != null && asset.fileSize > MAX_AVATAR_BYTES) {
    throw new AvatarUploadError("AVATAR_TOO_LARGE");
  }

  const contentType = asset.mimeType?.toLowerCase() as keyof typeof SUPPORTED_TYPES | undefined;
  const extension = contentType ? SUPPORTED_TYPES[contentType] : undefined;
  if (!contentType || !extension) {
    throw new AvatarUploadError("AVATAR_UNSUPPORTED");
  }

  let fileBody: ArrayBuffer;
  try {
    const response = await fetch(asset.uri);
    if (!response.ok) throw new Error("avatar read failed");
    fileBody = await response.arrayBuffer();
  } catch {
    throw new AvatarUploadError("AVATAR_READ_FAILED");
  }

  if (fileBody.byteLength > MAX_AVATAR_BYTES) {
    throw new AvatarUploadError("AVATAR_TOO_LARGE");
  }

  const uniquePart = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const path = `${userId}/${uniquePart}.${extension}`;
  const { data: uploaded, error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, fileBody, {
      cacheControl: "31536000",
      contentType,
      upsert: false,
    });

  if (uploadError) {
    throw new AvatarUploadError("AVATAR_UPLOAD_FAILED");
  }

  const { data: publicData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(uploaded.path);
  const publicUrl = publicData.publicUrl;
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl })
    .eq("id", userId);

  if (profileError) {
    await supabase.storage.from(AVATAR_BUCKET).remove([uploaded.path]).catch(() => undefined);
    throw new AvatarUploadError("AVATAR_PROFILE_UPDATE_FAILED");
  }

  const previousPath = avatarPathFromPublicUrl(previousAvatarUrl);
  if (previousPath && previousPath !== uploaded.path) {
    await supabase.storage.from(AVATAR_BUCKET).remove([previousPath]).catch(() => undefined);
  }

  return publicUrl;
}

function avatarPathFromPublicUrl(url: string | null): string | undefined {
  if (!url) return undefined;
  const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
  const markerIndex = url.indexOf(marker);
  if (markerIndex < 0) return undefined;
  const encodedPath = url.slice(markerIndex + marker.length).split("?")[0];
  try {
    return decodeURIComponent(encodedPath);
  } catch {
    return undefined;
  }
}

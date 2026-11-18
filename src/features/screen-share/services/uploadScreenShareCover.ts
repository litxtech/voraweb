import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { readLocalFileBytes } from '@/lib/files/readLocalFile';
import { uploadPublicImage } from '@/lib/media-cloud/uploadPublicImage';

const COVER_MAX_WIDTH = 960;

export async function uploadScreenShareCover(
  userId: string,
  localUri: string,
): Promise<{ url: string | null; error: string | null }> {
  try {
    let preparedUri = localUri;
    let contentType = 'image/jpeg';
    let ext = 'jpg';

    try {
      const compressed = await manipulateAsync(
        localUri,
        [{ resize: { width: COVER_MAX_WIDTH } }],
        { compress: 0.82, format: SaveFormat.WEBP },
      );
      preparedUri = compressed.uri;
      contentType = 'image/webp';
      ext = 'webp';
    } catch {
      // sıkıştırma başarısızsa orijinal
    }

    const bytes = await readLocalFileBytes(preparedUri);
    const path = `${userId}/screen-share/${Date.now()}_cover.${ext}`;
    const uploaded = await uploadPublicImage({
      folder: 'profile-media',
      path,
      bytes,
      contentType,
    });
    if (uploaded.error || !uploaded.url) {
      return { url: null, error: uploaded.error ?? 'Kapak yüklenemedi.' };
    }
    return { url: uploaded.url, error: null };
  } catch {
    return { url: null, error: 'Kapak hazırlanamadı.' };
  }
}

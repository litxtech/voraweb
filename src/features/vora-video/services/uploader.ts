import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { File, Paths, UploadType } from 'expo-file-system';
import { uploadPublicImage } from '@/lib/media-cloud/uploadPublicImage';
import { createVvStreamUpload, failVvVideo } from '@/features/vora-video/services/api';

export type VvPickedVideo = {
  uri: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  webFile?: Blob;
};

export type VvUploadProgress = {
  sentBytes: number;
  totalBytes: number;
  phase: 'preparing' | 'uploading' | 'finalizing';
};

const TUS_CHUNK_BYTES = 8 * 1024 * 1024;

export async function pickVvVideo(): Promise<{ video: VvPickedVideo | null; error: string | null }> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return { video: null, error: 'Video seçmek için galeri erişim izni gerekli.' };
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    allowsMultipleSelection: false,
    quality: 1,
  });
  if (result.canceled || !result.assets[0]) return { video: null, error: null };

  const asset = result.assets[0];
  const webFile = asset.file ?? null;
  let sizeBytes = Number(asset.fileSize ?? 0);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    try {
      sizeBytes = Platform.OS === 'web' ? Number(webFile?.size ?? 0) : new File(asset.uri).size;
    } catch {
      sizeBytes = 0;
    }
  }

  const fileName =
    asset.fileName?.trim() ||
    `vora-video-${Date.now()}.${asset.mimeType?.includes('quicktime') ? 'mov' : 'mp4'}`;

  return {
    video: {
      uri: asset.uri,
      fileName,
      mimeType: asset.mimeType ?? 'video/mp4',
      sizeBytes: Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : 0,
      durationSeconds:
        typeof asset.duration === 'number' && asset.duration > 0
          ? Math.round(asset.duration / 1000)
          : null,
      webFile: webFile ?? undefined,
    },
    error: null,
  };
}

export async function pickVvThumbnail(): Promise<{ uri: string | null; error: string | null }> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [16, 9],
    quality: 0.9,
  });
  if (result.canceled || !result.assets[0]) return { uri: null, error: null };
  return { uri: result.assets[0].uri, error: null };
}

async function readUriBytes(uri: string): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) throw new Error('Dosya okunamadı.');
    return new Uint8Array(await response.arrayBuffer());
  }
  return new File(uri).bytes();
}

export async function uploadVvThumbnail(input: {
  userId: string;
  uri: string;
}): Promise<{ url: string | null; error: string | null }> {
  try {
    const bytes = await readUriBytes(input.uri);
    const ext = input.uri.toLowerCase().includes('.png') ? 'png' : 'jpg';
    const uploaded = await uploadPublicImage({
      folder: 'post-media',
      path: `${input.userId}/vv-thumb-${Date.now()}.${ext}`,
      bytes,
      contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
    });
    if (uploaded.error || !uploaded.url) {
      return { url: null, error: uploaded.error ?? 'Kapak görseli yüklenemedi.' };
    }
    return { url: uploaded.url, error: null };
  } catch (error) {
    return {
      url: null,
      error: error instanceof Error ? error.message : 'Kapak görseli yüklenemedi.',
    };
  }
}

function tusHeaders(offset: number): Record<string, string> {
  return {
    'Tus-Resumable': '1.0.0',
    'Upload-Offset': String(offset),
    'Content-Type': 'application/offset+octet-stream',
  };
}

async function readTusOffset(uploadUrl: string): Promise<number> {
  try {
    const response = await fetch(uploadUrl, {
      method: 'HEAD',
      headers: { 'Tus-Resumable': '1.0.0' },
    });
    const value = Number(response.headers.get('Upload-Offset') ?? 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

async function uploadWebResumable(
  uploadUrl: string,
  file: Blob,
  sizeBytes: number,
  onProgress: (progress: VvUploadProgress) => void,
): Promise<void> {
  let offset = await readTusOffset(uploadUrl);
  while (offset < sizeBytes) {
    const end = Math.min(offset + TUS_CHUNK_BYTES, sizeBytes);
    const chunk = file.slice(offset, end);
    const response = await fetch(uploadUrl, {
      method: 'PATCH',
      headers: tusHeaders(offset),
      body: chunk,
    });
    if (!response.ok) {
      throw new Error(`Yükleme parçası reddedildi (${response.status}).`);
    }
    const serverOffset = Number(response.headers.get('Upload-Offset') ?? end);
    offset = Number.isFinite(serverOffset) && serverOffset > offset ? serverOffset : end;
    onProgress({ sentBytes: offset, totalBytes: sizeBytes, phase: 'uploading' });
  }
}

async function uploadNativeResumable(
  uploadUrl: string,
  uri: string,
  sizeBytes: number,
  onProgress: (progress: VvUploadProgress) => void,
): Promise<void> {
  const source = new File(uri);
  const handle = source.open();
  try {
    let offset = await readTusOffset(uploadUrl);
    if (offset > sizeBytes) offset = 0;
    handle.offset = offset;

    while (offset < sizeBytes) {
      const remaining = sizeBytes - offset;
      const bytes = handle.readBytes(Math.min(TUS_CHUNK_BYTES, remaining));
      if (bytes.length === 0) break;

      const chunkFile = new File(Paths.cache, `vv-tus-${offset}-${Date.now()}.part`);
      chunkFile.write(bytes);
      try {
        const task = chunkFile.createUploadTask(uploadUrl, {
          httpMethod: 'PATCH',
          uploadType: UploadType.BINARY_CONTENT,
          headers: tusHeaders(offset),
          mimeType: 'application/octet-stream',
          onProgress: ({ bytesSent }) => {
            onProgress({
              sentBytes: offset + bytesSent,
              totalBytes: sizeBytes,
              phase: 'uploading',
            });
          },
        });
        const result = await task.uploadAsync();
        if (!result || result.status < 200 || result.status >= 300) {
          throw new Error(`Yükleme parçası reddedildi (${result?.status ?? 0}).`);
        }
      } finally {
        try {
          chunkFile.delete();
        } catch {
          // geçici dosya zaten silinmiş olabilir
        }
      }

      offset += bytes.length;
      onProgress({ sentBytes: offset, totalBytes: sizeBytes, phase: 'uploading' });
    }
  } finally {
    handle.close();
  }
}

async function uploadWebMultipart(
  uploadUrl: string,
  file: Blob,
  fileName: string,
  sizeBytes: number,
  onProgress: (progress: VvUploadProgress) => void,
): Promise<void> {
  const form = new FormData();
  form.append('file', file, fileName);
  onProgress({ sentBytes: 0, totalBytes: sizeBytes, phase: 'uploading' });
  const response = await fetch(uploadUrl, { method: 'POST', body: form });
  if (!response.ok) throw new Error(`Video yüklenemedi (${response.status}).`);
  onProgress({ sentBytes: sizeBytes, totalBytes: sizeBytes, phase: 'finalizing' });
}

async function uploadNativeMultipart(
  uploadUrl: string,
  uri: string,
  mimeType: string,
  sizeBytes: number,
  onProgress: (progress: VvUploadProgress) => void,
): Promise<void> {
  const file = new File(uri);
  const task = file.createUploadTask(uploadUrl, {
    httpMethod: 'POST',
    uploadType: UploadType.MULTIPART,
    fieldName: 'file',
    mimeType,
    onProgress: ({ bytesSent, totalBytes }) => {
      onProgress({
        sentBytes: bytesSent,
        totalBytes: totalBytes > 0 ? totalBytes : sizeBytes,
        phase: 'uploading',
      });
    },
  });
  const result = await task.uploadAsync();
  if (!result || result.status < 200 || result.status >= 300) {
    throw new Error(`Video yüklenemedi (${result?.status ?? 0}).`);
  }
  onProgress({ sentBytes: sizeBytes, totalBytes: sizeBytes, phase: 'finalizing' });
}

/** Mux direct upload: dosyanın tamamı tek PUT ile akıtılır. */
async function uploadWebPut(
  uploadUrl: string,
  file: Blob,
  mimeType: string,
  sizeBytes: number,
  onProgress: (progress: VvUploadProgress) => void,
): Promise<void> {
  onProgress({ sentBytes: 0, totalBytes: sizeBytes, phase: 'uploading' });
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType || 'video/mp4' },
    body: file,
  });
  if (!response.ok) throw new Error(`Video yüklenemedi (${response.status}).`);
  onProgress({ sentBytes: sizeBytes, totalBytes: sizeBytes, phase: 'finalizing' });
}

async function uploadNativePut(
  uploadUrl: string,
  uri: string,
  mimeType: string,
  sizeBytes: number,
  onProgress: (progress: VvUploadProgress) => void,
): Promise<void> {
  const file = new File(uri);
  const task = file.createUploadTask(uploadUrl, {
    httpMethod: 'PUT',
    uploadType: UploadType.BINARY_CONTENT,
    mimeType: mimeType || 'video/mp4',
    onProgress: ({ bytesSent, totalBytes }) => {
      onProgress({
        sentBytes: bytesSent,
        totalBytes: totalBytes > 0 ? totalBytes : sizeBytes,
        phase: 'uploading',
      });
    },
  });
  const result = await task.uploadAsync();
  if (!result || result.status < 200 || result.status >= 300) {
    throw new Error(`Video yüklenemedi (${result?.status ?? 0}).`);
  }
  onProgress({ sentBytes: sizeBytes, totalBytes: sizeBytes, phase: 'finalizing' });
}

/**
 * Videoyu yükleme sağlayıcısına gönderir.
 *  - Bilet `vv-stream-create-upload` tarafından üretilir; istemci hiçbir
 *    sağlayıcı anahtarı görmez.
 *  - Cloudflare Stream: 8 MB ve üzeri dosyalarda Tus parçalı (resumable)
 *    akış, küçük dosyalarda tek istekli direct upload.
 *  - Mux: tek `PUT` ile akış (Mux parçalı yükleme sunmaz).
 */
export async function uploadVvVideo(input: {
  videoId: string;
  video: VvPickedVideo;
  maxDurationSeconds?: number;
  onProgress: (progress: VvUploadProgress) => void;
}): Promise<{ error: string | null }> {
  const { videoId, video, onProgress } = input;

  try {
    const useResumable = video.sizeBytes >= TUS_CHUNK_BYTES;
    onProgress({ sentBytes: 0, totalBytes: video.sizeBytes, phase: 'preparing' });

    const ticket = await createVvStreamUpload({
      videoId,
      mode: useResumable ? 'resumable' : 'multipart',
      sizeBytes: useResumable ? video.sizeBytes : undefined,
      fileName: video.fileName,
      maxDurationSeconds: input.maxDurationSeconds,
    });

    if (ticket.error || !ticket.data?.uploadUrl) {
      // Yükleme başlatılamadı — kayıt stüdyoda “başarısız” görünsün.
      await failVvVideo(videoId);
      return { error: ticket.error ?? 'Yükleme adresi alınamadı.' };
    }

    /** Mux direct upload: tek PUT (parçalı akış yok). */
    const usePut =
      ticket.data.uploadMethod === 'PUT' || ticket.data.provider === 'mux';

    if (usePut) {
      if (Platform.OS === 'web') {
        const blob = video.webFile;
        if (!blob) return { error: 'Tarayıcıda video dosyası okunamadı.' };
        await uploadWebPut(
          ticket.data.uploadUrl,
          blob,
          video.mimeType,
          video.sizeBytes || blob.size,
          onProgress,
        );
      } else {
        await uploadNativePut(
          ticket.data.uploadUrl,
          video.uri,
          video.mimeType,
          video.sizeBytes,
          onProgress,
        );
      }
    } else if (ticket.data.mode === 'resumable') {
      if (Platform.OS === 'web') {
        const blob = video.webFile;
        if (!blob) return { error: 'Tarayıcıda video dosyası okunamadı.' };
        await uploadWebResumable(
          ticket.data.uploadUrl,
          blob,
          video.sizeBytes || blob.size,
          onProgress,
        );
      } else {
        await uploadNativeResumable(
          ticket.data.uploadUrl,
          video.uri,
          video.sizeBytes,
          onProgress,
        );
      }
    } else if (Platform.OS === 'web') {
      const blob = video.webFile;
      if (!blob) return { error: 'Tarayıcıda video dosyası okunamadı.' };
      await uploadWebMultipart(
        ticket.data.uploadUrl,
        blob,
        video.fileName,
        video.sizeBytes || blob.size,
        onProgress,
      );
    } else {
      await uploadNativeMultipart(
        ticket.data.uploadUrl,
        video.uri,
        video.mimeType,
        video.sizeBytes,
        onProgress,
      );
    }

    return { error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Video yüklenemedi.';
    await failVvVideo(videoId);
    return { error: message };
  }
}

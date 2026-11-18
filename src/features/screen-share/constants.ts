export const SCREEN_SHARE_FEATURE = {
  id: 'screen-share',
  label: 'Sesli Oda',
} as const;

/** Modern teal — şehir sisteminden bağımsız marka rengi */
export const SCREEN_SHARE_ACCENT = '#00C2A8';

export const SCREEN_SHARE_DRM_HINT =
  'Netflix vb. korumalı uygulamalar siyah görünebilir (işletim sistemi kısıtı).';

export const SCREEN_SHARE_HUB_ROUTE = '/screen-share';
export const screenShareSessionPath = (sessionId: string) => `/screen-share/${sessionId}` as const;

/** Akıcı izleme: 720p / 15fps / düşük bitrate — donmayı azaltır */
export const SCREEN_SHARE_CAPTURE = {
  resolution: { width: 1280, height: 720, frameRate: 15 },
  contentHint: 'detail' as const,
};

export const SCREEN_SHARE_PUBLISH = {
  videoCodec: 'h264' as const,
  screenShareEncoding: {
    maxBitrate: 1_500_000,
    maxFramerate: 15,
  },
};

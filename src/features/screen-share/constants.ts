export const SCREEN_SHARE_FEATURE = {
  id: 'screen-share',
  label: 'Sesli Oda',
} as const;

/** Modern teal — şehir sisteminden bağımsız marka rengi */
export const SCREEN_SHARE_ACCENT = '#00C2A8';

/** Oda zemin / status bar / header — tek renk (üst şerit siyah kalmasın) */
export const SCREEN_SHARE_ROOM_BG = '#0E1420';

export const SCREEN_SHARE_DRM_HINT =
  'Netflix vb. korumalı uygulamalar siyah görünebilir (işletim sistemi kısıtı).';

export const SCREEN_SHARE_HUB_ROUTE = '/screen-share';
export const screenShareSessionPath = (sessionId: string) => `/screen-share/${sessionId}` as const;

/** Akıcı izleme: motion + orta bitrate — donma/titreme azaltır */
export const SCREEN_SHARE_CAPTURE = {
  resolution: { width: 1280, height: 720, frameRate: 18 },
  contentHint: 'motion' as const,
};

export const SCREEN_SHARE_PUBLISH = {
  videoCodec: 'h264' as const,
  screenShareEncoding: {
    maxBitrate: 1_400_000,
    maxFramerate: 18,
  },
};

/** Varsayılan lounge atmosferi (film/YouTube yokken) */
export const SCREEN_SHARE_LOUNGE_THEME = {
  id: 'vora_night',
  label: 'Vora Gece Odası',
} as const;

import type { Ionicons } from '@expo/vector-icons';

/**
 * Bahşiş verilebilen yüzeyler. Sunucudaki `public.tip_default_surfaces()`
 * listesiyle birebir aynı olmalıdır.
 */
export const TIP_SURFACES = [
  'profile',
  'post',
  'reel',
  'story',
  'message',
  'voice_room',
  'video',
  'other',
] as const;

export type TipSurface = (typeof TIP_SURFACES)[number];

export type TipPreferences = Record<TipSurface, boolean>;

export const TIP_DEFAULT_PREFERENCES: TipPreferences = {
  profile: true,
  post: true,
  reel: true,
  story: true,
  message: true,
  voice_room: true,
  video: true,
  other: true,
};

export type TipSurfaceMeta = {
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
};

/** Ayarlar ekranındaki satırlar ve bölüm açıklamaları. */
export const TIP_SURFACE_META: Record<TipSurface, TipSurfaceMeta> = {
  profile: {
    label: 'Profil',
    description: 'Profilindeki bahşiş butonu görünür kalır.',
    icon: 'person-circle-outline',
  },
  post: {
    label: 'Gönderi kartları',
    description: 'Akıştaki gönderilerin altında bahşiş butonu görünür.',
    icon: 'documents-outline',
  },
  reel: {
    label: 'Reels',
    description: 'Reels oynatıcısındaki bahşiş butonu görünür.',
    icon: 'play-circle-outline',
  },
  story: {
    label: 'Hikâyeler',
    description: 'Hikâye görüntüleyicideki bahşiş butonu görünür.',
    icon: 'images-outline',
  },
  message: {
    label: 'Mesajlar',
    description: 'Birebir sohbet başlığındaki bahşiş butonu görünür.',
    icon: 'chatbubble-ellipses-outline',
  },
  voice_room: {
    label: 'Sesli odalar',
    description: 'Sesli odadaki konuşmacı kartlarında bahşiş butonu görünür.',
    icon: 'mic-outline',
  },
  video: {
    label: 'Sahne videoları',
    description: 'Sahne video kartları ve izleme ekranındaki buton görünür.',
    icon: 'videocam-outline',
  },
  other: {
    label: 'Diğer alanlar',
    description: 'Yeni eklenen bölümler için varsayılan tercih.',
    icon: 'grid-outline',
  },
};

export const TIP_GRADIENT = ['#FF8A65', '#E53935'] as const;
export const TIP_ACCENT = '#E53935';
export const TIP_PRESETS_MINOR = [5000, 10000, 25000, 50000] as const;
export const TIP_CURRENCY = 'try';
export const TIP_SETTINGS_ROUTE = '/settings/tipping';

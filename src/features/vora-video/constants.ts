import type { CenterDef } from '@/features/centers/types';

/**
 * Vora Video bağımsız modül tanımı.
 * Sosyal feed gönderilerinden ayrı veri modeli ve ayrı rota ağacı kullanır.
 * Görünen ad `Sahne`; rota, tablo ve Edge Function adları `vora-video` olarak kalır.
 */
export const VORA_VIDEO_CENTER_DEF: CenterDef = {
  id: 'vora-video',
  section: 61,
  route: '/vora-video',
  title: 'Sahne',
  subtitle: 'Uzun videolar, vloglar ve içerik üreticisi kazançları',
  icon: 'videocam',
  accent: '#E53935',
  group: 'media',
  hasCreate: true,
};

export const VV_ACCENT = '#E53935';
export const VV_ACCENT_DARK = '#B71C1C';
export const VV_BADGE_LABEL = 'Sahne';
export const VV_CURRENCY = 'TRY';
export const VV_COMMISSION_BP_DEFAULT = 3000;
export const VV_CREATOR_SHARE_BP_DEFAULT = 7000;
export const VV_PAYOUT_PERIOD_DAYS = 15;

/** Sunucu ayarları okunamazsa yalnızca gösterim için kullanılır; ödeme hesabı istemcide yapılmaz. */
export const VV_TIP_PRESETS_MINOR = [5000, 10000, 25000, 50000] as const;

export const VV_PLAYER_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export const VV_CHECKPOINT_INTERVAL_MS = 15_000;
export const VV_MIN_CHECKPOINT_DELTA_SECONDS = 4;

export const VV_CATEGORY_FALLBACK = [
  { id: 'camp-nature', label: 'Kamp ve Doğa', icon: 'bonfire-outline' },
  { id: 'travel', label: 'Gezi ve Seyahat', icon: 'airplane-outline' },
  { id: 'daily-life', label: 'Günlük Yaşam', icon: 'sunny-outline' },
  { id: 'vlog', label: 'Vlog', icon: 'videocam-outline' },
  { id: 'food', label: 'Yemek', icon: 'restaurant-outline' },
  { id: 'tech', label: 'Teknoloji', icon: 'hardware-chip-outline' },
  { id: 'auto-moto', label: 'Otomobil ve Motosiklet', icon: 'car-sport-outline' },
  { id: 'education', label: 'Eğitim', icon: 'school-outline' },
  { id: 'sports', label: 'Spor', icon: 'basketball-outline' },
  { id: 'entertainment', label: 'Eğlence', icon: 'happy-outline' },
  { id: 'music', label: 'Müzik', icon: 'musical-notes-outline' },
  { id: 'gaming', label: 'Oyun', icon: 'game-controller-outline' },
  { id: 'diy', label: 'Kendin Yap', icon: 'hammer-outline' },
  { id: 'other', label: 'Diğer', icon: 'ellipsis-horizontal-outline' },
] as const;

export const VV_HOME_SCOPES = [
  { id: 'home', label: 'Sana Özel' },
  { id: 'popular', label: 'Popüler Videolar' },
  { id: 'new', label: 'Yeni Yüklenenler' },
  { id: 'vlogs', label: 'Çok İzlenen Vloglar' },
  { id: 'following', label: 'Takip Ettiklerim' },
] as const;

export const VV_STATUS_LABELS: Record<string, string> = {
  draft: 'Taslak',
  uploading: 'Yükleniyor',
  processing: 'İşleniyor',
  ready: 'Yayına hazır',
  published: 'Yayınlandı',
  failed: 'Hata oluştu',
  removed: 'Kaldırıldı',
};

export const VV_VISIBILITY_LABELS: Record<string, string> = {
  public: 'Herkese açık',
  unlisted: 'Bağlantı ile',
  private: 'Yalnızca ben',
};

export const VV_PAYOUT_STATUS_LABELS: Record<string, string> = {
  pending: 'Bekliyor',
  processing: 'İşleniyor',
  paid: 'Ödeme tamamlandı',
  failed: 'Başarısız',
  held: 'Geçici olarak bekletiliyor',
  reversed: 'Geri alındı',
};

export const VV_STRIPE_STATUS_LABELS: Record<string, string> = {
  not_connected: 'Stripe hesabı bağlı değil',
  onboarding_incomplete: 'Stripe doğrulaması tamamlanmadı',
  ready: 'Ödeme almaya hazır',
  rejected: 'Stripe hesabı reddedildi',
};

export const VV_TIP_STATUS_LABELS: Record<string, string> = {
  pending: 'Ödeme bekliyor',
  requires_action: 'İşlem gerekiyor',
  succeeded: 'Tamamlandı',
  failed: 'Başarısız',
  refunded: 'İade edildi',
  partially_refunded: 'Kısmen iade',
  disputed: 'İtiraz edildi',
};

export const VV_UNCONFIGURED_NOTES = {
  payments:
    'Bahşiş ödemeleri, yönetici Stripe ayarlarını ve sunucu tarafı doğrulamayı tamamlayana kadar kapalıdır. Kapalıyken uygulama ödeme başlatmaz.',
  payoutTiming:
    'Platform her 15 günde bir Stripe Transfer başlatır. Banka hesabına ulaşma süresi Stripe’ın ülke, doğrulama ve kullanılabilir bakiye koşullarına bağlıdır.',
  stream:
    'Video yükleme adresi yalnızca sunucu tarafındaki Edge Function tarafından üretilir. Oynatma, sağlayıcıya göre (Cloudflare Stream veya Mux) HLS olarak yapılır.',
} as const;

/** Uygulama içi rota yardımcıları — tek yerde tutulur. */
export const VV_ROUTES = {
  home: '/vora-video',
  explore: '/vora-video/explore',
  upload: '/vora-video/upload',
  studio: '/vora-video/studio',
  wallet: '/vora-video/wallet',
  tips: '/vora-video/tips',
  library: '/vora-video/library',
  watch: (id: string) => `/vora-video/watch/${id}`,
  creator: (id: string) => `/vora-video/creator/${id}`,
  analytics: (id: string) => `/vora-video/analytics/${id}`,
} as const;

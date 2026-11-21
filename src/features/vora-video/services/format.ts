/** Vora Video için saf biçimlendirme yardımcıları. Ağ/DB erişimi yoktur. */

import { getMuxPlaybackUrl, getMuxThumbnailUrl } from '@/lib/mux/urls';

export function vvFormatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || !Number.isFinite(totalSeconds)) {
    return '--:--';
  }
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function vvFormatCount(value: number | null | undefined): string {
  const safe = Number.isFinite(value ?? NaN) ? Math.max(0, Number(value)) : 0;
  if (safe < 1000) return String(Math.floor(safe));
  if (safe < 1_000_000) {
    return `${(safe / 1000).toFixed(1).replace(/\.0$/, '').replace('.', ',')} B`;
  }
  if (safe < 1_000_000_000) {
    return `${(safe / 1_000_000).toFixed(1).replace(/\.0$/, '').replace('.', ',')} Mn`;
  }
  return `${(safe / 1_000_000_000).toFixed(1).replace(/\.0$/, '').replace('.', ',')} Mr`;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  TRY: '₺',
  USD: '$',
  EUR: '€',
  GBP: '£',
};

/** Sunucudan gelen kuruş tutarını okunabilir metne çevirir. */
export function vvFormatMoney(minor: number | null | undefined, currency = 'TRY'): string {
  const safe = Number.isFinite(minor ?? NaN) ? Number(minor) : 0;
  const value = safe / 100;
  const formatted = value.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const code = currency.toUpperCase();
  const symbol = CURRENCY_SYMBOLS[code];
  return symbol ? `${formatted} ${symbol}` : `${formatted} ${code}`;
}

export function vvFormatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function vvFormatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function vvRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'az önce';
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} gün önce`;
  if (days < 30) return `${Math.floor(days / 7)} hafta önce`;
  if (days < 365) return `${Math.floor(days / 30)} ay önce`;
  return `${Math.floor(days / 365)} yıl önce`;
}

export function vvProgressPercent(
  positionSeconds: number | null | undefined,
  durationSeconds: number | null | undefined,
): number {
  if (!positionSeconds || !durationSeconds || durationSeconds <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((positionSeconds / durationSeconds) * 100)));
}

/**
 * Bahşiş ön izlemesi. Kesin tutar her zaman sunucudaki `vv_prepare_tip`
 * fonksiyonunda hesaplanır; burada yalnızca arayüz bilgilendirmesi yapılır.
 */
export function vvTipPreview(amountMinor: number, commissionBp: number): {
  commissionMinor: number;
  creatorMinor: number;
} {
  const safeAmount = Math.max(0, Math.floor(amountMinor));
  const safeBp = Math.min(10_000, Math.max(0, Math.floor(commissionBp)));
  const commissionMinor = Math.floor((safeAmount * safeBp) / 10_000);
  return { commissionMinor, creatorMinor: safeAmount - commissionMinor };
}

/**
 * Vora Video oynatma sağlayıcısı.
 * `vv_videos.provider` alanından gelir; şu an Cloudflare Stream ve Mux desteklenir.
 */
export type VvPlaybackProvider = 'cloudflare_stream' | 'mux' | string | null | undefined;

/** Sağlayıcıya göre HLS oynatma adresi. */
export function vvHlsUrl(
  playbackId: string | null | undefined,
  provider?: VvPlaybackProvider,
): string | null {
  const id = playbackId?.trim();
  if (!id) return null;
  if (provider === 'mux') return getMuxPlaybackUrl(id);
  return `https://videodelivery.net/${id}/manifest/video.m3u8`;
}

export function vvThumbnailUrl(
  playbackId: string | null | undefined,
  timeSeconds = 1,
  provider?: VvPlaybackProvider,
): string | null {
  const id = playbackId?.trim();
  if (!id) return null;
  const time = Math.max(0, Math.floor(timeSeconds));
  if (provider === 'mux') return getMuxThumbnailUrl(id, time);
  return `https://videodelivery.net/${id}/thumbnails/thumbnail.jpg?time=${time}s`;
}

/** "1–15 Kasım 2026" biçiminde dönem etiketi. Tarihler YYYY-MM-DD'dir. */
export function vvFormatPeriod(start: string, end: string): string {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return '—';
  const startDay = startDate.getDate();
  const endDay = endDate.getDate();
  const month = endDate.toLocaleDateString('tr-TR', { month: 'long' });
  const year = endDate.getFullYear();
  return `${startDay}–${endDay} ${month} ${year}`;
}

export function vvRemainingDays(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  const diff = target - Date.now();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

/** "3 sa 12 dk" biçiminde toplam izlenme süresi. */
export function vvFormatWatchTime(totalSeconds: number | null | undefined): string {
  const safe = Number.isFinite(totalSeconds ?? NaN) ? Math.max(0, Math.floor(Number(totalSeconds))) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours > 0) return `${hours} sa ${minutes} dk`;
  if (minutes > 0) return `${minutes} dk`;
  return `${safe} sn`;
}

import {
  CHAT_WALLPAPER_COLORS,
  type ChatWallpaperColor,
} from '@/features/messaging/constants/chatWallpapers';

export type ChatBubbleColor = ChatWallpaperColor;

/** Baloncuk paleti — şeffaf + tüm arka plan renkleri */
export const CHAT_BUBBLE_COLORS: ChatBubbleColor[] = [
  { id: 'default', hex: '', label: 'Tema varsayılanı' },
  { id: 'transparent', hex: 'transparent', label: 'Şeffaf' },
  ...CHAT_WALLPAPER_COLORS.filter((c) => c.id !== 'default'),
];

export const CHAT_BUBBLE_DEFAULT = 'default';

export function chatBubbleById(id: string | null | undefined): ChatBubbleColor {
  const hit = CHAT_BUBBLE_COLORS.find((c) => c.id === id);
  return (
    hit ??
    CHAT_BUBBLE_COLORS.find((c) => c.id === CHAT_BUBBLE_DEFAULT) ??
    CHAT_BUBBLE_COLORS[0]!
  );
}

/** #RRGGBB → 0–1 luminance */
export function hexLuminance(hex: string): number | null {
  const raw = hex.replace('#', '').trim();
  if (raw.length !== 6) return null;
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastTextForHex(hex: string): { text: string; meta: string } {
  const lum = hexLuminance(hex);
  if (lum == null || lum > 0.62) {
    return { text: '#0F172A', meta: 'rgba(15,23,42,0.55)' };
  }
  return { text: '#FFFFFF', meta: 'rgba(255,255,255,0.72)' };
}

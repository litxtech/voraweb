/**
 * Ana mesajlaşma sohbet arka plan paleti — sırayı / renkleri buradan değiştir.
 * Varsayılan: gece (koyu).
 */
export type ChatWallpaperColor = {
  id: string;
  hex: string;
  label: string;
};

export const CHAT_WALLPAPER_COLORS: ChatWallpaperColor[] = [
  { id: 'pink', hex: '#F7A8C8', label: 'Pembe' },
  { id: 'powder_pink', hex: '#FADADD', label: 'Pudra pembe' },
  { id: 'baby_pink', hex: '#FFD6E7', label: 'Bebek pembe' },
  { id: 'blush', hex: '#F9C5D1', label: 'Allık' },
  { id: 'sakura', hex: '#FFB7C5', label: 'Sakura' },
  { id: 'rose', hex: '#FF8FAB', label: 'Gül' },
  { id: 'soft_rose', hex: '#E8A0BF', label: 'Yumuşak gül' },
  { id: 'dusty_rose', hex: '#D4A5A5', label: 'Toz gül' },
  { id: 'bubblegum', hex: '#FF6EB4', label: 'Sakız' },
  { id: 'hot_pink', hex: '#FF5C8A', label: 'Canlı pembe' },
  { id: 'barbie', hex: '#FC46AA', label: 'Barbie' },
  { id: 'flamingo', hex: '#FC8EAC', label: 'Flamingo' },
  { id: 'watermelon', hex: '#FC6C85', label: 'Karpuz' },
  { id: 'candy', hex: '#FF85A2', label: 'Şeker' },
  { id: 'magenta', hex: '#E85D9A', label: 'Macenta' },
  { id: 'deep_rose', hex: '#C9184A', label: 'Koyu gül' },
  { id: 'raspberry', hex: '#E0115F', label: 'Ahududu' },
  { id: 'fuchsia', hex: '#D946A8', label: 'Fuşya' },
  { id: 'orchid', hex: '#DA70D6', label: 'Orkide' },
  { id: 'lavender_pink', hex: '#E8B4D4', label: 'Lavanta pembe' },
  { id: 'mauve', hex: '#C9A9B8', label: 'Mauve' },
  { id: 'lilac', hex: '#C9B1FF', label: 'Lila' },
  { id: 'violet', hex: '#9B6DFF', label: 'Menekşe' },
  { id: 'purple', hex: '#7C3AED', label: 'Mor' },
  { id: 'plum', hex: '#6B3A6B', label: 'Erik' },
  { id: 'sky', hex: '#7DD3FC', label: 'Gök' },
  { id: 'azure', hex: '#38BDF8', label: 'Azure' },
  { id: 'ocean', hex: '#0EA5E9', label: 'Okyanus' },
  { id: 'navy', hex: '#1E3A5F', label: 'Lacivert' },
  { id: 'teal', hex: '#2DD4BF', label: 'Teal' },
  { id: 'mint', hex: '#A7F3D0', label: 'Nane' },
  { id: 'seafoam', hex: '#5EEAD4', label: 'Deniz köpüğü' },
  { id: 'lime', hex: '#BEF264', label: 'Lime' },
  { id: 'grass', hex: '#4ADE80', label: 'Çimen' },
  { id: 'forest', hex: '#166534', label: 'Orman' },
  { id: 'olive', hex: '#84CC16', label: 'Zeytin' },
  { id: 'cream', hex: '#FEF3C7', label: 'Krem' },
  { id: 'sun', hex: '#FDE047', label: 'Güneş' },
  { id: 'amber', hex: '#FBBF24', label: 'Kehribar' },
  { id: 'orange', hex: '#FB923C', label: 'Turuncu' },
  { id: 'coral', hex: '#FF7F6A', label: 'Mercan' },
  { id: 'peach', hex: '#FDBA74', label: 'Şeftali' },
  { id: 'red', hex: '#F87171', label: 'Kırmızı' },
  { id: 'crimson', hex: '#DC2626', label: 'Kızıl' },
  { id: 'wine', hex: '#7F1D1D', label: 'Şarap' },
  { id: 'white', hex: '#F8FAFC', label: 'Beyaz' },
  { id: 'silver', hex: '#CBD5E1', label: 'Gümüş' },
  { id: 'slate', hex: '#64748B', label: 'Arduvaz' },
  { id: 'charcoal', hex: '#1E293B', label: 'Kömür' },
  { id: 'black', hex: '#0B0F16', label: 'Siyah' },
  { id: 'night', hex: '#0A1018', label: 'Gece' },
  { id: 'brown', hex: '#92400E', label: 'Kahve' },
  { id: 'sand', hex: '#E7D5C4', label: 'Kum' },
  { id: 'taupe', hex: '#A8A29E', label: 'Taupe' },
  { id: 'default', hex: '', label: 'Tema varsayılanı' },
];

export const CHAT_WALLPAPER_DEFAULT = 'night';

export function chatWallpaperById(id: string | null | undefined): ChatWallpaperColor {
  const hit = CHAT_WALLPAPER_COLORS.find((c) => c.id === id);
  return (
    hit ??
    CHAT_WALLPAPER_COLORS.find((c) => c.id === CHAT_WALLPAPER_DEFAULT) ??
    CHAT_WALLPAPER_COLORS[0]!
  );
}

/**
 * Sesli oda yetki modeli
 *
 * - Oda admini (sahip): her şeyi yapar; aşağıdaki yetkileri başkasına verebilir.
 * - Lider koltuğu: yalnızca admin veya “Lider” yetkisi verilen kişi oturur.
 * - Diğer üyeler: grid koltuk + (verildiyse) mik / ekran.
 */
export const SCREEN_SHARE_ROOM_PERMISSIONS = [
  {
    id: 'leader',
    label: 'Lider',
    description:
      'Lider koltuğu, ekran paylaşımı, YouTube, mik/koltuk moderasyonu. Profil → Lider yetkisi ver.',
  },
  {
    id: 'mic',
    label: 'Mikrofon',
    description: 'Konuşma izni. Profil → Mik izni ver.',
  },
  {
    id: 'screen',
    label: 'Ekran paylaşımı',
    description:
      'Lider olmadan ekran paylaşabilir. Profil → Ekran izni ver. Admin ve lider zaten paylaşabilir.',
  },
] as const;

export type ScreenShareRoomPermissionId =
  (typeof SCREEN_SHARE_ROOM_PERMISSIONS)[number]['id'];

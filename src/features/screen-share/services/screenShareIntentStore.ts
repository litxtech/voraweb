/**
 * Host “Ekran”a bastıktan sonra paylaşım niyeti.
 * App arka plana gidip film açılınca / dönünce keep-alive bunu kullanır.
 * Yalnızca bilinçli Durdur ile temizlenir.
 */
let shareIntent = false;

export function markScreenShareIntent(): void {
  shareIntent = true;
}

export function clearScreenShareIntent(): void {
  shareIntent = false;
}

export function hasScreenShareIntent(): boolean {
  return shareIntent;
}

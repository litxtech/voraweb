/**
 * Hikâye izleyicide "aşağı çekip kapat" animasyonunun ayarları.
 *
 * Tüm değerler worklet'tir: sürükleme ve bırakma sırasında JS thread'e
 * geçilmeden, UI thread'de tek karede hesaplanır (takılma/titreme olmaz).
 */

export const STORY_DISMISS = {
  /** Bu mesafeyi geçen aşağı çekme kapatır (px). */
  distance: 84,
  /** Çok kısa ama hızlı çekme: bu hız + mesafe birleşince kapatır. */
  quickDistance: 26,
  quickVelocity: 1150,
  /** Kapanma animasyonu süresi sınırları (ms) — IG gibi hızlı. */
  minCloseMs: 130,
  maxCloseMs: 230,
  /** Kapanma sırasında kartın küçüleceği son ölçek. */
  minScale: 0.9,
  /** Ölçeğin tamamlandığı sürükleme mesafesi (ekran yüksekliği oranı). */
  scaleSpanRatio: 0.42,
  /** Opaklığın sıfıra indiği sürükleme mesafesi (ekran yüksekliği oranı). */
  fadeSpanRatio: 0.5,
} as const;

/** Kart ölçeği: sürükleme ilerledikçe 1 → minScale. */
export function dismissScale(y: number, screenHeight: number): number {
  'worklet';
  if (y <= 0) return 1;
  const span = Math.max(1, screenHeight * STORY_DISMISS.scaleSpanRatio);
  const progress = Math.min(1, y / span);
  return 1 - progress * (1 - STORY_DISMISS.minScale);
}

/** Kart opaklığı: sürükleme ilerledikçe 1 → 0 (IG gibi yumuşak kaybolur). */
export function dismissOpacity(y: number, screenHeight: number): number {
  'worklet';
  if (y <= 0) return 1;
  const span = Math.max(1, screenHeight * STORY_DISMISS.fadeSpanRatio);
  return 1 - Math.min(1, y / span);
}

/** Bırakıldığında kapatmalı mı? */
export function shouldDismissOnRelease(translationY: number, velocityY: number): boolean {
  'worklet';
  if (translationY <= 0) return false;
  if (translationY >= STORY_DISMISS.distance) return true;
  return translationY >= STORY_DISMISS.quickDistance && velocityY >= STORY_DISMISS.quickVelocity;
}

/**
 * Kapanma süresi: parmak hızı kadar hızlı. Hızlı savurma → kısa süre,
 * yavaş bırakma → üst sınır (yine de 230ms'i geçmez).
 */
export function dismissCloseDuration(
  currentY: number,
  screenHeight: number,
  velocityY: number,
): number {
  'worklet';
  const remaining = Math.max(0, screenHeight - Math.max(0, currentY));
  // Asgari hız: parmak neredeyse durmuşsa bile animasyon sürüklenmesin.
  const speed = Math.max(velocityY, 520);
  const raw = (remaining / speed) * 1000;
  if (raw < STORY_DISMISS.minCloseMs) return STORY_DISMISS.minCloseMs;
  if (raw > STORY_DISMISS.maxCloseMs) return STORY_DISMISS.maxCloseMs;
  return raw;
}

/** Geri dönüş yayı: parmak hızı korunur → kopukluk/titreme hissi olmaz. */
export const STORY_DISMISS_SPRING = {
  damping: 27,
  stiffness: 330,
  mass: 0.72,
} as const;
